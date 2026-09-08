import { Request, Response } from 'express';
import { Op, fn, col } from 'sequelize';
import fs, { existsSync, readdirSync } from 'fs';
import path from 'path';
import config from '@/config';
import logger from '@/utils/logger';
import sequelize from '@/database/connection';
import {
  LightspeedSyncJob,
  LightspeedSyncState,
  Product,
  ProductImage,
} from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import { LightspeedQueue } from '@/services/lightspeed-queue';

/**
 * Helper to recursively search for a file in a directory structure.
 * Returns the absolute path of the found file, or null if not found.
 */
const findFileRecursive = (dir: string, filenameToFind: string, lightspeedImageId?: string | null): string | null => {
  if (!existsSync(dir)) return null;
  const items = readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      const found = findFileRecursive(fullPath, filenameToFind, lightspeedImageId);
      if (found) return found;
    } else {
      const ext = path.extname(item.name).toLowerCase();
      const base = path.basename(item.name, ext).toLowerCase();
      const nameLower = item.name.toLowerCase();
      
      // Try matching lightspeedImageId
      if (lightspeedImageId && base === lightspeedImageId.toLowerCase()) {
        return fullPath;
      }
      
      // Try matching filename
      const targetLower = filenameToFind.toLowerCase();
      if (nameLower === targetLower || nameLower.endsWith(`_${targetLower}`)) {
        return fullPath;
      }
    }
  }
  return null;
};


/**
 * Triggers a manual sync by queueing a POLL_INVENTORY event immediately.
 */
export const triggerSync = async (_req: Request, res: Response) => {
  try {
    await LightspeedSyncJob.create({
      job_type: 'POLL_INVENTORY',
      payload: {},
      status: 'pending',
      attempts: 0,
      max_attempts: 3,
      run_at: new Date(),
    });

    return res.sendSuccess(res, { message: 'Lightspeed inventory poll job queued successfully.' });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Retrieves the status of the sync event queue.
 */
export const getQueue = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await LightspeedSyncJob.findAndCountAll({
      order: [['id', 'DESC']],
      offset,
      limit,
    });

    return res.sendPaginationSuccess(res, rows, count);
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Queues a price update event to push a local price change to Lightspeed.
 */
export const updateProductPrice = async (req: Request, res: Response) => {
  try {
    const { lightspeedItemId, price } = req.body;
    if (!lightspeedItemId || price === undefined) {
      return res.sendError(res, 'Missing lightspeedItemId or price');
    }

    // Insert sync task using outbox pattern enqueuer
    await LightspeedService.enqueuePushJob('PUSH_PRODUCT_FIELDS', {
      lightspeedItemId,
      changedFields: {
        Prices: {
          ItemPrice: [
            {
              useType: 'Default',
              amount: parseFloat(price).toFixed(2),
            },
          ],
        },
      },
    });

    return res.sendSuccess(res, { message: 'Price update job queued successfully.' });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Returns the list of synchronized products stored locally.
 */
export const getProducts = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await Product.findAndCountAll({
      order: [['id', 'DESC']],
      offset,
      limit,
    });

    return res.sendPaginationSuccess(res, rows, count);
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Retrieves the full sync monitoring dashboard details
 */
export const getDashboard = async (_req: Request, res: Response) => {
  try {
    // 1. Grouped sync job counts
    const statusCounts = await LightspeedSyncJob.findAll({
      attributes: ['status', [fn('COUNT', col('status')), 'count']],
      group: ['status'],
    });

    const jobCounts: { [key: string]: number } = {
      pending: 0,
      processing: 0,
      done: 0,
      retry: 0,
      dead_letter: 0,
    };

    statusCounts.forEach((r: any) => {
      const status = r.getDataValue('status');
      jobCounts[status] = parseInt(r.getDataValue('count') || '0', 10);
    });

    // 2. Cursor/sync states per entity
    const syncStates = await LightspeedSyncState.findAll({
      order: [['entity_type', 'ASC']],
    });

    // 3. Last 10 Dead Letter Queue jobs
    const deadLetters = await LightspeedSyncJob.findAll({
      where: { status: 'dead_letter' },
      order: [['updatedAt', 'DESC']],
      limit: 10,
    });

    // 4. Count active workers
    const activeWorkersResult = await LightspeedSyncJob.findAll({
      where: {
        status: 'processing',
        locked_at: { [Op.gte]: new Date(Date.now() - 15 * 60 * 1000) }, // active in last 15 min
      },
      attributes: [[fn('DISTINCT', col('locked_by')), 'worker']] as any,
    });
    const activeWorkerCount = activeWorkersResult.filter(r => r.getDataValue('worker' as any) !== null).length;

    // 5. Rate limit bucket level cache
    const rateLimitBucket = LightspeedService.lastSeenBucketLevel;

    return res.sendSuccess(res, {
      jobCounts,
      syncStates,
      deadLetters,
      activeWorkerCount,
      rateLimitBucket,
    });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Retries a permanently failed sync job in the DLQ
 */
export const retryJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.sendError(res, 'Missing jobId parameter');
    }

    const job = await LightspeedSyncJob.findByPk(jobId);
    if (!job) {
      return res.sendError(res, 'Sync job not found');
    }

    job.status = 'pending';
    job.attempts = 0;
    job.run_at = new Date();
    job.locked_by = null;
    job.locked_at = null;
    job.error_message = null;
    await job.save();

    return res.sendSuccess(res, { message: `Sync job ID ${jobId} rescheduled to pending.` });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Triggers a dependency-ordered full sync/bootstrap
 */
export const triggerBootstrap = async (_req: Request, res: Response) => {
  try {
    // 1. Reset all cursor states to force a full pull reconciliation
    await LightspeedSyncState.update(
      { last_cursor_ts: null },
      { where: {} }
    );

    // 2. Clear out any existing pending/processing/retry queue jobs to avoid interference
    await LightspeedSyncJob.destroy({
      where: {
        status: { [Op.in]: ['pending', 'processing', 'retry'] }
      }
    });

    // 3. Queue the single unified BOOTSTRAP_SYNC job
    await LightspeedSyncJob.create({
      job_type: 'BOOTSTRAP_SYNC',
      payload: {},
      status: 'pending',
      attempts: 0,
      max_attempts: 3,
      run_at: new Date(),
    });

    return res.sendSuccess(res, {
      message: 'Bootstrap sync triggered. Sequential data migration queued successfully.',
    });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Serves an image from the uploads directory.
 * If query parameter ?download=true is provided, triggers file download.
 */
export const serveImage = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../uploads', filename);

    if (!existsSync(filePath)) {
      // Fallback: recursively scan uploads directory to see if file exists in a nested folder
      const uploadsDir = path.join(__dirname, '../../uploads');
      const foundPath = findFileRecursive(uploadsDir, filename);
      if (foundPath) {
        fs.copyFileSync(foundPath, filePath);
        logger.info(`On-the-fly promoted image from ${foundPath} to ${filePath}`);
      } else {
        return res.status(404).send('Image not found');
      }
    }

    if (req.query.download === 'true') {
      return res.download(filePath, filename);
    }

    return res.sendFile(filePath);
  } catch (error: any) {
    console.error('Error serving image:', error);
    return res.status(500).send('Internal server error');
  }
};

/**
 * Returns the current read-only mode status.
 * This is the safe-guard that prevents any write/PUSH operations from reaching
 * the live Lightspeed POS during development and testing.
 */
export const getReadOnlyStatus = async (_req: Request, res: Response) => {
  try {
    const isReadOnly = await LightspeedService.isReadOnlyMode();
    const lsConfig = await LightspeedService.getConfig();
    return res.sendSuccess(res, {
      read_only_mode: isReadOnly,
      message: isReadOnly
        ? '🔒 READ-ONLY MODE is ACTIVE. All write/PUSH operations to Lightspeed are blocked. Your live POS is fully protected.'
        : '🔓 READ-ONLY MODE is DISABLED. Write operations to Lightspeed are permitted.',
      last_updated: lsConfig.updatedAt,
    });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Toggles read-only mode on or off at runtime without a server restart.
 * Set { "read_only_mode": true } to enable protection (block all writes to Lightspeed).
 * Set { "read_only_mode": false } to allow write/PUSH operations to Lightspeed.
 *
 * CAUTION: Disabling read-only mode allows your backend to make changes in
 * the live Lightspeed POS. Only do this after the integration is fully verified.
 */
export const setReadOnlyMode = async (req: Request, res: Response) => {
  try {
    const { read_only_mode } = req.body;

    if (typeof read_only_mode !== 'boolean') {
      return res.sendError(res, 'Missing or invalid field: read_only_mode must be a boolean (true/false).');
    }

    const lsConfig = await LightspeedService.getConfig();
    lsConfig.read_only_mode = read_only_mode;
    await lsConfig.save();

    if (read_only_mode) {
      logger.info('Lightspeed read-only mode ENABLED via Admin API. All writes to Lightspeed are now blocked.');
    } else {
      logger.warn('Lightspeed read-only mode DISABLED via Admin API. Write operations to Lightspeed are now permitted. Exercise caution with live POS data.');
    }

    return res.sendSuccess(res, {
      read_only_mode,
      message: read_only_mode
        ? '🔒 READ-ONLY MODE is now ACTIVE. All write/PUSH operations to Lightspeed are blocked.'
        : '🔓 READ-ONLY MODE is now DISABLED. Write operations to Lightspeed are permitted. Use with caution.',
    });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Returns OAuth authorization request URL
 */
export const getAuthUrl = async (req: Request, res: Response) => {
  try {
    const redirectUri = config.lightspeed.redirectUri ||
      `${req.secure ? 'https' : 'http'}://${req.get('host')}${config.app.prefix}/${config.app.version}/lightspeed/auth/callback`;

    const authorizeUrl = `https://cloud.lightspeedapp.com/oauth/authorize.php?response_type=code&client_id=${config.lightspeed.clientId}&scope=employee:register%20employee:all&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return res.sendSuccess(res, { authorizeUrl });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * OAuth Callback endpoint to exchange code for tokens
 */
export const authCallback = async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send('Authorization code missing in request queries.');
    }

    const redirectUri = config.lightspeed.redirectUri ||
      `${req.secure ? 'https' : 'http'}://${req.get('host')}${config.app.prefix}/${config.app.version}/lightspeed/auth/callback`;

    await LightspeedService.exchangeAuthCode(code, redirectUri);

    // Render a clean success page to the user
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lightspeed Authorized Successfully</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fc; color: #333; text-align: center; padding: 50px; }
            .card { background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 40px; display: inline-block; max-width: 500px; margin-top: 10vh; }
            h1 { color: #10b981; font-size: 24px; margin-bottom: 10px; }
            p { font-size: 16px; color: #666; margin-bottom: 20px; line-height: 1.5; }
            .btn { background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; cursor: pointer; }
            .btn:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Lightspeed Connection Authorized!</h1>
            <p>Your custom backend has successfully exchanged the credentials and saved a permanent refresh token. Real-time synchronization is now fully operational.</p>
            <a class="btn" href="javascript:window.close()">Close Window</a>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('OAuth Callback Error:', error);
    return res.status(500).send(`Lightspeed OAuth Exchange Failed: ${error.message || error}`);
  }
};



/**
 * Migration endpoint to update image paths in database from absolute to relative (or vice versa).
 * Updates existing entries in product_images.local_path to support portability across servers.
 * Auto-corrects invalid filesystem/folder paths, recursively searches and promotes nested upload files,
 * and queues background download jobs for missing files.
 */
export const migrateImagePaths = async (req: Request, res: Response) => {
  try {
    const { action = 'relative', autoDownloadMissing = true } = req.body;
    const images = await ProductImage.findAll();
    
    const uploadsDir = path.join(__dirname, '../../uploads');
    
    let updatedCount = 0;
    let jobsQueuedCount = 0;

    const transaction = await sequelize.transaction();
    try {
      for (const image of images) {
        const rawLocalPath = image.getDataValue('local_path');
        let targetPath = rawLocalPath;
        let isUpdated = false;

        // --- CASE 1: Path is invalid/wrong (filesystem paths, wrong folders, etc.) ---
        // If it contains backslashes or starts with absolute paths (e.g. C:, D:, /Users)
        // or contains "/uploads/" or "\uploads\"
        if (targetPath && (
          targetPath.includes('\\') || 
          /^[a-zA-Z]:/i.test(targetPath) || 
          targetPath.includes('/uploads/') || 
          targetPath.includes('\\uploads\\')
        )) {
          // 1. First, check if the file physically exists at the old location or relative paths
          let originalFileFound = false;
          let originalFilePath = '';

          if (existsSync(targetPath)) {
            originalFileFound = true;
            originalFilePath = targetPath;
          } else {
            const possiblePaths = [
              path.resolve(__dirname, '../../../', targetPath),
              path.join(uploadsDir, '../', targetPath),
              path.join(uploadsDir, 'products', targetPath),
            ];
            
            // Normalize path by stripping uploads/ or uploads\ prefix
            let normalizedPath = targetPath.replace(/^[\\\/]?uploads[\\\/]/i, '');
            possiblePaths.push(
              path.join(uploadsDir, normalizedPath),
              path.resolve(__dirname, '../../../uploads', normalizedPath)
            );

            for (const p of possiblePaths) {
              if (existsSync(p) && fs.statSync(p).isFile()) {
                originalFileFound = true;
                originalFilePath = p;
                break;
              }
            }
          }

          const filename = path.basename(targetPath);

          // 2. If it is found, promote (copy) it to the root uploads directory
          if (originalFileFound) {
            const destPath = path.join(uploadsDir, filename);
            if (path.resolve(originalFilePath) !== path.resolve(destPath) && !existsSync(destPath)) {
              fs.copyFileSync(originalFilePath, destPath);
              logger.info(`Promoted legacy image from ${originalFilePath} to ${destPath}`);
            }
            targetPath = `${config.app.prefix}/${config.app.version}/lightspeed/images/${filename}`;
            
            if (rawLocalPath !== targetPath) {
              image.setDataValue('local_path', targetPath);
              image.download_status = 'done';
              isUpdated = true;
            }
          } else {
            // Even if physical file was not found, update DB record path format and let sync/auto-download recover it
            targetPath = `${config.app.prefix}/${config.app.version}/lightspeed/images/${filename}`;
            if (rawLocalPath !== targetPath) {
              image.setDataValue('local_path', targetPath);
              isUpdated = true;
            }
          }
        }

        // --- CASE 2: Path is empty/null, let's search if the file exists (even recursively) in uploads ---
        if (!targetPath || targetPath.trim() === '') {
          const matchedFullPath = findFileRecursive(uploadsDir, image.filename || '', image.lightspeed_image_id);
          
          if (matchedFullPath) {
            const filename = path.basename(matchedFullPath);
            const destPath = path.join(uploadsDir, filename);
            
            if (path.resolve(matchedFullPath) !== path.resolve(destPath) && !existsSync(destPath)) {
              fs.copyFileSync(matchedFullPath, destPath);
              logger.info(`Recursively found and promoted image from ${matchedFullPath} to ${destPath}`);
            }
            
            targetPath = `${config.app.prefix}/${config.app.version}/lightspeed/images/${filename}`;
            image.setDataValue('local_path', targetPath);
            image.download_status = 'done';
            isUpdated = true;
          }
        }

        // --- CASE 3: Standard absolute URL mapping back to relative ---
        if (targetPath && (targetPath.startsWith('http://') || targetPath.startsWith('https://'))) {
          try {
            const urlObj = new URL(targetPath);
            targetPath = urlObj.pathname;
          } catch (e) {
            const match = targetPath.match(/^https?:\/\/[^\/]+(\/.*)$/);
            if (match && match[1]) {
              targetPath = match[1];
            }
          }

          // Ensure it starts with /
          if (!targetPath.startsWith('/')) {
            targetPath = '/' + targetPath;
          }

          if (rawLocalPath !== targetPath) {
            image.setDataValue('local_path', targetPath);
            isUpdated = true;
          }
        }

        // --- CASE 3b: Verify file exists in root (for already migrated/relative path entries) ---
        const relativePrefix = `${config.app.prefix}/${config.app.version}/lightspeed/images/`;
        if (targetPath && targetPath.startsWith(relativePrefix)) {
          const filename = targetPath.substring(relativePrefix.length);
          const destPath = path.join(uploadsDir, filename);
          
          if (!existsSync(destPath)) {
            // File is missing from root! Let's search recursively in uploads/ subdirectories
            const matchedFullPath = findFileRecursive(uploadsDir, filename, image.lightspeed_image_id);
            
            if (matchedFullPath) {
              if (path.resolve(matchedFullPath) !== path.resolve(destPath)) {
                fs.copyFileSync(matchedFullPath, destPath);
                logger.info(`Healed and promoted image from subfolder ${matchedFullPath} to ${destPath}`);
              }
              image.download_status = 'done';
              isUpdated = true;
            } else {
              // Not found in subfolders either! Mark download_status as pending to allow redownload
              if (image.download_status !== 'pending' && image.download_status !== 'downloading') {
                image.download_status = 'pending';
                isUpdated = true;
              }
            }
          }
        }

        // --- CASE 4: If action is absolute, reconstruct absolute path ---
        if (action === 'absolute' && targetPath && !targetPath.startsWith('http://') && !targetPath.startsWith('https://')) {
          const host = process.env.APP_HOST || config.app.host || 'localhost';
          const port = process.env.PORT || config.app.port || 5000;
          const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
          const portStr = (port === 80 || port === 443 || port === '80' || port === '443') ? '' : `:${port}`;
          const baseUrl = `${protocol}://${host}${portStr}`;
          targetPath = `${baseUrl}${targetPath}`;
          
          if (rawLocalPath !== targetPath) {
            image.setDataValue('local_path', targetPath);
            isUpdated = true;
          }
        }

        // Save modifications if any
        if (isUpdated || rawLocalPath !== targetPath) {
          if (action !== 'absolute' && targetPath && !targetPath.startsWith('/')) {
            targetPath = '/' + targetPath;
          }
          await image.update({
            local_path: targetPath,
            download_status: image.download_status
          }, { transaction });
          updatedCount++;
        }

        // --- CASE 5: Queue download for missing images ---
        const currentLocalPath = image.getDataValue('local_path');
        if (autoDownloadMissing && !currentLocalPath && image.lightspeed_url) {
          const jobExists = await LightspeedSyncJob.findOne({
            where: {
              job_type: 'SYNC_IMAGE',
              status: { [Op.in]: ['pending', 'processing', 'retry'] },
              payload: {
                productImageId: image.id,
              },
            },
            transaction,
          });

          if (!jobExists) {
            await LightspeedSyncJob.create(
              {
                job_type: 'SYNC_IMAGE',
                payload: { productImageId: image.id, url: image.lightspeed_url },
                status: 'pending',
                attempts: 0,
                max_attempts: 3,
                run_at: new Date(),
              },
              { transaction }
            );
            
            if (image.download_status !== 'pending' && image.download_status !== 'downloading') {
              await image.update({ download_status: 'pending' }, { transaction });
            }
            jobsQueuedCount++;
          }
        }
      }
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    return res.sendSuccess(res, {
      message: `Image paths migrated and repaired successfully.`,
      totalRecords: images.length,
      updatedRecords: updatedCount,
      jobsQueued: jobsQueuedCount,
    });
  } catch (error: any) {
    console.error('Error migrating image paths:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * Triggers pulling and synchronizing POS sales data from Lightspeed.
 * - Incremental poll by default (picks up from last cursor).
 * - Supports historical backfill via ?backfill=true or ?days=365.
 * - Supports ?immediate=true to execute synchronously instead of queuing.
 */
export const triggerSalesSync = async (req: Request, res: Response) => {
  try {
    const isImmediate = req.query.immediate === 'true' || req.body?.immediate === true;
    const backfill = req.query.backfill === 'true' || req.body?.backfill === true;
    const daysParam = req.query.days || req.body?.days;
    const backfillDays = daysParam ? Number(daysParam) : backfill ? 365 : undefined;

    if (isImmediate) {
      logger.info(`Manual synchronous POS sales sync initiated (backfillDays: ${backfillDays || 'cursor'})...`);
      await LightspeedQueue.executePollPOSSales({ backfillDays });
      return res.sendSuccess(res, {
        message: 'POS sales synchronized successfully and sales metrics updated.',
      });
    }

    // Queue the job via LightspeedQueue worker
    const job = await LightspeedSyncJob.create({
      job_type: 'POLL_POS_SALES',
      payload: { backfillDays },
      status: 'pending',
      attempts: 0,
      max_attempts: 3,
      run_at: new Date(),
    });

    return res.sendSuccess(res, {
      message: 'POS sales poll job queued successfully.',
      jobId: job.id,
      backfillDays: backfillDays || null,
    });
  } catch (error: any) {
    logger.error('Error triggering sales sync:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};
