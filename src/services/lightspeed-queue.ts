import { Op } from 'sequelize';
import cron, { ScheduledTask } from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import config from '@/config';
import sequelize from '@/database/connection';
import logger from '@/utils/logger';
import {
  LightspeedSyncJob,
  LightspeedSyncState,
  LightspeedSchedulerJob,
  ProductImage,
  Order,
  OrderItem,
  InventoryReservation,
  Product,
  ProductInventory,
  PaymentTransaction,
} from '@/database/models';
import { LightspeedService } from './lightspeed';

let isWorkerRunning = false;
let workerIntervalId: NodeJS.Timeout | null = null;
let watchdogIntervalId: NodeJS.Timeout | null = null;
const activeCronTasks: { [key: string]: ScheduledTask } = {};

export class LightspeedQueue {
  /**
   * Processes the next available event in the queue.
   * Employs "SELECT FOR UPDATE SKIP LOCKED" database transaction for safety.
   */
  public static async processNextJob(workerId: string): Promise<boolean> {
    let job: LightspeedSyncJob | null = null;
    const transaction = await sequelize.transaction();

    try {
      // Find one pending job whose execution time has arrived
      job = await LightspeedSyncJob.findOne({
        where: {
          status: { [Op.in]: ['pending', 'retry'] },
          run_at: { [Op.lte]: new Date() },
        },
        order: [['id', 'ASC']],
        lock: true,
        skipLocked: true,
        transaction,
      });

      if (!job) {
        await transaction.commit();
        return false; // Queue is empty or all tasks are locked/future scheduled
      }

      logger.info(`Worker ${workerId} claiming sync job ID ${job.id} (Type: ${job.job_type})`);
      job.status = 'processing';
      job.locked_by = workerId;
      job.locked_at = new Date();
      job.attempts += 1;
      await job.save({ transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      logger.error('Error during processNextJob claiming transaction:', err);
      throw err;
    }

    // Run job handler outside transaction for network safety and connection pool preservation
    let executionError: any = null;
    try {
      await this.handleJob(job);
    } catch (error: any) {
      executionError = error;
    }

    // Update job result in a separate quick transaction
    const updateTransaction = await sequelize.transaction();
    try {
      const jobToUpdate = await LightspeedSyncJob.findByPk(job.id, {
        lock: true,
        transaction: updateTransaction,
      });

      if (jobToUpdate) {
        jobToUpdate.locked_by = null;
        jobToUpdate.locked_at = null;

        if (!executionError) {
          jobToUpdate.status = 'done';
          jobToUpdate.error_message = null;
          await jobToUpdate.save({ transaction: updateTransaction });
          logger.info(`Successfully completed and updated sync job ID ${job.id}`);
        } else {
          const errorMsg = executionError instanceof Error ? executionError.message : String(executionError);
          logger.error(`Error processing sync job ID ${job.id}: ${errorMsg}`);

          jobToUpdate.error_message = errorMsg;

          if (jobToUpdate.attempts < jobToUpdate.max_attempts) {
            // Re-queue with exponential backoff (e.g., 2^attempts minutes delay)
            const delayMinutes = Math.pow(2, jobToUpdate.attempts);
            const nextRunAt = new Date(Date.now() + delayMinutes * 60 * 1000);
            jobToUpdate.status = 'retry';
            jobToUpdate.run_at = nextRunAt;
            logger.info(`Re-scheduled job ID ${jobToUpdate.id} for retry at ${nextRunAt.toISOString()}`);
          } else {
            jobToUpdate.status = 'dead_letter';
            logger.error(`Sync job ID ${jobToUpdate.id} reached max attempts. Moved to Dead Letter Queue.`);
          }
          await jobToUpdate.save({ transaction: updateTransaction });
        }
      }

      await updateTransaction.commit();
    } catch (err) {
      await updateTransaction.rollback();
      logger.error(`Error during processNextJob result update transaction for ID ${job.id}:`, err);
      throw err;
    }

    return true;
  }

  /**
   * Router to handle the different event types.
   */
  private static async handleJob(job: LightspeedSyncJob): Promise<void> {
    // ─── READ-ONLY GUARD (Second Layer) ───────────────────────────────────────
    // PUSH jobs (outbound writes to Lightspeed) are blocked in read-only mode.
    // enqueuePushJob() already prevents these from entering the queue, but this
    // second check protects against jobs that were enqueued before read-only
    // mode was enabled, or directly inserted into the DB.
    const PUSH_JOB_TYPES = [
      'PUSH_PRODUCT_FIELDS',
      'PUSH_PRODUCT_ARCHIVE',
      'PUSH_SALE',
      'PUSH_ITEM_SHOP',
      'PUSH_CUSTOMER',
      'PUSH_CUSTOMER_ARCHIVE',
    ];
    if (PUSH_JOB_TYPES.includes(job.job_type)) {
      const readOnly = await LightspeedService.isReadOnlyMode();
      if (readOnly) {
        throw new Error(
          `[READ-ONLY MODE] Blocked execution of outbound job '${job.job_type}' (ID: ${job.id}). ` +
            `Disable read-only mode via Admin API to allow writes to Lightspeed.`
        );
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    switch (job.job_type) {
      // Inbound poll triggers
      case 'BOOTSTRAP_SYNC':
        await LightspeedService.bootstrapSync();
        break;
      case 'POLL_INVENTORY':
        await this.executePollInventory();
        break;
      case 'POLL_CATALOG':
        await this.executePollCatalog();
        break;
      case 'RECONCILE_ALL':
        await this.executeReconcileAll();
        break;

      // Inbound page sync handlers
      case 'SYNC_SHOP_PAGE':
        await LightspeedService.syncShopsPage(job.payload.shops);
        break;
      case 'SYNC_REGISTER_PAGE':
        await LightspeedService.syncRegistersPage(job.payload.registers);
        break;
      case 'SYNC_EMPLOYEE_PAGE':
        await LightspeedService.syncEmployeesPage(job.payload.employees);
        break;
      case 'SYNC_PRICE_LEVEL_PAGE':
        await LightspeedService.syncPriceLevelsPage(job.payload.priceLevels);
        break;
      case 'SYNC_CURRENCY_RATE_PAGE':
        await LightspeedService.syncCurrencyRatesPage(job.payload.currencyRates);
        break;
      case 'SYNC_VENDOR_PAGE':
        await LightspeedService.syncVendorsPage(job.payload.vendors);
        break;
      case 'SYNC_BRAND_PAGE':
        await LightspeedService.syncBrandsPage(job.payload.brands);
        break;
      case 'SYNC_CATEGORY_PAGE':
        await LightspeedService.syncCategoriesPage(job.payload.categories);
        break;
      case 'SYNC_TAG_PAGE':
        await LightspeedService.syncTagsPage(job.payload.tags);
        break;
      case 'SYNC_ATTRIBUTE_SET_PAGE':
        await LightspeedService.syncAttributeSetsPage(job.payload.attributeSets);
        break;
      case 'SYNC_MATRIX_PAGE':
        await LightspeedService.syncMatricesPage(job.payload.matrices);
        break;
      case 'SYNC_PRODUCT_PAGE':
        await LightspeedService.syncItemsPage(job.payload.items);
        break;
      case 'SYNC_CUSTOMER_TYPE_PAGE':
        await LightspeedService.syncCustomerTypesPage(job.payload.customerTypes);
        break;
      case 'SYNC_CREDIT_ACCOUNT_PAGE':
        await LightspeedService.syncCreditAccountsPage(job.payload.creditAccounts);
        break;
      case 'SYNC_CUSTOMER_PAGE':
        await LightspeedService.syncCustomersPage(job.payload.customers);
        break;
      case 'SYNC_DISCOUNT_PAGE':
        await LightspeedService.syncDiscountsPage(job.payload.discounts);
        break;
      case 'SYNC_TAX_CATEGORY_PAGE':
        await LightspeedService.syncTaxCategoriesPage(job.payload.taxCategories);
        break;

      // Image sync
      case 'SYNC_IMAGE':
        await this.executeSyncImage(job.payload);
        break;

      // Outbound push triggers
      case 'PUSH_PRODUCT_FIELDS':
        await LightspeedService.updateProductFields(job.payload.lightspeedItemId, job.payload.changedFields);
        break;
      case 'PUSH_ITEM_SHOP':
        await LightspeedService.updateItemShop(job.payload.lightspeedItemShopId, job.payload.changedFields);
        break;
      case 'PUSH_PRODUCT_ARCHIVE':
        await LightspeedService.archiveProduct(job.payload.lightspeedItemId);
        break;
      case 'PUSH_CUSTOMER':
        await LightspeedService.pushCustomerToLightspeed(job.payload.customerId);
        break;
      case 'PUSH_CUSTOMER_ARCHIVE':
        await LightspeedService.archiveCustomerOnLightspeed(job.payload.lightspeedCustomerId);
        break;
      case 'PUSH_SALE':
        await LightspeedService.pushSale(job.payload.salePayload);
        break;

      case 'COMPLETE_SALE':
        await this.executeCompleteSale(job.payload);
        break;
      case 'VOID_SALE':
        await this.executeVoidSale(job.payload);
        break;

      default:
        throw new Error(`Unsupported sync job type: ${job.job_type}`);
    }
  }

  private static async executeSyncImage(payload: any): Promise<void> {
    const { productImageId, url } = payload;
    const image = await ProductImage.findByPk(productImageId);
    if (!image) {
      throw new Error(`ProductImage ID ${productImageId} not found.`);
    }

    image.download_status = 'downloading';
    await image.save();

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        throw new Error(`Failed to fetch image from CDN: ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      // Save to uploads folder directly (no subfolders)
      const dir = path.join(__dirname, '../../uploads');
      await fs.mkdir(dir, { recursive: true });

      const fileExtension = image.filename ? path.extname(image.filename) : '.jpg';
      const filename = `${image.lightspeed_image_id}${fileExtension}`;
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, buffer);

      // Store the URL in image table for local
      const imageUrl = `${config.app.prefix}/${config.app.version}/lightspeed/images/${filename}`;
      image.local_path = imageUrl;
      image.download_status = 'done';
      await image.save();
      logger.info(`Downloaded image ${image.lightspeed_image_id} for product ${image.product_id}`);
    } catch (error) {
      image.download_status = 'failed';
      await image.save();
      throw error;
    }
  }

  /**
   * executePollInventory - pulls modified items from Lightspeed since last cursor
   */
  private static async executePollInventory(): Promise<void> {
    logger.info('Starting Fast Inventory Poll...');
    const [state] = await LightspeedSyncState.findOrCreate({
      where: { entity_type: 'product' },
      defaults: {
        entity_type: 'product',
        last_synced_at: null,
        last_cursor_ts: null,
        status: 'idle',
        last_error: null,
        records_processed: 0,
      },
    });

    state.status = 'running';
    await state.save();

    try {
      const lastCursor = state.last_cursor_ts ? new Date(state.last_cursor_ts) : new Date(0); // fallback to 1970 to sync everything on initial run

      let nextUrl: string | null = null;
      let totalFetched = 0;
      let maxCursorTime = lastCursor.getTime();

      do {
        const { data: items, next } = await LightspeedService.fetchResource(
          nextUrl || 'Item.json',
          nextUrl ? undefined : lastCursor,
          100,
          nextUrl ? '' : 'load_relations=["ItemShops","Images","Tags","ItemVendorNums","TaxClass","Note"]&archived=all'
        );

        nextUrl = next;

        if (items.length > 0) {
          // Enqueue SYNC_PRODUCT_PAGE job for this page
          await LightspeedSyncJob.create({
            job_type: 'SYNC_PRODUCT_PAGE',
            payload: { items },
            status: 'pending',
            attempts: 0,
            max_attempts: 3,
            run_at: new Date(),
          });

          // Track latest timestamp
          for (const item of items) {
            if (item.timeStamp) {
              const itemTs = new Date(item.timeStamp).getTime();
              if (itemTs > maxCursorTime) maxCursorTime = itemTs;
            }
          }
        }

        totalFetched += items.length;
      } while (nextUrl);

      state.last_cursor_ts = new Date(maxCursorTime).toISOString();
      state.last_synced_at = new Date();
      state.status = 'idle';
      state.records_processed = totalFetched;
      state.last_error = null;
      await state.save();

      logger.info(`Fast Inventory Poll complete. Enqueued ${totalFetched} items for sync.`);
    } catch (err: any) {
      state.status = 'error';
      state.last_error = err.message;
      await state.save();
      throw err;
    }
  }

  /**
   * executePollCatalog - pulls lookup collections and enqueues mapping updates
   */
  private static async executePollCatalog(): Promise<void> {
    logger.info('Starting Slow Catalog Poll...');
    const catalogEntities = [
      {
        type: 'shop',
        endpoint: 'Shop.json',
        jobType: 'SYNC_SHOP_PAGE',
        useTimestamp: true,
        pluralKey: 'shops',
        queryParams: 'archived=all',
      },
      {
        type: 'price_level',
        endpoint: 'PriceLevel.json',
        jobType: 'SYNC_PRICE_LEVEL_PAGE',
        useTimestamp: false,
        pluralKey: 'priceLevels',
        queryParams: 'archived=all',
      },
      {
        type: 'currency_rate',
        endpoint: 'CurrencyRate.json',
        jobType: 'SYNC_CURRENCY_RATE_PAGE',
        useTimestamp: false,
        pluralKey: 'currencyRates',
        queryParams: 'archived=all',
      },
      {
        type: 'vendor',
        endpoint: 'Vendor.json',
        jobType: 'SYNC_VENDOR_PAGE',
        useTimestamp: true,
        pluralKey: 'vendors',
        queryParams: 'load_relations=["Contact"]&archived=all',
      },
      {
        type: 'brand',
        endpoint: 'Manufacturer.json',
        jobType: 'SYNC_BRAND_PAGE',
        useTimestamp: true,
        pluralKey: 'brands',
        queryParams: 'archived=all',
      },
      {
        type: 'category',
        endpoint: 'Category.json',
        jobType: 'SYNC_CATEGORY_PAGE',
        useTimestamp: true,
        pluralKey: 'categories',
        queryParams: 'archived=all',
      },
      {
        type: 'tag',
        endpoint: 'Tag.json',
        jobType: 'SYNC_TAG_PAGE',
        useTimestamp: false,
        pluralKey: 'tags',
        queryParams: 'archived=all',
      },
      {
        type: 'attribute_set',
        endpoint: 'ItemAttributeSet.json',
        jobType: 'SYNC_ATTRIBUTE_SET_PAGE',
        useTimestamp: false,
        pluralKey: 'attributeSets',
        queryParams: 'archived=all',
      },
      {
        type: 'matrix',
        endpoint: 'ItemMatrix.json',
        jobType: 'SYNC_MATRIX_PAGE',
        useTimestamp: true,
        pluralKey: 'matrices',
        queryParams: 'load_relations=["ItemAttributeSet","TaxClass"]&archived=all',
      },
      {
        type: 'discount',
        endpoint: 'Discount.json',
        jobType: 'SYNC_DISCOUNT_PAGE',
        useTimestamp: true,
        pluralKey: 'discounts',
        queryParams: 'archived=all',
      },
      {
        type: 'tax_category',
        endpoint: 'TaxCategory.json',
        jobType: 'SYNC_TAX_CATEGORY_PAGE',
        useTimestamp: true,
        pluralKey: 'taxCategories',
        queryParams: 'archived=all',
      },
      {
        type: 'customer_type',
        endpoint: 'CustomerType.json',
        jobType: 'SYNC_CUSTOMER_TYPE_PAGE',
        useTimestamp: false,
        pluralKey: 'customerTypes',
        queryParams: 'archived=all',
      },
      {
        type: 'credit_account',
        endpoint: 'CreditAccount.json',
        jobType: 'SYNC_CREDIT_ACCOUNT_PAGE',
        useTimestamp: true,
        pluralKey: 'creditAccounts',
        queryParams: 'archived=all',
      },
      {
        type: 'customer',
        endpoint: 'Customer.json',
        jobType: 'SYNC_CUSTOMER_PAGE',
        useTimestamp: true,
        pluralKey: 'customers',
        queryParams: 'load_relations=["Contact","Note","TaxCategory","Tags"]&archived=all',
      },
      {
        type: 'employee',
        endpoint: 'Employee.json',
        jobType: 'SYNC_EMPLOYEE_PAGE',
        useTimestamp: true,
        pluralKey: 'employees',
        queryParams: 'load_relations=["Contact","EmployeeRole"]&archived=all',
      },
      {
        type: 'register',
        endpoint: 'Register.json',
        jobType: 'SYNC_REGISTER_PAGE',
        useTimestamp: false,
        pluralKey: 'registers',
        queryParams: 'archived=all',
      },
    ];

    for (const ent of catalogEntities) {
      const [state] = await LightspeedSyncState.findOrCreate({
        where: { entity_type: ent.type },
        defaults: {
          entity_type: ent.type,
          last_synced_at: null,
          last_cursor_ts: null,
          status: 'idle',
          last_error: null,
          records_processed: 0,
        },
      });

      state.status = 'running';
      await state.save();

      try {
        const lastCursor = state.last_cursor_ts ? new Date(state.last_cursor_ts) : new Date(0); // fallback to 1970 to sync everything on initial run

        let nextUrl: string | null = null;
        let totalFetched = 0;
        let maxCursorTime = lastCursor.getTime();

        do {
          const { data, next } = await LightspeedService.fetchResource(
            nextUrl || ent.endpoint,
            nextUrl ? undefined : ent.useTimestamp ? lastCursor : undefined,
            100,
            nextUrl ? '' : ent.queryParams || 'archived=all'
          );
          nextUrl = next;

          if (data.length > 0) {
            const key = ent.pluralKey;
            await LightspeedSyncJob.create({
              job_type: ent.jobType,
              payload: { [key]: data },
              status: 'pending',
              attempts: 0,
              max_attempts: 3,
              run_at: new Date(),
            });

            for (const row of data) {
              if (row.timeStamp) {
                const ts = new Date(row.timeStamp).getTime();
                if (ts > maxCursorTime) maxCursorTime = ts;
              }
            }
          }

          totalFetched += data.length;
        } while (nextUrl);

        state.last_cursor_ts = new Date(maxCursorTime).toISOString();
        state.last_synced_at = new Date();
        state.status = 'idle';
        state.records_processed = totalFetched;
        state.last_error = null;
        await state.save();

        logger.info(`Slow Catalog Poll for ${ent.type} complete.`);
      } catch (err: any) {
        state.status = 'error';
        state.last_error = err.message;
        await state.save();
        logger.error(`Error in Slow Catalog Poll for ${ent.type}:`, err);
      }
    }
  }

  /**
   * executeReconcileAll - nightly reconciliation sweeping everything
   */
  private static async executeReconcileAll(): Promise<void> {
    logger.info('Starting nightly full reconciliation...');
    // Reset all cursors to force a full fetch, but do NOT clear lightspeed_entity_maps
    // This allows bulk hash-diffing to identify any missed changes
    await LightspeedSyncState.update({ last_cursor_ts: null }, { where: {} });
    await this.executePollCatalog();
    await this.executePollInventory();
  }

  /**
   * watchdogTask - reclaims stuck processing jobs and increments attempts (Fix #4)
   */
  public static async executeWatchdog(): Promise<void> {
    logger.debug('Watchdog running: checking for stuck sync jobs...');
    const staleTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

    const transaction = await sequelize.transaction();
    try {
      const stuckJobs = await LightspeedSyncJob.findAll({
        where: {
          status: 'processing',
          locked_at: { [Op.lte]: staleTime },
        },
        transaction,
      });

      for (const job of stuckJobs) {
        job.attempts += 1;
        job.locked_by = null;
        job.locked_at = null;
        const errorMsg = 'Job processing timed out after 10 minutes.';

        if (job.attempts < job.max_attempts) {
          job.status = 'retry';
          // Schedule retry with backoff
          const delayMinutes = Math.pow(2, job.attempts);
          job.run_at = new Date(Date.now() + delayMinutes * 60 * 1000);
          job.error_message = `Watchdog timeout (Attempt ${job.attempts}). ${errorMsg}`;
          logger.warn(`Watchdog reclaimed stuck job ID ${job.id} (Type: ${job.job_type}). Scheduled retry.`);
        } else {
          job.status = 'dead_letter';
          job.error_message = `Watchdog timeout. Max attempts (${job.max_attempts}) exceeded. ${errorMsg}`;
          logger.error(
            `Watchdog reclaimed stuck job ID ${job.id} (Type: ${job.job_type}). Max attempts exceeded. Sent to DLQ.`
          );
        }

        await job.save({ transaction });
      }

      // 1. Prune successfully completed jobs older than 24 hours (uses status_run_at composite index)
      const pruneDoneTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const prunedDoneCount = await LightspeedSyncJob.destroy({
        where: {
          status: 'done',
          run_at: { [Op.lte]: pruneDoneTime },
        },
        transaction,
      });
      if (prunedDoneCount > 0) {
        logger.info(`Watchdog pruned ${prunedDoneCount} completed sync jobs older than 24 hours.`);
      }

      // 2. Prune dead letter jobs older than 7 days (uses status_run_at composite index)
      const pruneDeadTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const prunedDeadCount = await LightspeedSyncJob.destroy({
        where: {
          status: 'dead_letter',
          run_at: { [Op.lte]: pruneDeadTime },
        },
        transaction,
      });
      if (prunedDeadCount > 0) {
        logger.info(`Watchdog pruned ${prunedDeadCount} dead letter sync jobs older than 7 days.`);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      logger.error('Error in watchdog task execution:', error);
    }
  }

  /**
   * Starts the background queue worker and watchdog.
   */
  public static startWorker(): void {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    logger.info('Lightspeed Queue Background Worker starting...');

    const workerId = `worker_${Math.random().toString(36).substring(2, 9)}`;

    // 1. Initialize DB-driven scheduler tasks via node-cron
    this.startScheduler().catch((err) => {
      logger.error('Error starting cron scheduler:', err);
    });

    // 2. Start worker polling loop (run claims every 5 seconds)
    const pollInterval = 5000;
    workerIntervalId = setInterval(async () => {
      try {
        let hasProcessed = true;
        while (hasProcessed) {
          hasProcessed = await this.processNextJob(workerId);
        }
      } catch (error) {
        logger.error('Error in Lightspeed worker loop:', error);
      }
    }, pollInterval);

    // 3. Start watchdog task (run every 1 minute)
    watchdogIntervalId = setInterval(async () => {
      try {
        await this.executeWatchdog();
      } catch (error) {
        logger.error('Error in watchdog loop:', error);
      }
    }, 60000);
  }

  /**
   * Stops the background queue worker and cron schedules.
   */
  public static stopWorker(): void {
    if (workerIntervalId) {
      clearInterval(workerIntervalId);
      workerIntervalId = null;
    }
    if (watchdogIntervalId) {
      clearInterval(watchdogIntervalId);
      watchdogIntervalId = null;
    }

    // Stop cron schedules
    for (const key of Object.keys(activeCronTasks)) {
      activeCronTasks[key].stop();
      delete activeCronTasks[key];
    }

    isWorkerRunning = false;
    logger.info('Lightspeed Queue Background Worker stopped.');
  }

  /**
   * startScheduler - reads database schedule configuration and bootstraps node-cron tasks
   */
  private static async startScheduler(): Promise<void> {
    const schedulers = await LightspeedSchedulerJob.findAll({ where: { enabled: true } });
    logger.info(`Bootstrapping scheduler: found ${schedulers.length} enabled tasks.`);

    for (const sched of schedulers) {
      if (activeCronTasks[sched.name]) {
        activeCronTasks[sched.name].stop();
      }

      // Create cron schedule task
      const task = cron.schedule(sched.cron, async () => {
        logger.info(`Scheduler triggered job: ${sched.name} (Job: ${sched.job_type})`);
        try {
          // Verify it is still enabled
          const refreshedJob = await LightspeedSchedulerJob.findByPk(sched.id);
          if (!refreshedJob || !refreshedJob.enabled) return;

          // Skip if BOOTSTRAP_SYNC is active
          const isBootstrapping = await LightspeedSyncJob.findOne({
            where: {
              job_type: 'BOOTSTRAP_SYNC',
              status: { [Op.in]: ['pending', 'retry', 'processing'] },
            },
          });
          if (isBootstrapping) {
            logger.warn(`Scheduler skipped ${refreshedJob.name}: BOOTSTRAP_SYNC is currently active/pending.`);
            return;
          }

          // Check if authorized first to avoid building up failing jobs in the queue
          const lsConfig = await LightspeedService.getConfig();
          if (!lsConfig.refresh_token) {
            logger.warn(
              `Scheduler skipped ${refreshedJob.name}: Lightspeed integration is not authorized yet. Please visit the authorization endpoint.`
            );
            return;
          }

          // Check if there is already a pending sync job of this type to avoid stack build-up
          const existingPending = await LightspeedSyncJob.findOne({
            where: {
              job_type: refreshedJob.job_type,
              status: { [Op.in]: ['pending', 'retry', 'processing'] },
            },
          });

          if (existingPending) {
            logger.warn(
              `Scheduler skipped ${refreshedJob.name}: a job of type ${refreshedJob.job_type} is already active.`
            );
            return;
          }

          // Enqueue job
          await LightspeedSyncJob.create({
            job_type: refreshedJob.job_type,
            payload: {},
            status: 'pending',
            attempts: 0,
            max_attempts: 3,
            run_at: new Date(),
          });

          refreshedJob.last_run_at = new Date();
          await refreshedJob.save();
        } catch (err) {
          logger.error(`Error executing scheduler cron task ${sched.name}:`, err);
        }
      });

      activeCronTasks[sched.name] = task;
      logger.info(`Configured scheduler cron task: ${sched.name} [Cron: ${sched.cron}]`);
    }
  }

  /**
   * executeCompleteSale - Worker handler for completion of sale on Lightspeed and Stripe capturing
   */
  private static async executeCompleteSale(payload: any): Promise<void> {
    const { orderId, lightspeedSaleId, stripePaymentIntentId, amount } = payload;
    const stripe = new (require('stripe'))(config.stripe.secretKey || 'dummy_key');

    logger.info(`Worker processing COMPLETE_SALE for Order ID: ${orderId}, Sale ID: ${lightspeedSaleId}`);

    // 1. Fetch Order
    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found in database.`);
    }

    // 2. Fetch OrderItems to check live QOH
    const orderItems = await OrderItem.findAll({ where: { order_id: orderId } });
    
    // Check stock one final time right before POS completion & capture
    for (const item of orderItems) {
      const product = await Product.findByPk(item.product_id);
      if (!product || !product.lightspeed_item_id) {
        throw new Error(`Product ${item.product_id} mappings missing.`);
      }

      // Read QOH from Lightspeed (GET is safe/read-only)
      let liveQoh = await LightspeedService.getLiveQoh(product.lightspeed_item_id, 1);
      
      // Fallback to local cache if offline
      if (liveQoh <= 0) {
        const inventory = await ProductInventory.findOne({ where: { product_id: item.product_id, shop_id: 1 } }) as any;
        liveQoh = inventory ? (inventory.qoh || 0) : 0;
      }

      if (liveQoh < item.quantity) {
        logger.warn(`STOCK COLLISION DETECTED for Order ID: ${orderId}, Product ID: ${item.product_id}. QOH: ${liveQoh}, Requested: ${item.quantity}`);
        
        // Stock Collision Resolution:
        // A. Cancel/Release Stripe Authorization Hold
        try {
          await stripe.paymentIntents.cancel(stripePaymentIntentId);
          logger.info(`Stripe payment intent ${stripePaymentIntentId} successfully cancelled.`);
        } catch (stripeErr) {
          logger.error(`Failed to cancel Stripe payment intent ${stripePaymentIntentId}:`, stripeErr);
        }

        // B. Void Open POS Sale
        try {
          await LightspeedService.completeSale(lightspeedSaleId, '0.00', 'VOID');
          // Void the sale in R-Series
          const readOnly = await LightspeedService.isReadOnlyMode();
          const isMock = lightspeedSaleId.startsWith('mock-sale-');
          if (!readOnly && !isMock) {
            await LightspeedService.makeRequest(`Sale/${lightspeedSaleId}.json`, {
              method: 'PUT',
              body: JSON.stringify({ voided: true }),
            });
          }
        } catch (lsErr) {
          logger.error(`Failed to void POS sale ${lightspeedSaleId}:`, lsErr);
        }

        // C. Update database: order cancelled (stock_collision), reservation released
        await sequelize.transaction(async (t) => {
          await order.update({ status: 'cancelled' }, { transaction: t });
          await InventoryReservation.update(
            { status: 'released' },
            { where: { order_id: orderId }, transaction: t }
          );
        });

        logger.info(`Order ${orderId} cancelled due to stock collision.`);
        return; // Complete worker job successfully
      }
    }

    // 3. Complete Sale in Lightspeed POS
    try {
      await LightspeedService.completeSale(lightspeedSaleId, amount, stripePaymentIntentId);
    } catch (lsErr: any) {
      logger.error(`Failed to complete Lightspeed Sale ${lightspeedSaleId}:`, lsErr);
      throw new Error(`Lightspeed completion failed: ${lsErr.message}`);
    }

    // 4. Capture Stripe Payment Hold
    try {
      const intent = await stripe.paymentIntents.capture(stripePaymentIntentId);
      logger.info(`Stripe payment captured successfully for Intent: ${stripePaymentIntentId}`);

      // Log successful transaction
      await PaymentTransaction.create({
        order_id: orderId,
        provider: 'stripe',
        transaction_id: stripePaymentIntentId,
        amount: parseFloat(amount),
        status: 'succeeded',
        raw_response: intent,
      });
    } catch (stripeErr: any) {
      logger.error(`Failed to capture Stripe payment hold ${stripePaymentIntentId}:`, stripeErr);
      
      // Unrecoverable Capture Failures (declines, etc.)
      await sequelize.transaction(async (t) => {
        await order.update({ status: 'manual_fulfillment_alert' }, { transaction: t });
        await InventoryReservation.update({ status: 'released' }, { where: { order_id: orderId }, transaction: t });
      });

      logger.error(`🚨 CRITICAL: stripe payment capture failed for completed sale: Order ${orderId}, Sale ${lightspeedSaleId}`);
      throw stripeErr;
    }

    // 5. Update local Order & Reservations
    await sequelize.transaction(async (t) => {
      await order.update({ status: 'synced' }, { transaction: t });
      await InventoryReservation.update(
        { status: 'consumed' },
        { where: { order_id: orderId }, transaction: t }
      );
    });

    logger.info(`Order ${orderId} successfully marked as synced and completed.`);
  }

  /**
   * executeVoidSale - Worker handler for voiding open sales on Lightspeed
   */
  private static async executeVoidSale(payload: any): Promise<void> {
    const { lightspeedSaleId } = payload;
    logger.info(`Worker processing VOID_SALE for Sale ID: ${lightspeedSaleId}`);
    
    const readOnly = await LightspeedService.isReadOnlyMode();
    const isMock = lightspeedSaleId.startsWith('mock-sale-');
    if (readOnly || isMock) {
      logger.info(`[READ-ONLY / MOCK] Bypassing VOID_SALE API write for saleID: ${lightspeedSaleId}`);
      return;
    }

    await LightspeedService.makeRequest(`Sale/${lightspeedSaleId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ voided: true }),
    });
    logger.info(`Successfully voided sale ID ${lightspeedSaleId} in Lightspeed.`);
  }
}

export default LightspeedQueue;
