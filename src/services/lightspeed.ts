import crypto from 'crypto';
import { Op } from 'sequelize';
import config from '@/config';
import logger from '@/utils/logger';
import sequelize from '@/database/connection';
import {
  LightspeedConfig,
  Shop,
  Register,
  Employee,
  Vendor,
  Brand,
  Category,
  Tag,
  ProductTag,
  ProductMatrix,
  Product,
  ProductVendor,
  ProductInventory,
  ProductImage,
  LightspeedEntityMap,
  LightspeedSyncJob,
  LightspeedSyncState,
  Customer,
  CustomerType,
  CreditAccount,
  Discount,
  TaxCategory,
  ItemAttributeSet,
  PriceLevel,
  CurrencyRate,
} from '@/database/models';

export interface LightspeedItemPrice {
  amount: string;
  useType: string;
}

export interface LightspeedItemShop {
  itemID: string;
  shopID: string;
  qoh: string;
  unitCost?: string;
  reorderPoint?: string;
  reorderLevel?: string;
}

export interface LightspeedItem {
  itemID: string;
  systemSku?: string;
  customSku?: string;
  upc?: string;
  ean?: string;
  description?: string;
  price?: string;
  defaultCost?: string;
  avgCost?: string;
  itemMatrixID?: string;
  manufacturerID?: string;
  categoryID?: string;
  defaultVendorID?: string;
  discountable?: string;
  tax?: string;
  itemType?: string;
  publishToEcom?: string;
  serialized?: string;
  attribute1?: string;
  attribute2?: string;
  attribute3?: string;
  note?: string;
  displayNote?: string;
  archived?: string;
  Prices?: {
    ItemPrice?: LightspeedItemPrice | LightspeedItemPrice[];
  };
  ItemShops?: {
    ItemShop?: LightspeedItemShop | LightspeedItemShop[];
  };
  ItemVendorNums?: {
    ItemVendorNum?: any | any[];
  };
  Images?: {
    Image?: any | any[];
  };
  Tags?: {
    Tag?: any | any[];
  };
}

export class LightspeedService {
  public static lastSeenBucketLevel: string = '0/60';

  /**
   * Helper to retrieve the global Lightspeed integration configuration.
   * Ensures a single configuration row (ID=1) always exists in the database.
   */
  public static async getConfig(): Promise<LightspeedConfig> {
    let lsConfig = await LightspeedConfig.findByPk(1);
    if (!lsConfig) {
      lsConfig = await LightspeedConfig.create({
        id: 1,
        access_token: null,
        access_token_expires_at: null,
        last_sync_time: null,
        account_id: null,
        refresh_token: config.lightspeed.refreshToken || null,
        read_only_mode: true, // Always start in read-only mode for safety
      });
    }
    return lsConfig;
  }

  /**
   * Checks if the Lightspeed integration is currently in read-only mode.
   * The source of truth is the `read_only_mode` flag in the DB config row (ID=1),
   * which can be toggled at runtime via the Admin API without a server restart.
   */
  public static async isReadOnlyMode(): Promise<boolean> {
    try {
      const lsConfig = await LightspeedConfig.findByPk(1);
      // If no config row exists yet, default to read-only for safety
      if (!lsConfig) return true;
      return lsConfig.read_only_mode;
    } catch {
      // On DB error, default to read-only to protect live POS
      return true;
    }
  }

  /**
   * Returns a valid OAuth2 access token.
   * If the cached token is missing or expired, triggers a refresh under a database row lock.
   */
  public static async getAccessToken(): Promise<string> {
    const transaction = await sequelize.transaction();
    try {
      // Row-level lock on the configuration record (ID=1) to prevent token refresh race conditions
      const lsConfig = await LightspeedConfig.findByPk(1, {
        lock: true,
        transaction,
      });

      if (!lsConfig) {
        throw new Error('Global Lightspeed config row ID=1 not found.');
      }

      const now = new Date();
      if (
        lsConfig.access_token &&
        lsConfig.access_token_expires_at &&
        new Date(lsConfig.access_token_expires_at).getTime() > now.getTime() + 60000
      ) {
        await transaction.commit();
        return lsConfig.access_token;
      }

      logger.info('Lightspeed access token is expired or missing. Refreshing token under lock...');
      const newAccessToken = await this.refreshAccessTokenInTransaction(lsConfig, transaction);
      await transaction.commit();
      return newAccessToken;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Refreshes the OAuth2 access token inside a transaction holding a database lock.
   */
  private static async refreshAccessTokenInTransaction(lsConfig: LightspeedConfig, transaction: any): Promise<string> {
    const refreshToken = lsConfig.refresh_token;

    if (!refreshToken || refreshToken === 'dummy_refresh_token') {
      logger.warn('No valid refresh token is available in either database or .env.');
      throw new Error(
        'Lightspeed Integration requires a valid refresh token. Please authorize through the Admin Panel.'
      );
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.lightspeed.clientId,
      client_secret: config.lightspeed.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(config.lightspeed.oauthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const responseText = await response.text();
    logger.debug(`Lightspeed OAuth refresh response status: ${response.status}`);

    if (!response.ok) {
      logger.error(`Failed to refresh Lightspeed access token: ${response.status} ${responseText}`);

      // Handle revoked/invalid refresh tokens automatically (invalid_grant)
      if (responseText.includes('invalid_grant')) {
        lsConfig.access_token = null;
        lsConfig.access_token_expires_at = null;
        lsConfig.refresh_token = null;
        await lsConfig.save({ transaction });
        logger.warn('Refresh token is invalid/revoked. Successfully cleared credentials from database config.');
      }

      throw new Error(`Lightspeed OAuth refresh failed: ${response.statusText} - ${responseText}`);
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (err: any) {
      logger.error(`Failed to parse Lightspeed OAuth refresh response JSON: ${responseText}`);
      throw new Error(`Lightspeed OAuth refresh response is invalid JSON: ${responseText}`);
    }

    console.log(`Lightspeed OAuth refresh response: ${JSON.stringify(data)}`);
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    lsConfig.access_token = data.access_token;
    lsConfig.access_token_expires_at = expiresAt;

    if (data.refresh_token) {
      lsConfig.refresh_token = data.refresh_token;
    }

    await lsConfig.save({ transaction });
    logger.info('Lightspeed access token refreshed and cached successfully under lock.');
    return data.access_token;
  }

  /**
   * Retrieves and caches the Account ID from Lightspeed.
   * Crucial as Account ID is required for all other endpoints.
   */
  public static async getAccountId(): Promise<string> {
    const lsConfig = await this.getConfig();
    if (lsConfig.account_id) {
      return lsConfig.account_id;
    }

    logger.info('Lightspeed account ID not cached. Retrieving from API...');
    const accessToken = await this.getAccessToken();

    const response = await fetch(`${config.lightspeed.apiUrl}/Account.json`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Failed to fetch Lightspeed Account: ${response.status} ${errorText}`);
      throw new Error(`Lightspeed Account retrieval failed: ${response.statusText} - ${errorText}`);
    }

    const data: any = await response.json();
    let accountId = '';

    if (data.Account) {
      if (Array.isArray(data.Account)) {
        accountId = data.Account[0].accountID;
      } else {
        accountId = data.Account.accountID;
      }
    }

    if (!accountId) {
      throw new Error('No Account ID found in Lightspeed API response.');
    }

    lsConfig.account_id = accountId;
    await lsConfig.save();
    logger.info(`Lightspeed Account ID retrieved and cached: ${accountId}`);
    return accountId;
  }

  /**
   * Generic request wrapper with built-in timeout, rate-limit handling, and automatic retries.
   */
  public static async makeRequest(path: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
    const method = (options.method || 'GET').toUpperCase();

    // ─── READ-ONLY GUARD ──────────────────────────────────────────────────────
    // Block ALL non-GET requests to Lightspeed when read-only mode is active.
    // This is the single hard enforcement point — even if a bug in the caller
    // tries to fire a write, it will be stopped here before reaching the network.
    if (method !== 'GET') {
      const readOnly = await this.isReadOnlyMode();
      if (readOnly) {
        const blockedMsg = `[READ-ONLY MODE] Blocked outbound ${method} request to Lightspeed: ${path}. Disable read-only mode via Admin API to allow writes.`;
        logger.warn(blockedMsg);
        throw new Error(blockedMsg);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const accessToken = await this.getAccessToken();
    const accountId = await this.getAccountId();
    const url = path.startsWith('http') ? path : `${config.lightspeed.apiUrl}/Account/${accountId}/${path}`;

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('Accept', 'application/json');
    if (
      !headers.has('Content-Type') &&
      options.body &&
      !(typeof FormData !== 'undefined' && options.body instanceof FormData)
    ) {
      headers.set('Content-Type', 'application/json');
    }

    // Proactive request timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const reqOptions: RequestInit = {
      ...options,
      headers,
      signal: controller.signal,
    };

    logger.debug(`Lightspeed API request: ${reqOptions.method || 'GET'} ${url}`);

    try {
      const response = await fetch(url, reqOptions);

      // Handle Rate Limit Headers (Leaky Bucket: 60 Capacity, 1/s Drip)
      const bucketLevel = response.headers.get('x-ls-api-bucket-level');
      if (bucketLevel) {
        this.lastSeenBucketLevel = bucketLevel;
        const [current, max] = bucketLevel.split('/').map(Number);
        if (current && max && current >= 55) {
          const sleepTime = 2000;
          logger.warn(
            `Lightspeed API rate limit bucket level is high: ${bucketLevel}. Throttling for ${sleepTime}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, sleepTime));
        }
      }

      if (response.status === 429) {
        if (retryCount < 5) {
          const backoff = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          logger.warn(`Lightspeed API rate limit (429) encountered. Retrying after ${Math.round(backoff)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          return this.makeRequest(path, options, retryCount + 1);
        } else {
          logger.error('Lightspeed API rate limit retry count exceeded. Aborting request.');
          throw new Error('Lightspeed API rate limit retry count exceeded.');
        }
      }

      if (response.status === 401 && retryCount === 0) {
        logger.warn('Lightspeed API returned 401 Unauthorized. Clearing cached access token and retrying...');
        const lsConfig = await this.getConfig();
        lsConfig.access_token = null;
        lsConfig.access_token_expires_at = null;
        await lsConfig.save();
        return this.makeRequest(path, options, retryCount + 1);
      }

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`Lightspeed API request failed: ${response.status} ${errText}`);
        throw new Error(`Lightspeed API Error (${response.status}): ${errText || response.statusText}`);
      }

      return response.json();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logger.error(`Lightspeed API request timed out after 30s: ${url}`);
        throw new Error(`Lightspeed API request timed out after 30s: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Helper utility to safely convert single/array objects in responses to lists.
   */
  public static extractList<T>(data: any, key: string): T[] {
    if (!data || !data[key]) return [];
    return Array.isArray(data[key]) ? data[key] : [data[key]];
  }

  /**
   * Deterministic SHA1 Hash for change detection
   */
  public static calculateHash(obj: any): string {
    const stringified = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha1').update(stringified).digest('hex');
  }

  /**
   * Generic resource fetch client supporting cursor/link-based pagination.
   */
  public static async fetchResource(
    endpoint: string,
    since?: Date,
    limit = 100,
    extraParams = ''
  ): Promise<{ data: any[]; count: number; next: string | null }> {
    let queryPath = endpoint;

    if (!endpoint.startsWith('http')) {
      queryPath = `${endpoint}?limit=${limit}`;
      if (since) {
        queryPath += `&timeStamp=%3E%2C${encodeURIComponent(since.toISOString())}`;
      }
      if (extraParams) {
        queryPath += `&${extraParams}`;
      }
    }

    const data = await this.makeRequest(queryPath, { method: 'GET' });

    let key = '';
    if (endpoint.startsWith('http')) {
      try {
        const urlObj = new URL(endpoint);
        const pathParts = urlObj.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        key = lastPart.split('.')[0];
      } catch (e) {
        key = 'Item';
      }
    } else {
      key = endpoint.split('.')[0];
    }

    const list = this.extractList<any>(data, key);
    const count = data['@attributes'] ? parseInt(data['@attributes'].count || '0', 10) : list.length;
    const next = data['@attributes'] ? data['@attributes'].next || null : null;

    return { data: list, count, next };
  }

  /**
   * Sync a page of Shops
   */
  public static async syncShopsPage(shopsData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;
      const recordsToUpsert: any[] = [];
      const mappingsToUpsert: any[] = [];

      for (const shop of shopsData) {
        const payloadForHash = {
          name: shop.name,
          archived: shop.archived === 'true',
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'shop', lightspeed_id: shop.shopID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        recordsToUpsert.push({
          lightspeed_shop_id: shop.shopID.toString(),
          name: shop.name,
          archived: shop.archived === 'true',
        });

        mappingsToUpsert.push({
          lightspeed_id: shop.shopID.toString(),
          hash,
          entity_type: 'shop',
        });
      }

      if (recordsToUpsert.length > 0) {
        const shops = await Shop.bulkCreate(recordsToUpsert, {
          updateOnDuplicate: ['name', 'archived'],
          transaction,
        });

        const finalMappings = mappingsToUpsert.map((m) => {
          const createdShop = shops.find((s) => s.lightspeed_shop_id === m.lightspeed_id);
          return {
            ...m,
            local_id: createdShop ? createdShop.id : 0,
            last_sync: new Date(),
          };
        });

        await LightspeedEntityMap.bulkCreate(finalMappings, {
          updateOnDuplicate: ['local_id', 'hash', 'last_sync'],
          transaction,
        });

        processedCount = recordsToUpsert.length;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing shops page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Registers
   */
  public static async syncRegistersPage(registersData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;

      for (const reg of registersData) {
        const payloadForHash = {
          name: reg.name,
          open: reg.open === true || reg.open === 'true',
          openTime: reg.openTime || null,
          tipEnabled: reg.tipEnabled === true || reg.tipEnabled === 'true',
          shopID: reg.shopID ? reg.shopID.toString() : null,
          openEmployeeID: reg.openEmployeeID ? reg.openEmployeeID.toString() : null,
          ccTerminalID: reg.ccTerminalID ? reg.ccTerminalID.toString() : null,
          archived: reg.archived === true || reg.archived === 'true',
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'register', lightspeed_id: reg.registerID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        // Resolve Shop ID
        let localShopId: number | null = null;
        if (reg.shopID && reg.shopID.toString() !== '0') {
          const shop = await Shop.findOne({
            where: { lightspeed_shop_id: reg.shopID.toString() },
            transaction,
          });
          if (shop) localShopId = shop.id;
        }

        // Resolve Open Employee ID
        let localEmployeeId: number | null = null;
        if (reg.openEmployeeID && reg.openEmployeeID.toString() !== '0') {
          const employee = await Employee.findOne({
            where: { lightspeed_employee_id: reg.openEmployeeID.toString() },
            transaction,
          });
          if (employee) localEmployeeId = employee.id;
        }

        const [localRegister] = await Register.upsert(
          {
            lightspeed_register_id: reg.registerID.toString(),
            name: reg.name || `Register ${reg.registerID}`,
            open: reg.open === true || reg.open === 'true',
            open_time: reg.openTime ? new Date(reg.openTime) : null,
            tip_enabled: reg.tipEnabled === true || reg.tipEnabled === 'true',
            shop_id: localShopId,
            lightspeed_shop_id: reg.shopID ? reg.shopID.toString() : null,
            open_employee_id: localEmployeeId,
            lightspeed_open_employee_id: reg.openEmployeeID ? reg.openEmployeeID.toString() : null,
            cc_terminal_id: reg.ccTerminalID ? reg.ccTerminalID.toString() : null,
            archived: reg.archived === true || reg.archived === 'true',
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'register',
            lightspeed_id: reg.registerID.toString(),
            local_id: localRegister.id,
            hash,
            last_sync: new Date(),
          },
          { transaction }
        );

        processedCount++;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing registers page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Employees
   */
  public static async syncEmployeesPage(employeesData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;

      for (const emp of employeesData) {
        // Extract contact info if available
        let email: string | null = null;
        let phone: string | null = null;
        if (emp.Contact) {
          const emails = emp.Contact.Emails?.ContactEmail;
          if (emails) {
            const emailList = Array.isArray(emails) ? emails : [emails];
            const primary = emailList.find((e: any) => e.useType === 'Primary') || emailList[0];
            if (primary && primary.address) email = primary.address;
          }
          const phones = emp.Contact.Phones?.ContactPhone;
          if (phones) {
            const phoneList = Array.isArray(phones) ? phones : [phones];
            const mobile = phoneList.find((p: any) => p.useType === 'Mobile' || p.useType === 'Work') || phoneList[0];
            if (mobile && mobile.number) phone = mobile.number;
          }
        }

        const roleName = emp.EmployeeRole?.name || null;

        const payloadForHash = {
          firstName: emp.firstName,
          lastName: emp.lastName,
          lockOut: emp.lockOut === true || emp.lockOut === 'true',
          archived: emp.archived === true || emp.archived === 'true',
          employeeRoleID: emp.employeeRoleID ? emp.employeeRoleID.toString() : null,
          roleName,
          limitToShopID: emp.limitToShopID ? emp.limitToShopID.toString() : null,
          lastShopID: emp.lastShopID ? emp.lastShopID.toString() : null,
          lastSaleID: emp.lastSaleID ? emp.lastSaleID.toString() : null,
          lastRegisterID: emp.lastRegisterID ? emp.lastRegisterID.toString() : null,
          email,
          phone,
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'employee', lightspeed_id: emp.employeeID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        // Resolve limit_to_shop_id
        let localLimitShopId: number | null = null;
        if (emp.limitToShopID && emp.limitToShopID.toString() !== '0') {
          const shop = await Shop.findOne({
            where: { lightspeed_shop_id: emp.limitToShopID.toString() },
            transaction,
          });
          if (shop) localLimitShopId = shop.id;
        }

        // Resolve last_shop_id
        let localLastShopId: number | null = null;
        if (emp.lastShopID && emp.lastShopID.toString() !== '0') {
          const shop = await Shop.findOne({
            where: { lightspeed_shop_id: emp.lastShopID.toString() },
            transaction,
          });
          if (shop) localLastShopId = shop.id;
        }

        const [localEmployee] = await Employee.upsert(
          {
            lightspeed_employee_id: emp.employeeID.toString(),
            first_name: emp.firstName || '',
            last_name: emp.lastName || null,
            lock_out: emp.lockOut === true || emp.lockOut === 'true',
            archived: emp.archived === true || emp.archived === 'true',
            contact_id: emp.contactID ? emp.contactID.toString() : null,
            clock_in_employee_hours_id: emp.clockInEmployeeHoursID ? emp.clockInEmployeeHoursID.toString() : null,
            employee_role_id: emp.employeeRoleID ? emp.employeeRoleID.toString() : null,
            employee_role_name: roleName,
            limit_to_shop_id: localLimitShopId,
            lightspeed_limit_to_shop_id: emp.limitToShopID ? emp.limitToShopID.toString() : null,
            last_shop_id: localLastShopId,
            lightspeed_last_shop_id: emp.lastShopID ? emp.lastShopID.toString() : null,
            last_sale_id: emp.lastSaleID ? emp.lastSaleID.toString() : null,
            last_register_id: emp.lastRegisterID ? emp.lastRegisterID.toString() : null,
            email,
            phone,
            time_stamp: emp.timeStamp ? new Date(emp.timeStamp) : null,
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'employee',
            lightspeed_id: emp.employeeID.toString(),
            local_id: localEmployee.id,
            hash,
            last_sync: new Date(),
          },
          { transaction }
        );

        processedCount++;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing employees page:', error);
      throw error;
    }
  }

  /**
   * Resolves the active register for sales / payment flow.
   * Priority:
   * 1. Environment / config override (LIGHTSPEED_DEFAULT_REGISTER_ID)
   * 2. Active register matching online/web keywords
   * 3. An open register (open: true, archived: false)
   * 4. Any non-archived register
   * 5. Safe fallback ('6') if database has no registers synced yet
   */
  public static async resolveActiveRegister(preferredShopId?: string): Promise<{ registerId: string; shopId: string }> {
    try {
      if (config.lightspeed.defaultRegisterId) {
        const reg = await Register.findOne({
          where: { lightspeed_register_id: config.lightspeed.defaultRegisterId },
        });
        if (reg) {
          return {
            registerId: reg.lightspeed_register_id,
            shopId: reg.lightspeed_shop_id || config.lightspeed.defaultShopId || '1',
          };
        }
        return {
          registerId: config.lightspeed.defaultRegisterId,
          shopId: config.lightspeed.defaultShopId || '1',
        };
      }

      const shopFilter = preferredShopId ? { lightspeed_shop_id: preferredShopId } : {};

      // 1. Try to find a web/online register
      const webRegister = await Register.findOne({
        where: {
          archived: false,
          ...shopFilter,
          [Op.or]: [
            { name: { [Op.iLike]: '%web%' } },
            { name: { [Op.iLike]: '%online%' } },
            { name: { [Op.iLike]: '%ecom%' } },
            { name: { [Op.iLike]: '%api%' } },
          ],
        },
        order: [['open', 'DESC'], ['id', 'ASC']],
      });

      if (webRegister) {
        return {
          registerId: webRegister.lightspeed_register_id,
          shopId: webRegister.lightspeed_shop_id || '1',
        };
      }

      // 2. Try to find any open register
      const openRegister = await Register.findOne({
        where: {
          archived: false,
          open: true,
          ...shopFilter,
        },
        order: [['id', 'ASC']],
      });

      if (openRegister) {
        return {
          registerId: openRegister.lightspeed_register_id,
          shopId: openRegister.lightspeed_shop_id || '1',
        };
      }

      // 3. Try to find any non-archived register
      const anyRegister = await Register.findOne({
        where: {
          archived: false,
          ...shopFilter,
        },
        order: [['id', 'ASC']],
      });

      if (anyRegister) {
        return {
          registerId: anyRegister.lightspeed_register_id,
          shopId: anyRegister.lightspeed_shop_id || '1',
        };
      }
    } catch (err) {
      logger.error('Error resolving active register from database:', err);
    }

    return {
      registerId: config.lightspeed.defaultRegisterId || '6',
      shopId: config.lightspeed.defaultShopId || '1',
    };
  }

  /**
   * Resolves the active employee for sales / payment flow.
   * Priority:
   * 1. Environment / config override (LIGHTSPEED_DEFAULT_EMPLOYEE_ID)
   * 2. Active employee matching web/online/admin keywords
   * 3. Any active, non-locked employee (lock_out: false, archived: false)
   * 4. Safe fallback ('1') if database has no employees synced yet
   */
  public static async resolveActiveEmployee(shopId?: string): Promise<string> {
    try {
      if (config.lightspeed.defaultEmployeeId) {
        return config.lightspeed.defaultEmployeeId;
      }

      const shopFilter = shopId ? {
        [Op.or]: [
          { limit_to_shop_id: null },
          { lightspeed_limit_to_shop_id: shopId },
          { lightspeed_last_shop_id: shopId },
        ],
      } : {};

      // 1. Try web/api/admin employee
      const webEmployee = await Employee.findOne({
        where: {
          archived: false,
          lock_out: false,
          ...shopFilter,
          [Op.or]: [
            { first_name: { [Op.iLike]: '%web%' } },
            { last_name: { [Op.iLike]: '%web%' } },
            { first_name: { [Op.iLike]: '%api%' } },
            { employee_role_name: { [Op.iLike]: '%api%' } },
            { employee_role_name: { [Op.iLike]: '%web%' } },
            { employee_role_name: { [Op.iLike]: '%admin%' } },
          ],
        },
        order: [['id', 'ASC']],
      });

      if (webEmployee) {
        return webEmployee.lightspeed_employee_id;
      }

      // 2. Try any active, non-locked employee
      const anyEmployee = await Employee.findOne({
        where: {
          archived: false,
          lock_out: false,
          ...shopFilter,
        },
        order: [['id', 'ASC']],
      });

      if (anyEmployee) {
        return anyEmployee.lightspeed_employee_id;
      }
    } catch (err) {
      logger.error('Error resolving active employee from database:', err);
    }

    return config.lightspeed.defaultEmployeeId || '1';
  }

  /**
   * Sync a page of Vendors
   */
  public static async syncVendorsPage(vendorsData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;
      const recordsToUpsert: any[] = [];
      const mappingsToUpsert: any[] = [];

      for (const vendor of vendorsData) {
        const accountNumber = vendor.accountNumber || '';
        const priceLevel = vendor.priceLevel || '';
        const updatePrice = vendor.updatePrice === 'true';
        const updateCost = vendor.updateCost === 'true';
        const updateDescription = vendor.updateDescription === 'true';
        const shareSellThrough = vendor.shareSellThrough === 'true';
        const b2bSellerUid = vendor.b2bSellerUID || '';

        // Extract currency info
        const currencyCode = vendor.purchasingCurrency ? vendor.purchasingCurrency.code || null : null;
        const currencySymbol = vendor.purchasingCurrency ? vendor.purchasingCurrency.symbol || null : null;
        const currencyRate = vendor.purchasingCurrency ? parseFloat(vendor.purchasingCurrency.rate || '1') : null;

        // Extract Rep info
        let repFirstName = null;
        let repLastName = null;
        if (vendor.Reps && vendor.Reps.VendorRep) {
          const reps = Array.isArray(vendor.Reps.VendorRep) ? vendor.Reps.VendorRep : [vendor.Reps.VendorRep];
          if (reps[0]) {
            repFirstName = reps[0].firstName || null;
            repLastName = reps[0].lastName || null;
          }
        }

        // Extract Contact info
        let address1 = null;
        let address2 = null;
        let city = null;
        let state = null;
        let zip = null;
        let country = null;
        let countryCode = null;
        let stateCode = null;
        let phone = null;
        let phoneMobile = null;
        let phoneFax = null;
        let email = null;
        let emailSecondary = null;
        let website = null;
        let contactId = null;
        let contactCustom = null;
        let noEmail = false;
        let noPhone = false;
        let noMail = false;

        if (vendor.Contact) {
          const contact = vendor.Contact;
          contactId = contact.contactID ? String(contact.contactID) : null;
          contactCustom = contact.custom ? String(contact.custom) : null;
          noEmail = contact.noEmail === 'true';
          noPhone = contact.noPhone === 'true';
          noMail = contact.noMail === 'true';

          if (contact.Addresses && contact.Addresses.ContactAddress) {
            const addr = contact.Addresses.ContactAddress;
            address1 = addr.address1 || null;
            address2 = addr.address2 || null;
            city = addr.city || null;
            state = addr.state || null;
            zip = addr.zip || null;
            country = addr.country || null;
            countryCode = addr.countryCode || null;
            stateCode = addr.stateCode || null;
          }
          if (contact.Phones && contact.Phones.ContactPhone) {
            const phones = this.extractList<any>(contact.Phones, 'ContactPhone');
            const workPhone = phones.find((p: any) => p.useType === 'Work');
            const mobPhone = phones.find((p: any) => p.useType === 'Mobile');
            const fxPhone = phones.find((p: any) => p.useType === 'Fax');
            phone = workPhone ? workPhone.number || null : (phones[0]?.number || null);
            phoneMobile = mobPhone ? mobPhone.number || null : null;
            phoneFax = fxPhone ? fxPhone.number || null : null;
          }
          if (contact.Emails && contact.Emails.ContactEmail) {
            const emails = this.extractList<any>(contact.Emails, 'ContactEmail');
            const primEmail = emails.find((e: any) => e.useType === 'Primary');
            const secEmail = emails.find((e: any) => e.useType === 'Secondary');
            email = primEmail ? primEmail.address || null : (emails[0]?.address || null);
            emailSecondary = secEmail ? secEmail.address || null : null;
          }
          if (contact.Websites) {
            if (typeof contact.Websites === 'string') {
              website = contact.Websites;
            } else if (contact.Websites.ContactWebsite) {
              const webs = this.extractList<any>(contact.Websites, 'ContactWebsite');
              website = webs[0]?.url || webs[0] || null;
            }
          }
        }

        const payloadForHash = {
          name: vendor.name,
          archived: vendor.archived === 'true',
          account_number: accountNumber,
          price_level: priceLevel,
          update_price: updatePrice,
          update_cost: updateCost,
          update_description: updateDescription,
          share_sell_through: shareSellThrough,
          b2b_seller_uid: b2bSellerUid,
          purchasing_currency_code: currencyCode,
          purchasing_currency_symbol: currencySymbol,
          purchasing_currency_rate: currencyRate,
          rep_first_name: repFirstName,
          rep_last_name: repLastName,
          address_1: address1,
          address_2: address2,
          city,
          state,
          state_code: stateCode,
          zip,
          country,
          country_code: countryCode,
          phone,
          phone_mobile: phoneMobile,
          phone_fax: phoneFax,
          email,
          email_secondary: emailSecondary,
          website,
          contact_id: contactId,
          custom: contactCustom,
          no_email: noEmail,
          no_phone: noPhone,
          no_mail: noMail,
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'vendor', lightspeed_id: vendor.vendorID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        recordsToUpsert.push({
          lightspeed_vendor_id: vendor.vendorID.toString(),
          name: vendor.name,
          archived: vendor.archived === 'true',
          account_number: accountNumber,
          price_level: priceLevel,
          update_price: updatePrice,
          update_cost: updateCost,
          update_description: updateDescription,
          share_sell_through: shareSellThrough,
          b2b_seller_uid: b2bSellerUid,
          purchasing_currency_code: currencyCode,
          purchasing_currency_symbol: currencySymbol,
          purchasing_currency_rate: currencyRate,
          rep_first_name: repFirstName,
          rep_last_name: repLastName,
          address_1: address1,
          address_2: address2,
          city,
          state,
          state_code: stateCode,
          zip,
          country,
          country_code: countryCode,
          phone,
          phone_mobile: phoneMobile,
          phone_fax: phoneFax,
          email,
          email_secondary: emailSecondary,
          website,
          contact_id: contactId,
          custom: contactCustom,
          no_email: noEmail,
          no_phone: noPhone,
          no_mail: noMail,
        });

        mappingsToUpsert.push({
          lightspeed_id: vendor.vendorID.toString(),
          hash,
          entity_type: 'vendor',
        });
      }

      if (recordsToUpsert.length > 0) {
        const vendors = await Vendor.bulkCreate(recordsToUpsert, {
          updateOnDuplicate: [
            'name',
            'archived',
            'account_number',
            'price_level',
            'update_price',
            'update_cost',
            'update_description',
            'share_sell_through',
            'b2b_seller_uid',
            'purchasing_currency_code',
            'purchasing_currency_symbol',
            'purchasing_currency_rate',
            'rep_first_name',
            'rep_last_name',
            'address_1',
            'address_2',
            'city',
            'state',
            'state_code',
            'zip',
            'country',
            'country_code',
            'phone',
            'phone_mobile',
            'phone_fax',
            'email',
            'email_secondary',
            'website',
            'contact_id',
            'custom',
            'no_email',
            'no_phone',
            'no_mail',
          ],
          transaction,
        });

        const finalMappings = mappingsToUpsert.map((m) => {
          const createdVendor = vendors.find((v) => v.lightspeed_vendor_id === m.lightspeed_id);
          return {
            ...m,
            local_id: createdVendor ? createdVendor.id : 0,
            last_sync: new Date(),
          };
        });

        await LightspeedEntityMap.bulkCreate(finalMappings, {
          updateOnDuplicate: ['local_id', 'hash', 'last_sync'],
          transaction,
        });

        processedCount = recordsToUpsert.length;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing vendors page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Price Levels
   */
  public static async syncPriceLevelsPage(priceLevelsData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;
      const recordsToUpsert: any[] = [];
      const mappingsToUpsert: any[] = [];

      for (const level of priceLevelsData) {
        const payloadForHash = {
          name: level.name,
          archived: level.archived === 'true',
          can_be_archived: level.canBeArchived === 'true',
          type: level.type,
          calculation: (level.Calculation && typeof level.Calculation === 'object') ? level.Calculation : null,
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'price_level', lightspeed_id: level.priceLevelID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        recordsToUpsert.push({
          lightspeed_price_level_id: level.priceLevelID.toString(),
          name: level.name,
          archived: level.archived === 'true',
          can_be_archived: level.canBeArchived === 'true',
          type: level.type,
          calculation: (level.Calculation && typeof level.Calculation === 'object') ? level.Calculation : null,
        });

        mappingsToUpsert.push({
          lightspeed_id: level.priceLevelID.toString(),
          hash,
          entity_type: 'price_level',
        });
      }

      if (recordsToUpsert.length > 0) {
        const levels = await PriceLevel.bulkCreate(recordsToUpsert, {
          updateOnDuplicate: ['name', 'archived', 'can_be_archived', 'type', 'calculation'],
          transaction,
        });

        const finalMappings = mappingsToUpsert.map((m) => {
          const createdLevel = levels.find((l) => l.lightspeed_price_level_id === m.lightspeed_id);
          return {
            ...m,
            local_id: createdLevel ? createdLevel.id : 0,
            last_sync: new Date(),
          };
        });

        await LightspeedEntityMap.bulkCreate(finalMappings, {
          updateOnDuplicate: ['local_id', 'hash', 'last_sync'],
          transaction,
        });

        processedCount = recordsToUpsert.length;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing price levels page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Currency Rates
   */
  public static async syncCurrencyRatesPage(currencyRatesData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;
      const recordsToUpsert: any[] = [];
      const mappingsToUpsert: any[] = [];

      for (const currency of currencyRatesData) {
        const payloadForHash = {
          currency_code: currency.currencyCode,
          rate: currency.rate ? parseFloat(currency.rate) : 1.0,
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'currency_rate', lightspeed_id: currency.currencyRateID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        recordsToUpsert.push({
          lightspeed_currency_rate_id: currency.currencyRateID.toString(),
          currency_code: currency.currencyCode,
          rate: currency.rate ? parseFloat(currency.rate) : 1.0,
        });

        mappingsToUpsert.push({
          lightspeed_id: currency.currencyRateID.toString(),
          hash,
          entity_type: 'currency_rate',
        });
      }

      if (recordsToUpsert.length > 0) {
        const currencies = await CurrencyRate.bulkCreate(recordsToUpsert, {
          updateOnDuplicate: ['currency_code', 'rate'],
          transaction,
        });

        const finalMappings = mappingsToUpsert.map((m) => {
          const createdCurrency = currencies.find((c) => c.lightspeed_currency_rate_id === m.lightspeed_id);
          return {
            ...m,
            local_id: createdCurrency ? createdCurrency.id : 0,
            last_sync: new Date(),
          };
        });

        await LightspeedEntityMap.bulkCreate(finalMappings, {
          updateOnDuplicate: ['local_id', 'hash', 'last_sync'],
          transaction,
        });

        processedCount = recordsToUpsert.length;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing currency rates page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Brands (Manufacturers)
   */
  public static async syncBrandsPage(manufacturersData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;
      const recordsToUpsert: any[] = [];
      const mappingsToUpsert: any[] = [];

      for (const man of manufacturersData) {
        const payloadForHash = {
          name: man.name,
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'brand', lightspeed_id: man.manufacturerID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        recordsToUpsert.push({
          lightspeed_brand_id: man.manufacturerID.toString(),
          name: man.name,
        });

        mappingsToUpsert.push({
          lightspeed_id: man.manufacturerID.toString(),
          hash,
          entity_type: 'brand',
        });
      }

      if (recordsToUpsert.length > 0) {
        const brands = await Brand.bulkCreate(recordsToUpsert, {
          updateOnDuplicate: ['name'],
          transaction,
        });

        const finalMappings = mappingsToUpsert.map((m) => {
          const createdBrand = brands.find((b) => b.lightspeed_brand_id === m.lightspeed_id);
          return {
            ...m,
            local_id: createdBrand ? createdBrand.id : 0,
            last_sync: new Date(),
          };
        });

        await LightspeedEntityMap.bulkCreate(finalMappings, {
          updateOnDuplicate: ['local_id', 'hash', 'last_sync'],
          transaction,
        });

        processedCount = recordsToUpsert.length;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing brands page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Item Attribute Sets
   */
  public static async syncAttributeSetsPage(attributeSetsData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;
      const recordsToUpsert: any[] = [];
      const mappingsToUpsert: any[] = [];

      for (const attrSet of attributeSetsData) {
        const payloadForHash = {
          name: attrSet.name,
          attribute_name_1: attrSet.attributeName1 || null,
          attribute_name_2: attrSet.attributeName2 || null,
          attribute_name_3: attrSet.attributeName3 || null,
          system: attrSet.system === 'true',
          archived: attrSet.archived === 'true',
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'attribute_set', lightspeed_id: attrSet.itemAttributeSetID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        recordsToUpsert.push({
          lightspeed_attribute_set_id: attrSet.itemAttributeSetID.toString(),
          name: attrSet.name,
          attribute_name_1: attrSet.attributeName1 || null,
          attribute_name_2: attrSet.attributeName2 || null,
          attribute_name_3: attrSet.attributeName3 || null,
          system: attrSet.system === 'true',
          archived: attrSet.archived === 'true',
        });

        mappingsToUpsert.push({
          lightspeed_id: attrSet.itemAttributeSetID.toString(),
          hash,
          entity_type: 'attribute_set',
        });
      }

      if (recordsToUpsert.length > 0) {
        const attributeSets = await ItemAttributeSet.bulkCreate(recordsToUpsert, {
          updateOnDuplicate: ['name', 'attribute_name_1', 'attribute_name_2', 'attribute_name_3', 'system', 'archived'],
          transaction,
        });

        const finalMappings = mappingsToUpsert.map((m) => {
          const createdAttrSet = attributeSets.find((a) => a.lightspeed_attribute_set_id === m.lightspeed_id);
          return {
            ...m,
            local_id: createdAttrSet ? createdAttrSet.id : 0,
            last_sync: new Date(),
          };
        });

        await LightspeedEntityMap.bulkCreate(finalMappings, {
          updateOnDuplicate: ['local_id', 'hash', 'last_sync'],
          transaction,
        });

        processedCount = recordsToUpsert.length;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing attribute sets page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Categories
   */
  public static async syncCategoriesPage(categoriesData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      // Sort depth ascending so parent categories always exist before child nodes
      const sortedCategories = [...categoriesData].sort(
        (a, b) => parseInt(a.nodeDepth || '0', 10) - parseInt(b.nodeDepth || '0', 10)
      );

      let processedCount = 0;

      for (const cat of sortedCategories) {
        const depth = parseInt(cat.nodeDepth || '0', 10);
        let parentLocalId: number | null = null;

        if (cat.parentID && cat.parentID !== '0') {
          const parentMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'category', lightspeed_id: cat.parentID.toString() },
            transaction,
          });
          if (parentMap) {
            parentLocalId = parentMap.local_id;
          }
        }

        const payloadForHash = {
          name: cat.name,
          parent_id: parentLocalId,
          full_path_name: cat.fullPathName || null,
          node_depth: depth,
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'category', lightspeed_id: cat.categoryID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        const [dbCategory] = await Category.upsert(
          {
            lightspeed_category_id: cat.categoryID.toString(),
            parent_id: parentLocalId,
            name: cat.name,
            full_path_name: cat.fullPathName || null,
            node_depth: depth,
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'category',
            lightspeed_id: cat.categoryID.toString(),
            local_id: dbCategory.id,
            hash,
            last_sync: new Date(),
          },
          { transaction }
        );

        processedCount++;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing categories page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Tags
   */
  public static async syncTagsPage(tagsData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;
      const recordsToUpsert: any[] = [];
      const mappingsToUpsert: any[] = [];

      for (const tag of tagsData) {
        const payloadForHash = {
          name: tag.name,
          archived: tag.archived === 'true',
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'tag', lightspeed_id: tag.tagID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        recordsToUpsert.push({
          lightspeed_tag_id: tag.tagID.toString(),
          name: tag.name,
          archived: tag.archived === 'true',
        });

        mappingsToUpsert.push({
          lightspeed_id: tag.tagID.toString(),
          hash,
          entity_type: 'tag',
        });
      }

      if (recordsToUpsert.length > 0) {
        const tags = await Tag.bulkCreate(recordsToUpsert, {
          updateOnDuplicate: ['name', 'archived'],
          transaction,
        });

        const finalMappings = mappingsToUpsert.map((m) => {
          const createdTag = tags.find((t) => t.lightspeed_tag_id === m.lightspeed_id);
          return {
            ...m,
            local_id: createdTag ? createdTag.id : 0,
            last_sync: new Date(),
          };
        });

        await LightspeedEntityMap.bulkCreate(finalMappings, {
          updateOnDuplicate: ['local_id', 'hash', 'last_sync'],
          transaction,
        });

        processedCount = recordsToUpsert.length;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing tags page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Product Matrices
   */
  public static async syncMatricesPage(matricesData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;

      for (const matrix of matricesData) {
        let brandLocalId: number | null = null;
        if (matrix.manufacturerID && matrix.manufacturerID !== '0') {
          const brandMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'brand', lightspeed_id: matrix.manufacturerID.toString() },
            transaction,
          });
          brandLocalId = brandMap ? brandMap.local_id : null;
        }

        let categoryLocalId: number | null = null;
        if (matrix.categoryID && matrix.categoryID !== '0') {
          const categoryMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'category', lightspeed_id: matrix.categoryID.toString() },
            transaction,
          });
          categoryLocalId = categoryMap ? categoryMap.local_id : null;
        }

        let vendorLocalId: number | null = null;
        if (matrix.defaultVendorID && matrix.defaultVendorID !== '0') {
          const vendorMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'vendor', lightspeed_id: matrix.defaultVendorID.toString() },
            transaction,
          });
          vendorLocalId = vendorMap ? vendorMap.local_id : null;
        }

        let attributeSetLocalId: number | null = null;
        if (matrix.itemAttributeSetID && matrix.itemAttributeSetID !== '0') {
          const attrSetMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'attribute_set', lightspeed_id: matrix.itemAttributeSetID.toString() },
            transaction,
          });
          attributeSetLocalId = attrSetMap ? attrSetMap.local_id : null;
        }

        let attr1 = matrix.ItemAttributeSet?.attributeName1 || null;
        let attr2 = matrix.ItemAttributeSet?.attributeName2 || null;
        let attr3 = matrix.ItemAttributeSet?.attributeName3 || null;

        if (!attr1 && !attr2 && !attr3 && attributeSetLocalId) {
          const localAttrSet = await ItemAttributeSet.findByPk(attributeSetLocalId, { transaction });
          if (localAttrSet) {
            attr1 = localAttrSet.attribute_name_1;
            attr2 = localAttrSet.attribute_name_2;
            attr3 = localAttrSet.attribute_name_3;
          }
        }

        // Parse Prices
        let price = 0;
        let msrp = 0;
        let onlinePrice = 0;
        if (matrix.Prices && matrix.Prices.ItemPrice) {
          const prices = this.extractList<any>(matrix.Prices, 'ItemPrice');
          const pDefault = prices.find((p) => p.useType === 'Default');
          if (pDefault) price = parseFloat(pDefault.amount || '0');
          const pMSRP = prices.find((p) => p.useType === 'MSRP');
          if (pMSRP) msrp = parseFloat(pMSRP.amount || '0');
          const pOnline = prices.find((p) => p.useType === 'Online');
          if (pOnline) onlinePrice = parseFloat(pOnline.amount || '0');
        }

        const payloadForHash = {
          description: matrix.description,
          attribute_1_name: attr1,
          attribute_2_name: attr2,
          attribute_3_name: attr3,
          brand_id: brandLocalId,
          category_id: categoryLocalId,
          vendor_id: vendorLocalId,
          tax: matrix.tax === 'true',
          default_cost: parseFloat(matrix.defaultCost || '0'),
          item_type: matrix.itemType || 'default',
          serialized: matrix.serialized === 'true',
          model_year: parseInt(matrix.modelYear || '0', 10),
          archived: matrix.archived === 'true',
          tax_class_id: matrix.taxClassID ? matrix.taxClassID.toString() : null,
          tax_class_name: matrix.TaxClass?.name || null,
          item_attribute_set_id: attributeSetLocalId,
          attribute_1_values: Array.isArray(matrix.attribute1Values) ? matrix.attribute1Values : null,
          attribute_2_values: Array.isArray(matrix.attribute2Values) ? matrix.attribute2Values : null,
          attribute_3_values: Array.isArray(matrix.attribute3Values) ? matrix.attribute3Values : null,
          price,
          msrp,
          online_price: onlinePrice,
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'matrix', lightspeed_id: matrix.itemMatrixID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        const [dbMatrix] = await ProductMatrix.upsert(
          {
            lightspeed_matrix_id: matrix.itemMatrixID.toString(),
            description: matrix.description,
            attribute_1_name: attr1,
            attribute_2_name: attr2,
            attribute_3_name: attr3,
            brand_id: brandLocalId,
            category_id: categoryLocalId,
            vendor_id: vendorLocalId,
            tax: matrix.tax === 'true',
            default_cost: parseFloat(matrix.defaultCost || '0'),
            item_type: matrix.itemType || 'default',
            serialized: matrix.serialized === 'true',
            model_year: parseInt(matrix.modelYear || '0', 10),
            archived: matrix.archived === 'true',
            tax_class_id: matrix.taxClassID ? matrix.taxClassID.toString() : null,
            tax_class_name: matrix.TaxClass?.name || null,
            item_attribute_set_id: attributeSetLocalId,
            attribute_1_values: Array.isArray(matrix.attribute1Values) ? matrix.attribute1Values : null,
            attribute_2_values: Array.isArray(matrix.attribute2Values) ? matrix.attribute2Values : null,
            attribute_3_values: Array.isArray(matrix.attribute3Values) ? matrix.attribute3Values : null,
            price,
            msrp,
            online_price: onlinePrice,
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'matrix',
            lightspeed_id: matrix.itemMatrixID.toString(),
            local_id: dbMatrix.id,
            hash,
            last_sync: new Date(),
          },
          { transaction }
        );

        processedCount++;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing matrices page:', error);
      throw error;
    }
  }

  /**
   * Sync a page of Items/Products
   */
  public static async syncItemsPage(itemsData: any[]): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      let processedCount = 0;

      for (const item of itemsData) {
        let brandLocalId: number | null = null;
        if (item.manufacturerID && item.manufacturerID !== '0') {
          const brandMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'brand', lightspeed_id: item.manufacturerID.toString() },
            transaction,
          });
          brandLocalId = brandMap ? brandMap.local_id : null;
        }

        let categoryLocalId: number | null = null;
        if (item.categoryID && item.categoryID !== '0') {
          const categoryMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'category', lightspeed_id: item.categoryID.toString() },
            transaction,
          });
          categoryLocalId = categoryMap ? categoryMap.local_id : null;
        }

        let matrixLocalId: number | null = null;
        if (item.itemMatrixID && item.itemMatrixID !== '0') {
          const matrixMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'matrix', lightspeed_id: item.itemMatrixID.toString() },
            transaction,
          });
          matrixLocalId = matrixMap ? matrixMap.local_id : null;
        }

        // Parse Prices
        let price = 0;
        let msrp = 0;
        let onlinePrice = 0;
        if (item.Prices && item.Prices.ItemPrice) {
          const prices = this.extractList<any>(item.Prices, 'ItemPrice');
          const pDefault = prices.find((p) => p.useType === 'Default');
          if (pDefault) price = parseFloat(pDefault.amount || '0');
          const pMSRP = prices.find((p) => p.useType === 'MSRP');
          if (pMSRP) msrp = parseFloat(pMSRP.amount || '0');
          const pOnline = prices.find((p) => p.useType === 'Online');
          if (pOnline) onlinePrice = parseFloat(pOnline.amount || '0');
        } else if (item.price) {
          price = parseFloat(item.price);
        }

        // Sum Shop Inventory (QOH)
        let totalQoh = 0;
        const shopsList =
          item.ItemShops && item.ItemShops.ItemShop ? this.extractList<any>(item.ItemShops, 'ItemShop') : [];
        for (const shop of shopsList) {
          if (shop.shopID.toString() === '0') continue; // Skip virtual summary shop to prevent double counting
          totalQoh += parseInt(shop.qoh || '0', 10);
        }

        const defaultCost = parseFloat(item.defaultCost || item.avgCost || '0');
        const avgCost = parseFloat(item.avgCost || '0');

        // Check if there are vendor mappings
        const vendorList =
          item.ItemVendorNums && item.ItemVendorNums.ItemVendorNum
            ? this.extractList<any>(item.ItemVendorNums, 'ItemVendorNum')
            : [];

        // Check if there are tag mappings (casing in V3 R-Series JSON is lowercase "tag")
        let tagNames: string[] = [];
        if (item.Tags) {
          const tagsSource = item.Tags.Tag || item.Tags.tag;
          if (tagsSource) {
            if (Array.isArray(tagsSource)) {
              tagNames = tagsSource.map((t: any) =>
                typeof t === 'object' && t !== null && t.name ? String(t.name).trim() : String(t).trim()
              );
            } else if (typeof tagsSource === 'object' && tagsSource !== null) {
              if (tagsSource.name) {
                tagNames = [String(tagsSource.name).trim()];
              }
            } else {
              tagNames = [String(tagsSource).trim()];
            }
          }
        }

        // Check if there are images mappings
        const imagesList = item.Images && item.Images.Image ? this.extractList<any>(item.Images, 'Image') : [];

        const taxClassId = item.taxClassID || (item.TaxClass && item.TaxClass.taxClassID) || null;
        const taxClassName = (item.TaxClass && item.TaxClass.name) || null;

        const noteText = item.Note ? item.Note.note : item.note || null;
        const displayNote = item.Note ? item.Note.isPublic === 'true' : item.displayNote === 'true';

        // Hash values for change detection
        const payloadForHash = {
          product_matrix_id: matrixLocalId,
          brand_id: brandLocalId,
          category_id: categoryLocalId,
          system_sku: item.systemSku || null,
          custom_sku: item.customSku || null,
          upc: item.upc || null,
          ean: item.ean || null,
          manufacturer_sku: item.manufacturerSku || null,
          description: item.description || null,
          price,
          msrp,
          online_price: onlinePrice,
          default_cost: defaultCost,
          avg_cost: avgCost,
          qoh: totalQoh,
          discountable: item.discountable === 'true',
          taxable: item.tax === 'true',
          item_type: item.itemType || 'Item',
          publish_to_ecom: item.publishToEcom === 'true',
          serialized: item.serialized === 'true',
          attribute_1_value: item.attribute1 || null,
          attribute_2_value: item.attribute2 || null,
          attribute_3_value: item.attribute3 || null,
          note: noteText,
          display_note: displayNote,
          archived: item.archived === 'true',
          tax_class_id: taxClassId,
          tax_class_name: taxClassName,
          shops: shopsList.map((s) => ({
            shopID: s.shopID,
            qoh: s.qoh,
            sellable: s.sellable,
            itemShopID: s.itemShopID,
            totalValueAvgCost: s.totalValueAvgCost,
            totalValueFifo: s.totalValueFifo,
            onLayaway: s.onLayaway,
            onSpecialOrder: s.onSpecialOrder,
            onWorkorder: s.onWorkorder,
            reorderPoint: s.reorderPoint,
            reorderLevel: s.reorderLevel,
          })),
          vendors: vendorList.map((v) => ({ vendorID: v.vendorID, sku: v.value })),
          tags: [...tagNames].sort(),
          images: imagesList.map((im) => im.imageID || im.itemImageID || im.publicID),
        };
        const hash = this.calculateHash(payloadForHash);

        const entityMap = await LightspeedEntityMap.findOne({
          where: { entity_type: 'product', lightspeed_id: item.itemID.toString() },
          transaction,
        });

        if (entityMap && entityMap.hash === hash) {
          continue;
        }

        // Upsert Product details
        const [product] = await Product.upsert(
          {
            lightspeed_item_id: item.itemID.toString(),
            product_matrix_id: matrixLocalId,
            brand_id: brandLocalId,
            category_id: categoryLocalId,
            system_sku: item.systemSku || null,
            custom_sku: item.customSku || null,
            upc: item.upc || null,
            ean: item.ean || null,
            manufacturer_sku: item.manufacturerSku || null,
            description: item.description || null,
            price,
            msrp,
            online_price: onlinePrice,
            default_cost: defaultCost,
            avg_cost: avgCost,
            qoh: totalQoh,
            discountable: item.discountable === 'true',
            taxable: item.tax === 'true',
            item_type: item.itemType || 'Item',
            publish_to_ecom: item.publishToEcom === 'true',
            serialized: item.serialized === 'true',
            attribute_1_value: item.attribute1 || null,
            attribute_2_value: item.attribute2 || null,
            attribute_3_value: item.attribute3 || null,
            note: noteText,
            display_note: displayNote,
            archived: item.archived === 'true',
            tax_class_id: taxClassId,
            tax_class_name: taxClassName,
          },
          { transaction }
        );

        // Sync inventories
        for (const shop of shopsList) {
          const shopMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'shop', lightspeed_id: shop.shopID.toString() },
            transaction,
          });
          if (shopMap) {
            const parsedUnitCost = parseFloat(shop.unitCost || '0');
            const parsedAvgCost = parseFloat(shop.averageCost || '0');
            const finalUnitCost =
              parsedUnitCost > 0
                ? parsedUnitCost
                : parsedAvgCost > 0
                  ? parsedAvgCost
                  : defaultCost > 0
                    ? defaultCost
                    : 0;

            const shopQoh = parseInt(shop.qoh || '0', 10);
            const totalValue = parseFloat(shop.totalValueAvgCost || shop.totalValueFifo || '0');

            const layaway = parseInt(shop.onLayaway || '0', 10);
            const specialOrder = parseInt(shop.onSpecialOrder || '0', 10);
            const workorder = parseInt(shop.onWorkorder || '0', 10);
            const reserved = layaway + specialOrder + workorder;
            const totalSaleValue = shopQoh * price;

            const existingInv = await ProductInventory.findOne({
              where: { product_id: product.id, shop_id: shopMap.local_id },
              transaction,
            });

            const inventoryPayload = {
              qoh: shopQoh,
              unit_cost: finalUnitCost,
              reorder_point: parseInt(shop.reorderPoint || '0', 10),
              reorder_level: parseInt(shop.reorderLevel || '0', 10),
              lightspeed_item_shop_id: shop.itemShopID?.toString() || null,
              total_value: totalValue,
              reserved,
              layaway,
              special_order: specialOrder,
              workorder,
              total_sale_value: totalSaleValue,
              sellable: parseInt(shop.sellable || '0', 10),
            };

            if (existingInv) {
              await existingInv.update(inventoryPayload, { transaction });
            } else {
              await ProductInventory.create(
                {
                  product_id: product.id,
                  shop_id: shopMap.local_id,
                  ...inventoryPayload,
                },
                { transaction }
              );
            }
          }
        }

        // Sync vendors with cost caveat (only default vendor writes default cost)
        for (const itemVendor of vendorList) {
          const vendorMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'vendor', lightspeed_id: itemVendor.vendorID.toString() },
            transaction,
          });
          if (vendorMap) {
            const isPrimary =
              item.defaultVendorID && item.defaultVendorID.toString() === itemVendor.vendorID.toString();
            const existingRelation = await ProductVendor.findOne({
              where: { product_id: product.id, vendor_id: vendorMap.local_id },
              transaction,
            });

            const cost = isPrimary ? defaultCost : existingRelation ? existingRelation.vendor_cost : 0.0;

            if (existingRelation) {
              await existingRelation.update(
                {
                  lightspeed_item_vendor_num_id: itemVendor.itemVendorNumID?.toString() || null,
                  vendor_sku: itemVendor.value || null,
                  vendor_cost: cost,
                  is_primary: isPrimary,
                },
                { transaction }
              );
            } else {
              await ProductVendor.create(
                {
                  product_id: product.id,
                  vendor_id: vendorMap.local_id,
                  lightspeed_item_vendor_num_id: itemVendor.itemVendorNumID?.toString() || null,
                  vendor_sku: itemVendor.value || null,
                  vendor_cost: cost,
                  is_primary: isPrimary,
                  lead_time: 0,
                  minimum_order_qty: 0,
                },
                { transaction }
              );
            }
          }
        }

        // Sync Product Tags
        const localTagIds: number[] = [];
        for (const tagName of tagNames) {
          let tagRecord = await Tag.findOne({
            where: { name: tagName },
            transaction,
          });

          if (!tagRecord) {
            const localTagLsId = `local_tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            tagRecord = await Tag.create(
              {
                lightspeed_tag_id: localTagLsId,
                name: tagName,
                archived: false,
              },
              { transaction }
            );

            await LightspeedEntityMap.create(
              {
                entity_type: 'tag',
                lightspeed_id: localTagLsId,
                local_id: tagRecord.id,
                hash: '',
                last_sync: new Date(),
              },
              { transaction }
            );
          }

          if (tagRecord) {
            localTagIds.push(tagRecord.id);
          }
        }

        await ProductTag.destroy({
          where: { product_id: product.id },
          transaction,
        });

        const uniqueTagIds = Array.from(new Set(localTagIds));
        if (uniqueTagIds.length > 0) {
          const bulkTags = uniqueTagIds.map((tagId) => ({
            product_id: product.id,
            tag_id: tagId,
          }));
          await ProductTag.bulkCreate(bulkTags, { transaction });
        }

        // Sync Images and insert SYNC_IMAGE outbox job
        for (const img of imagesList) {
          const imgId = (img.imageID || img.itemImageID || img.publicID)?.toString();
          if (!imgId) {
            logger.warn('Skipping image mapping: no imageID or publicID found.');
            continue;
          }
          const existingImage = await ProductImage.findOne({
            where: { product_id: product.id, lightspeed_image_id: imgId },
            transaction,
          });

          let downloadStatus: 'pending' | 'downloading' | 'done' | 'failed' = 'pending';
          let localPath = null;
          if (existingImage) {
            downloadStatus = existingImage.download_status;
            localPath = existingImage.local_path;
          }

          const lightspeedUrl = `${img.baseImageURL}${img.publicID}.${img.filename.split('.').pop()}`;

          let dbImage;
          let created = false;

          if (existingImage) {
            dbImage = existingImage;
            await existingImage.update(
              {
                lightspeed_url: lightspeedUrl,
                filename: img.filename,
                is_featured: imagesList.indexOf(img) === 0,
              },
              { transaction }
            );
          } else {
            dbImage = await ProductImage.create(
              {
                product_id: product.id,
                lightspeed_image_id: imgId,
                lightspeed_url: lightspeedUrl,
                local_path: localPath,
                filename: img.filename,
                is_featured: imagesList.indexOf(img) === 0,
                download_status: downloadStatus,
              },
              { transaction }
            );
            created = true;
          }

          if (
            created ||
            (!localPath && dbImage.download_status !== 'done' && dbImage.download_status !== 'downloading')
          ) {
            const jobExists = await LightspeedSyncJob.findOne({
              where: {
                job_type: 'SYNC_IMAGE',
                status: { [Op.in]: ['pending', 'processing', 'retry'] },
                payload: {
                  productImageId: dbImage.id,
                },
              },
              transaction,
            });

            if (!jobExists) {
              await LightspeedSyncJob.create(
                {
                  job_type: 'SYNC_IMAGE',
                  payload: { productImageId: dbImage.id, url: lightspeedUrl },
                  status: 'pending',
                  attempts: 0,
                  max_attempts: 3,
                  run_at: new Date(),
                },
                { transaction }
              );
            }
          }
        }

        // Upsert Mapping ledger
        await LightspeedEntityMap.upsert(
          {
            entity_type: 'product',
            lightspeed_id: item.itemID.toString(),
            local_id: product.id,
            hash,
            last_sync: new Date(),
          },
          { transaction }
        );

        processedCount++;
      }

      await transaction.commit();
      return processedCount;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error syncing items page:', error);
      throw error;
    }
  }

  /**
   * Helper function to resolve image URL on demand (Frontend fallback behavior)
   */
  public static resolveImageUrl(image: any): string {
    if (image && image.local_path) {
      return image.local_path;
    }
    if (image && image.lightspeed_url) {
      return image.lightspeed_url;
    }
    return '/assets/placeholder-product.png';
  }

  /**
   * Enqueue a push job to the PG queue (Transactional Outbox helper)
   */
  public static async enqueuePushJob(
    jobType: string,
    payload: any,
    transaction?: any
  ): Promise<LightspeedSyncJob | null> {
    // ─── READ-ONLY GUARD ──────────────────────────────────────────────────────
    // Reject all outbound PUSH jobs in read-only mode before they even enter
    // the queue. This prevents write jobs from accumulating and avoids accidental
    // execution if read-only mode is later turned off.
    const readOnly = await this.isReadOnlyMode();
    if (readOnly) {
      logger.warn(
        `[READ-ONLY MODE] Skipped enqueue of outbound job '${jobType}'. Disable read-only mode to allow writes to Lightspeed.`
      );
      return null;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Safeguard: Skip PUSH_PRODUCT_FIELDS jobs if there are no actual fields changed
    if (jobType === 'PUSH_PRODUCT_FIELDS') {
      const changedFields = payload.changedFields;
      if (!changedFields || Object.keys(changedFields).length === 0) {
        logger.info(`Skipping enqueue of PUSH_PRODUCT_FIELDS: changedFields is empty.`);
        return null;
      }
    }

    logger.info(`Enqueueing push job: ${jobType}`);
    return LightspeedSyncJob.create(
      {
        job_type: jobType,
        payload,
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        run_at: new Date(),
      },
      { transaction }
    );
  }

  /**
   * archiveProduct - sends a DELETE request to Lightspeed API to archive an item
   */
  public static async archiveProduct(lightspeedItemId: string): Promise<any> {
    const path = `Item/${lightspeedItemId}.json`;
    logger.info(`Archiving product ${lightspeedItemId} in Lightspeed...`);
    return this.makeRequest(path, { method: 'DELETE' });
  }

  /**
   * createProduct - creates an item in Lightspeed POS
   */
  public static async createProduct(payload: any): Promise<any> {
    logger.info('Creating product/item in Lightspeed POS with payload:', payload);
    return this.makeRequest('Item.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * updateProduct - updates an item in Lightspeed POS
   */
  public static async updateProduct(lightspeedItemId: string, payload: any): Promise<any> {
    const path = `Item/${lightspeedItemId}.json`;
    logger.info(`Updating product/item ${lightspeedItemId} in Lightspeed POS with payload:`, payload);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * getItem - retrieves a single item from Lightspeed POS with optional query parameters
   */
  public static async getItem(lightspeedItemId: string, queryParams: string = ''): Promise<any> {
    const query = queryParams ? (queryParams.startsWith('?') ? queryParams : `?${queryParams}`) : '';
    const path = `Item/${lightspeedItemId}.json${query}`;
    return this.makeRequest(path, { method: 'GET' });
  }

  /**
   * updateItemQOH - updates QOH on an ItemShop via Item endpoint in Lightspeed POS
   * As per Lightspeed API:
   * PUT /API/V3/Account/{accountID}/Item/{itemID}.json
   * { "ItemShops": { "ItemShop": { "itemShopID": 123, "qoh": 25 } } }
   */
  public static async updateItemQOH(
    lightspeedItemId: string,
    itemShopUpdates: any
  ): Promise<any> {
    const path = `Item/${lightspeedItemId}.json`;
    const payload = {
      ItemShops: {
        ItemShop: itemShopUpdates,
      },
    };
    logger.info(`Updating QOH for item ${lightspeedItemId} in Lightspeed POS:`, payload);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * uploadItemImage - uploads an image file for an item in Lightspeed POS
   */
  public static async uploadItemImage(
    lightspeedItemId: string,
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
    data: any = {}
  ): Promise<any> {
    const path = `Item/${lightspeedItemId}/Image.json`;
    logger.info(`Uploading image for item ${lightspeedItemId} to Lightspeed POS: ${filename}`);

    const formData = new FormData();
    formData.append(
      'data',
      JSON.stringify({
        description: data.description || filename,
        ordering: data.ordering !== undefined ? data.ordering : 0,
        itemID: parseInt(lightspeedItemId, 10),
      })
    );
    formData.append('image', new Blob([fileBuffer], { type: mimetype }), filename);

    return this.makeRequest(path, {
      method: 'POST',
      body: formData as any,
    });
  }

  /**
   * deleteItemImage - deletes an image in Lightspeed POS via DELETE
   */
  public static async deleteItemImage(lightspeedImageId: string, lightspeedItemId?: string): Promise<any> {
    let path = `Image/${lightspeedImageId}.json`;
    logger.info(`Deleting image ${lightspeedImageId} in Lightspeed POS via DELETE...`);
    try {
      return await this.makeRequest(path, { method: 'DELETE' });
    } catch (err: any) {
      if (lightspeedItemId) {
        path = `Item/${lightspeedItemId}/Image/${lightspeedImageId}.json`;
        logger.info(`Retrying deleting image with path ${path}...`);
        return await this.makeRequest(path, { method: 'DELETE' });
      }
      throw err;
    }
  }

  /**
   * updateProductFields - updates specific product fields in Lightspeed
   */
  public static async updateProductFields(lightspeedItemId: string, changedFields: any): Promise<any> {
    const path = `Item/${lightspeedItemId}.json`;
    const body = {
      itemID: parseInt(lightspeedItemId, 10),
      ...changedFields,
    };
    logger.info(`Updating product ${lightspeedItemId} in Lightspeed with fields:`, changedFields);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * updateItemShop - updates specific ItemShop fields (reorderPoint, reorderLevel) in Lightspeed
   */
  public static async updateItemShop(lightspeedItemShopId: string, changedFields: any): Promise<any> {
    const path = `ItemShop/${lightspeedItemShopId}.json`;
    const body = {
      itemShopID: parseInt(lightspeedItemShopId, 10),
      ...changedFields,
    };
    logger.info(`Updating ItemShop ${lightspeedItemShopId} in Lightspeed with fields:`, changedFields);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * createVendor - creates a vendor in Lightspeed POS
   */
  public static async createVendor(payload: any): Promise<any> {
    logger.info('Creating vendor in Lightspeed POS with payload:', payload);
    return this.makeRequest('Vendor.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * updateVendor - updates a vendor in Lightspeed POS
   */
  public static async updateVendor(lightspeedVendorId: string, payload: any): Promise<any> {
    const path = `Vendor/${lightspeedVendorId}.json`;
    logger.info(`Updating vendor ${lightspeedVendorId} in Lightspeed POS with payload:`, payload);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * archiveVendor - archives a vendor in Lightspeed POS via DELETE
   */
  public static async archiveVendor(lightspeedVendorId: string): Promise<any> {
    const path = `Vendor/${lightspeedVendorId}.json`;
    logger.info(`Archiving vendor ${lightspeedVendorId} in Lightspeed POS via DELETE...`);
    return this.makeRequest(path, { method: 'DELETE' });
  }

  /**
   * createManufacturer - creates a manufacturer (brand) in Lightspeed POS
   */
  public static async createManufacturer(payload: any): Promise<any> {
    logger.info('Creating manufacturer in Lightspeed POS with payload:', payload);
    return this.makeRequest('Manufacturer.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * createBrand - alias for createManufacturer
   */
  public static async createBrand(payload: any): Promise<any> {
    return this.createManufacturer(payload);
  }

  /**
   * updateManufacturer - updates a manufacturer (brand) in Lightspeed POS
   */
  public static async updateManufacturer(lightspeedManufacturerId: string, payload: any): Promise<any> {
    const path = `Manufacturer/${lightspeedManufacturerId}.json`;
    logger.info(`Updating manufacturer ${lightspeedManufacturerId} in Lightspeed POS with payload:`, payload);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * updateBrand - alias for updateManufacturer
   */
  public static async updateBrand(lightspeedBrandId: string, payload: any): Promise<any> {
    return this.updateManufacturer(lightspeedBrandId, payload);
  }

  /**
   * createCategory - creates a category in Lightspeed POS
   */
  public static async createCategory(payload: any): Promise<any> {
    logger.info('Creating category in Lightspeed POS with payload:', payload);
    return this.makeRequest('Category.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * updateCategory - updates a category in Lightspeed POS
   */
  public static async updateCategory(lightspeedCategoryId: string, payload: any): Promise<any> {
    const path = `Category/${lightspeedCategoryId}.json`;
    logger.info(`Updating category ${lightspeedCategoryId} in Lightspeed POS with payload:`, payload);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * deleteCategory - deletes a category in Lightspeed POS via DELETE
   */
  public static async deleteCategory(lightspeedCategoryId: string): Promise<any> {
    const path = `Category/${lightspeedCategoryId}.json`;
    logger.info(`Deleting category ${lightspeedCategoryId} in Lightspeed POS via DELETE...`);
    return this.makeRequest(path, { method: 'DELETE' });
  }

  /**
   * createTag - creates a tag in Lightspeed POS
   */
  public static async createTag(payload: any): Promise<any> {
    logger.info('Creating tag in Lightspeed POS with payload:', payload);
    return this.makeRequest('Tag.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * updateTag - updates a tag in Lightspeed POS
   */
  public static async updateTag(lightspeedTagId: string, payload: any): Promise<any> {
    const path = `Tag/${lightspeedTagId}.json`;
    logger.info(`Updating tag ${lightspeedTagId} in Lightspeed POS with payload:`, payload);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * deleteTag - deletes a tag in Lightspeed POS via DELETE
   */
  public static async deleteTag(lightspeedTagId: string): Promise<any> {
    const path = `Tag/${lightspeedTagId}.json`;
    logger.info(`Deleting tag ${lightspeedTagId} in Lightspeed POS via DELETE...`);
    return this.makeRequest(path, { method: 'DELETE' });
  }

  /**
   * createCustomer - creates a customer in Lightspeed POS
   */
  public static async createCustomer(payload: any): Promise<any> {
    logger.info('Creating customer in Lightspeed POS with payload:', payload);
    return this.makeRequest('Customer.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * updateCustomer - updates a customer in Lightspeed POS
   */
  public static async updateCustomer(lightspeedCustomerId: string, payload: any): Promise<any> {
    const path = `Customer/${lightspeedCustomerId}.json`;
    logger.info(`Updating customer ${lightspeedCustomerId} in Lightspeed POS with payload:`, payload);
    return this.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * deleteCustomer - archives a customer in Lightspeed POS via DELETE
   */
  public static async deleteCustomer(lightspeedCustomerId: string): Promise<any> {
    const path = `Customer/${lightspeedCustomerId}.json`;
    logger.info(`Archiving customer ${lightspeedCustomerId} in Lightspeed POS via DELETE...`);
    return this.makeRequest(path, { method: 'DELETE' });
  }

  /**
   * archiveCustomer - alias for deleteCustomer
   */
  public static async archiveCustomer(lightspeedCustomerId: string): Promise<any> {
    return this.deleteCustomer(lightspeedCustomerId);
  }

  /**
   * pushSale - sends a Sale transaction payload to Lightspeed
   */
  public static async pushSale(salePayload: any): Promise<any> {
    logger.info(`Pushing sale transaction to Lightspeed...`);
    return this.makeRequest('Sale.json', {
      method: 'POST',
      body: JSON.stringify(salePayload),
    });
  }

  /**
   * resolveCustomer - resolves a customer by email. Searches locally, queries Lightspeed,
   * or creates/mocks on demand depending on read-only status.
   */
  public static async resolveCustomer(email: string, details: { firstName: string; lastName: string; phone?: string; address?: any }): Promise<string> {
    logger.info(`Resolving customer for email: ${email}`);
    
    // 1. Search locally
    const localCust = await Customer.findOne({ where: { email_primary: email } });
    if (localCust && localCust.lightspeed_customer_id) {
      const isMock = localCust.lightspeed_customer_id.startsWith('mock-');
      const readOnly = await this.isReadOnlyMode();
      if (!isMock || readOnly) {
        logger.info(`Resolved customer locally: ${localCust.lightspeed_customer_id}`);
        return localCust.lightspeed_customer_id;
      }
      logger.info(`Ignoring mock customer ID '${localCust.lightspeed_customer_id}' because read-only mode is disabled.`);
    }

    // 2. Query Lightspeed (allowed since GET is read-only)
    try {
      const response = await this.makeRequest(`Customer.json?email=${encodeURIComponent(email)}`);
      const customersList = response.Customer ? this.extractList<any>(response, 'Customer') : [];
      if (customersList.length > 0) {
        const lsCustomer = customersList[0];
        const lsCustomerId = lsCustomer.customerID.toString();
        
        logger.info(`Resolved customer from Lightspeed: ${lsCustomerId}`);
        if (localCust) {
          localCust.lightspeed_customer_id = lsCustomerId;
          await localCust.save();
        } else {
          await Customer.create({
            first_name: details.firstName || lsCustomer.firstName,
            last_name: details.lastName || lsCustomer.lastName,
            email_primary: email,
            lightspeed_customer_id: lsCustomerId,
            customer_type_id: 1,
          });
        }
        return lsCustomerId;
      }
    } catch (err) {
      logger.error('Error fetching customer from Lightspeed, falling back...', err);
    }

    // 3. Create or Mock
    const readOnly = await this.isReadOnlyMode();
    if (readOnly) {
      const mockLsId = `mock-cust-${Math.floor(Math.random() * 100000)}`;
      logger.info(`Read-only mode active. Creating mock customer ID: ${mockLsId}`);
      if (localCust) {
        localCust.lightspeed_customer_id = mockLsId;
        await localCust.save();
      } else {
        await Customer.create({
          first_name: details.firstName,
          last_name: details.lastName,
          email_primary: email,
          lightspeed_customer_id: mockLsId,
          customer_type_id: 1,
        });
      }
      return mockLsId;
    } else {
      const payload = {
        firstName: details.firstName,
        lastName: details.lastName,
        Contact: {
          Emails: {
            ContactEmail: {
              address: email,
              useType: 'Primary',
            },
          },
          Addresses: details.address ? {
            ContactAddress: {
              address1: details.address.address1,
              city: details.address.city,
              state: details.address.state,
              zip: details.address.zip,
              country: details.address.country,
              countryCode: details.address.countryCode,
            }
          } : undefined,
          Phones: details.phone ? {
            ContactPhone: {
              number: details.phone,
              useType: 'Mobile',
            }
          } : undefined,
        },
      };

      logger.info('Creating customer on Lightspeed...');
      const createResponse = await this.makeRequest('Customer.json', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const lsCustomerId = createResponse.Customer.customerID.toString();
      logger.info(`Customer created successfully on Lightspeed with ID: ${lsCustomerId}`);
      if (localCust) {
        localCust.lightspeed_customer_id = lsCustomerId;
        await localCust.save();
      } else {
        await Customer.create({
          first_name: details.firstName,
          last_name: details.lastName,
          email_primary: email,
          lightspeed_customer_id: lsCustomerId,
          customer_type_id: 1,
        });
      }
      return lsCustomerId;
    }
  }

  /**
   * createOpenSale - creates an open sale on Lightspeed to calculate taxes and get a saleID and ticketNumber.
   * Mocks the response if read-only mode is active.
   */
  public static async createOpenSale(salePayload: any): Promise<{ saleID: string; ticketNumber?: string; calcTotal: string; taxTotal: string }> {
    const readOnly = await this.isReadOnlyMode();
    if (readOnly) {
      logger.info('[READ-ONLY MODE] Intercepting createOpenSale to return locally calculated mock data.');
      
      // Calculate locally (13% Ontario HST)
      let subtotal = 0;
      const lines = salePayload.SaleLines?.SaleLine || [];
      const linesArray = Array.isArray(lines) ? lines : [lines];
      
      for (const line of linesArray) {
        const qty = parseFloat(line.unitQuantity || '0');
        const price = parseFloat(line.unitPrice || '0');
        subtotal += qty * price;
      }
      
      const tax = subtotal * 0.13;
      const total = subtotal + tax;

      return {
        saleID: `mock-sale-${crypto.randomBytes(8).toString('hex')}`,
        ticketNumber: `mock-ticket-${Math.floor(100000 + Math.random() * 900000)}`,
        calcTotal: total.toFixed(2),
        taxTotal: tax.toFixed(2),
      };
    }

    logger.info('Creating open sale transaction on Lightspeed...');
    const response = await this.makeRequest('Sale.json', {
      method: 'POST',
      body: JSON.stringify(salePayload),
    });

    return {
      saleID: response.Sale.saleID.toString(),
      ticketNumber: response.Sale.ticketNumber ? response.Sale.ticketNumber.toString() : undefined,
      calcTotal: response.Sale.calcTotal.toString(),
      taxTotal: response.Sale.taxTotal.toString(),
    };
  }

  /**
   * getSale - retrieves a sale from Lightspeed POS by saleID, optionally loading relations.
   */
  public static async getSale(saleID: string, relations?: string[]): Promise<any> {
    const isMock = saleID.startsWith('mock-sale-');
    if (isMock) {
      return {
        Sale: {
          saleID,
          ticketNumber: `mock-ticket-${saleID.slice(-6)}`,
          completed: true,
        },
      };
    }
    const query = relations && relations.length > 0 ? `?load_relations=${encodeURIComponent(JSON.stringify(relations))}` : '';
    return this.makeRequest(`Sale/${saleID}.json${query}`);
  }

  /**
   * completeSale - completes an open sale in Lightspeed by supplying the payment record.
   * Mocks the response if the sale is a mock sale or read-only mode is active.
   */
  public static async completeSale(saleID: string, amount: string, referenceNumber: string): Promise<any> {
    const isMock = saleID.startsWith('mock-sale-');
    const readOnly = await this.isReadOnlyMode();

    if (isMock || readOnly) {
      logger.info(`[READ-ONLY / MOCK] Bypassing completeSale API write for saleID: ${saleID}`);
      return {
        Sale: {
          saleID,
          ticketNumber: `mock-ticket-${Math.floor(100000 + Math.random() * 900000)}`,
          completed: true,
        },
      };
    }

    // Resolve payment type ID
    let paymentTypeID = '3'; // Default to credit card placeholder ID
    try {
      const response = await this.makeRequest('PaymentType.json');
      const list = response.PaymentType ? this.extractList<any>(response, 'PaymentType') : [];
      const stripePayment = list.find((pt: any) => pt.name.toLowerCase().includes('stripe') || pt.name.toLowerCase().includes('credit'));
      if (stripePayment) {
        paymentTypeID = stripePayment.paymentTypeID.toString();
      }
    } catch (err) {
      logger.error('Error resolving Stripe PaymentType from Lightspeed, using default: 3', err);
    }

    const payload = {
      completed: true,
      SalePayments: {
        SalePayment: {
          paymentTypeID,
          amount,
          referenceNumber,
        },
      },
    };

    logger.info(`Completing sale ${saleID} on Lightspeed with payment amount ${amount}...`);
    return this.makeRequest(`Sale/${saleID}.json`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * getLiveQoh - retrieves the live Quantity on Hand (QOH) for a specific item at a shop.
   * Fallback is handled in caller if API is offline.
   */
  public static async getLiveQoh(lightspeedItemId: string, shopId = 1): Promise<number> {
    try {
      const response = await this.makeRequest(`ItemShop.json?itemID=${lightspeedItemId}&shopID=${shopId}`);
      const list = response.ItemShop ? this.extractList<any>(response, 'ItemShop') : [];
      if (list.length > 0) {
        return parseInt(list[0].qoh || '0', 10);
      }
    } catch (err) {
      logger.error(`Error fetching live QOH for item ${lightspeedItemId} at shop ${shopId}:`, err);
    }
    return 0;
  }

  /**
   * exchangeAuthCode - exchanges authorization_code for OAuth tokens and stores in database
   */
  public static async exchangeAuthCode(code: string, redirectUri: string): Promise<any> {
    logger.info(`Exchanging OAuth authorization code...`);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.lightspeed.clientId,
      client_secret: config.lightspeed.clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(config.lightspeed.oauthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Failed to exchange authorization code: ${response.status} ${errorText}`);
      throw new Error(`Lightspeed OAuth exchange failed: ${response.statusText} - ${errorText}`);
    }

    const data: any = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Save tokens in database (global config row ID=1)
    const lsConfig = await this.getConfig();
    lsConfig.access_token = data.access_token;
    lsConfig.access_token_expires_at = expiresAt;
    if (data.refresh_token) {
      lsConfig.refresh_token = data.refresh_token;
    }
    await lsConfig.save();

    logger.info('OAuth tokens successfully retrieved and stored in database.');
    return data;
  }

  /**
   * Performs a full, sequential, dependency-ordered synchronization of all entities.
   * Runs synchronously in the context of the caller (background worker).
   */
  public static async bootstrapSync(): Promise<void> {
    logger.info('Starting full sequential bootstrap synchronization...');

    // 1. Reset all cursor states to timestamp 0 (force a full pull)
    await LightspeedSyncState.update({ last_cursor_ts: null, status: 'idle', last_error: null }, { where: {} });

    // 2. Sync Shops
    logger.info('Bootstrap [Step 1/8]: Syncing Shops...');
    await this.syncEntityDirectly('shop', 'Shop.json', this.syncShopsPage.bind(this), true);

    // Sync Price Levels
    logger.info('Bootstrap: Syncing Price Levels...');
    await this.syncEntityDirectly('price_level', 'PriceLevel.json', this.syncPriceLevelsPage.bind(this), false);

    // Sync Currency Rates
    logger.info('Bootstrap: Syncing Currency Rates...');
    await this.syncEntityDirectly('currency_rate', 'CurrencyRate.json', this.syncCurrencyRatesPage.bind(this), false);

    // Sync Employees
    logger.info('Bootstrap: Syncing Employees...');
    await this.syncEntityDirectly(
      'employee',
      'Employee.json',
      this.syncEmployeesPage.bind(this),
      true,
      'load_relations=["Contact","EmployeeRole"]&archived=all'
    );

    // Sync Registers
    logger.info('Bootstrap: Syncing Registers...');
    await this.syncEntityDirectly('register', 'Register.json', this.syncRegistersPage.bind(this), false, 'archived=all');

    // 3. Sync Vendors
    logger.info('Bootstrap [Step 2/8]: Syncing Vendors...');
    await this.syncEntityDirectly('vendor', 'Vendor.json', this.syncVendorsPage.bind(this), true, 'load_relations=["Contact"]&archived=all');

    // 4. Sync Brands
    logger.info('Bootstrap [Step 3/8]: Syncing Brands...');
    await this.syncEntityDirectly('brand', 'Manufacturer.json', this.syncBrandsPage.bind(this), true);

    // 5. Sync Categories (sorted by depth to preserve hierarchy)
    logger.info('Bootstrap [Step 4/8]: Syncing Categories...');
    await this.syncCategoriesDirectly();

    // 6. Sync Tags
    logger.info('Bootstrap [Step 5/8]: Syncing Tags...');
    await this.syncEntityDirectly('tag', 'Tag.json', this.syncTagsPage.bind(this), false);

    // 7. Sync Item Attribute Sets
    logger.info('Bootstrap [Step 6/8]: Syncing Item Attribute Sets...');
    await this.syncEntityDirectly('attribute_set', 'ItemAttributeSet.json', this.syncAttributeSetsPage.bind(this), false);

    // 8. Sync Matrices
    logger.info('Bootstrap [Step 7/8]: Syncing Item Matrices...');
    await this.syncEntityDirectly(
      'matrix',
      'ItemMatrix.json',
      this.syncMatricesPage.bind(this),
      true,
      'load_relations=["ItemAttributeSet","TaxClass"]&archived=all'
    );

    // 9. Sync Products (Items)
    logger.info('Bootstrap [Step 8/8]: Syncing Products...');
    await this.syncProductsDirectly();

    logger.info('Full sequential bootstrap synchronization completed successfully.');
  }

  private static async syncEntityDirectly(
    entityType: string,
    endpoint: string,
    syncPageFn: (data: any[]) => Promise<number>,
    useTimestamp: boolean,
    extraParams = 'archived=all'
  ): Promise<void> {
    const [state] = await LightspeedSyncState.findOrCreate({
      where: { entity_type: entityType },
      defaults: {
        entity_type: entityType,
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
      const lastCursor = state.last_cursor_ts ? new Date(state.last_cursor_ts) : new Date(0);

      let nextUrl: string | null = null;
      let totalFetched = 0;
      let maxCursorTime = lastCursor.getTime();

      do {
        const { data, next } = await this.fetchResource(
          nextUrl || endpoint,
          nextUrl ? undefined : useTimestamp ? lastCursor : undefined,
          100,
          nextUrl ? '' : extraParams
        );
        nextUrl = next;

        if (data.length > 0) {
          await syncPageFn(data);

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
      logger.info(`Bootstrap: synced ${totalFetched} records of type '${entityType}'.`);
    } catch (err: any) {
      state.status = 'error';
      state.last_error = err.message;
      await state.save();
      logger.error(`Bootstrap failed for entity type '${entityType}':`, err);
      throw err;
    }
  }

  private static async syncCategoriesDirectly(): Promise<void> {
    const entityType = 'category';
    const [state] = await LightspeedSyncState.findOrCreate({
      where: { entity_type: entityType },
      defaults: {
        entity_type: entityType,
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
      const lastCursor = state.last_cursor_ts ? new Date(state.last_cursor_ts) : new Date(0);

      let nextUrl: string | null = null;
      const allCategories: any[] = [];
      let maxCursorTime = lastCursor.getTime();

      do {
        const { data, next } = await this.fetchResource(
          nextUrl || 'Category.json',
          nextUrl ? undefined : lastCursor,
          100,
          nextUrl ? '' : 'archived=all'
        );
        nextUrl = next;
        allCategories.push(...data);
      } while (nextUrl);

      if (allCategories.length > 0) {
        // Sort depth ascending so parent categories always exist before child nodes
        allCategories.sort((a, b) => parseInt(a.nodeDepth || '0', 10) - parseInt(b.nodeDepth || '0', 10));

        // Sync in chunks of 100
        for (let i = 0; i < allCategories.length; i += 100) {
          const chunk = allCategories.slice(i, i + 100);
          await this.syncCategoriesPage(chunk);
        }

        for (const row of allCategories) {
          if (row.timeStamp) {
            const ts = new Date(row.timeStamp).getTime();
            if (ts > maxCursorTime) maxCursorTime = ts;
          }
        }
      }

      state.last_cursor_ts = new Date(maxCursorTime).toISOString();
      state.last_synced_at = new Date();
      state.status = 'idle';
      state.records_processed = allCategories.length;
      state.last_error = null;
      await state.save();
      logger.info(`Bootstrap: synced ${allCategories.length} categories.`);
    } catch (err: any) {
      state.status = 'error';
      state.last_error = err.message;
      await state.save();
      logger.error(`Bootstrap failed for Categories:`, err);
      throw err;
    }
  }

  private static async syncProductsDirectly(): Promise<void> {
    const entityType = 'product';
    const [state] = await LightspeedSyncState.findOrCreate({
      where: { entity_type: entityType },
      defaults: {
        entity_type: entityType,
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
      const lastCursor = state.last_cursor_ts ? new Date(state.last_cursor_ts) : new Date(0);

      let nextUrl: string | null = null;
      let totalFetched = 0;
      let maxCursorTime = lastCursor.getTime();

      do {
        const { data: items, next } = await this.fetchResource(
          nextUrl || 'Item.json',
          nextUrl ? undefined : lastCursor,
          100,
          nextUrl ? '' : 'load_relations=["ItemShops","Images","Tags","ItemVendorNums","TaxClass","Note"]&archived=all'
        );
        nextUrl = next;

        if (items.length > 0) {
          await this.syncItemsPage(items);

          for (const item of items) {
            if (item.timeStamp) {
              const ts = new Date(item.timeStamp).getTime();
              if (ts > maxCursorTime) maxCursorTime = ts;
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
      logger.info(`Bootstrap: synced ${totalFetched} products.`);
    } catch (err: any) {
      state.status = 'error';
      state.last_error = err.message;
      await state.save();
      logger.error(`Bootstrap failed for Products:`, err);
      throw err;
    }
  }

  /**
   * syncCustomerTypesPage - updates customer types in local DB
   */
  public static async syncCustomerTypesPage(types: any[]): Promise<void> {
    const transaction = await sequelize.transaction();
    try {
      for (const type of types) {
        // Resolve discount mapping
        let discountId: number | null = null;
        if (type.discountID && type.discountID.toString() !== '0') {
          const discMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'discount', lightspeed_id: type.discountID.toString() },
            transaction,
          });
          if (discMap) {
            discountId = discMap.local_id;
          }
        }

        // Resolve tax category mapping
        let taxCategoryId: number | null = null;
        if (type.taxCategoryID && type.taxCategoryID.toString() !== '0') {
          const taxMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'tax_category', lightspeed_id: type.taxCategoryID.toString() },
            transaction,
          });
          if (taxMap) {
            taxCategoryId = taxMap.local_id;
          }
        }

        const [localType] = await CustomerType.upsert(
          {
            lightspeed_customer_type_id: type.customerTypeID.toString(),
            name: type.name,
            tax_category_id: taxCategoryId,
            discount_id: discountId,
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'customer_type',
            lightspeed_id: type.customerTypeID.toString(),
            local_id: localType.id,
            hash: this.calculateHash({ name: type.name }),
          },
          { transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * syncCreditAccountsPage - updates credit accounts (and gift cards) in local DB
   */
  public static async syncCreditAccountsPage(accounts: any[]): Promise<void> {
    const transaction = await sequelize.transaction();
    try {
      for (const acc of accounts) {
        const [localAcc] = await CreditAccount.upsert(
          {
            lightspeed_credit_account_id: acc.creditAccountID.toString(),
            name: acc.name,
            code: acc.code || null,
            description: acc.description || null,
            gift_card: acc.giftCard === 'true',
            balance: parseFloat(acc.balance || '0'),
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'credit_account',
            lightspeed_id: acc.creditAccountID.toString(),
            local_id: localAcc.id,
            hash: this.calculateHash({ name: acc.name, balance: acc.balance }),
          },
          { transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * syncCustomersPage - updates customer details (with nested notes and contact info) in local DB
   */
  public static async syncCustomersPage(customers: any[]): Promise<void> {
    const transaction = await sequelize.transaction();
    try {
      for (const cust of customers) {
        // Resolve customer type mapping
        let customerTypeId: number | null = null;
        if (cust.customerTypeID && cust.customerTypeID.toString() !== '0') {
          const typeMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'customer_type', lightspeed_id: cust.customerTypeID.toString() },
            transaction,
          });
          if (typeMap) {
            customerTypeId = typeMap.local_id;
          } else {
            const ct = await CustomerType.findOne({
              where: { lightspeed_customer_type_id: cust.customerTypeID.toString() },
              transaction,
            });
            if (ct) {
              customerTypeId = ct.id;
            }
          }
        }

        // Resolve credit account mapping
        let creditAccountId: number | null = null;
        if (cust.creditAccountID && cust.creditAccountID.toString() !== '0') {
          const accMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'credit_account', lightspeed_id: cust.creditAccountID.toString() },
            transaction,
          });
          if (accMap) {
            creditAccountId = accMap.local_id;
          } else {
            const ca = await CreditAccount.findOne({
              where: { lightspeed_credit_account_id: cust.creditAccountID.toString() },
              transaction,
            });
            if (ca) {
              creditAccountId = ca.id;
            }
          }
        }

        // Resolve discount mapping
        let discountId: number | null = null;
        const lsDiscountId = cust.discountID || (cust.Discount && cust.Discount.discountID);
        if (lsDiscountId && lsDiscountId.toString() !== '0') {
          const discMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'discount', lightspeed_id: lsDiscountId.toString() },
            transaction,
          });
          if (discMap) {
            discountId = discMap.local_id;
          } else {
            let discRecord = await Discount.findOne({
              where: { lightspeed_discount_id: lsDiscountId.toString() },
              transaction,
            });
            if (!discRecord && cust.Discount) {
              discRecord = await Discount.create(
                {
                  lightspeed_discount_id: lsDiscountId.toString(),
                  name: cust.Discount.name || `Discount ${lsDiscountId}`,
                  discount_amount: parseFloat(cust.Discount.discountAmount || '0'),
                  discount_percent: parseFloat(cust.Discount.discountPercent || '0'),
                  require_customer: cust.Discount.requireCustomer === 'true',
                  archived: cust.Discount.archived === 'true',
                },
                { transaction }
              );

              await LightspeedEntityMap.create(
                {
                  entity_type: 'discount',
                  lightspeed_id: lsDiscountId.toString(),
                  local_id: discRecord.id,
                  hash: '',
                  last_sync: new Date(),
                },
                { transaction }
              );
            }
            if (discRecord) {
              discountId = discRecord.id;
            }
          }
        }

        // Resolve tax category mapping
        let taxCategoryId: number | null = null;
        const lsTaxCategoryId = cust.taxCategoryID || (cust.TaxCategory && cust.TaxCategory.taxCategoryID);
        if (lsTaxCategoryId && lsTaxCategoryId.toString() !== '0') {
          const taxMap = await LightspeedEntityMap.findOne({
            where: { entity_type: 'tax_category', lightspeed_id: lsTaxCategoryId.toString() },
            transaction,
          });
          if (taxMap) {
            taxCategoryId = taxMap.local_id;
          } else if (cust.TaxCategory) {
            let taxCategoryRecord = await TaxCategory.findOne({
              where: { lightspeed_tax_category_id: lsTaxCategoryId.toString() },
              transaction,
            });
            if (!taxCategoryRecord) {
              taxCategoryRecord = await TaxCategory.create(
                {
                  lightspeed_tax_category_id: lsTaxCategoryId.toString(),
                  is_tax_inclusive: cust.TaxCategory.isTaxInclusive === 'true',
                  tax_1_name: cust.TaxCategory.tax1Name || null,
                  tax_2_name: cust.TaxCategory.tax2Name || null,
                  tax_1_rate: parseFloat(cust.TaxCategory.tax1Rate || '0'),
                  tax_2_rate: parseFloat(cust.TaxCategory.tax2Rate || '0'),
                },
                { transaction }
              );

              await LightspeedEntityMap.create(
                {
                  entity_type: 'tax_category',
                  lightspeed_id: lsTaxCategoryId.toString(),
                  local_id: taxCategoryRecord.id,
                  hash: '',
                  last_sync: new Date(),
                },
                { transaction }
              );
            }
            taxCategoryId = taxCategoryRecord.id;
          }
        }

        // Extract Contact sub-objects
        const contact = cust.Contact || {};
        const contactId = contact.contactID
          ? String(contact.contactID)
          : (cust.contactID ? String(cust.contactID) : null);
        const customField = contact.custom || cust.custom || null;

        // Emails
        const emails = this.extractList<any>(contact.Emails || {}, 'ContactEmail');
        const primaryEmail = emails.find((e: any) => e.useType === 'Primary')?.address || null;
        const secondaryEmail = emails.find((e: any) => e.useType === 'Secondary')?.address || null;

        // Phones
        const phones = this.extractList<any>(contact.Phones || {}, 'ContactPhone');
        const mobilePhone = phones.find((p: any) => p.useType === 'Mobile')?.number || null;
        const homePhone = phones.find((p: any) => p.useType === 'Home')?.number || null;
        const workPhone = phones.find((p: any) => p.useType === 'Work')?.number || null;
        const pagerPhone = phones.find((p: any) => p.useType === 'Pager')?.number || null;
        const faxPhone = phones.find((p: any) => p.useType === 'Fax')?.number || null;

        // Websites
        const websites = this.extractList<any>(contact.Websites || {}, 'ContactWebsite');
        const website = websites[0]?.url || null;

        // Addresses
        const addresses = this.extractList<any>(contact.Addresses || {}, 'ContactAddress');
        const primaryAddress = addresses[0] || {};

        // Notes (safely parse relation)
        let noteText = null;
        let noteIsPublic = false;
        if (cust.Note) {
          if (cust.Note.Note) {
            const notes = this.extractList<any>(cust.Note, 'Note');
            noteText = notes[0]?.note || null;
            noteIsPublic = notes[0]?.isPublic === 'true';
          } else {
            noteText = cust.Note.note || null;
            noteIsPublic = cust.Note.isPublic === 'true';
          }
        }

        // Extract Tags (casing in V3 R-Series JSON is lowercase "tag")
        let tagNames: string[] = [];
        if (cust.Tags) {
          const tagsSource = cust.Tags.Tag || cust.Tags.tag;
          if (tagsSource) {
            if (Array.isArray(tagsSource)) {
              tagNames = tagsSource.map((t: any) =>
                typeof t === 'object' && t !== null && t.name ? String(t.name).trim() : String(t).trim()
              );
            } else if (typeof tagsSource === 'object' && tagsSource !== null) {
              if (tagsSource.name) {
                tagNames = [String(tagsSource.name).trim()];
              }
            } else {
              tagNames = [String(tagsSource).trim()];
            }
          }
        }
        const tagsArray = tagNames.length > 0 ? tagNames : null;

        const customerPayload = {
          lightspeed_customer_id: cust.customerID.toString(),
          first_name: cust.firstName || '',
          last_name: cust.lastName || '',
          dob: cust.dob ? new Date(cust.dob) : null,
          title: cust.title || null,
          company: cust.company || null,
          company_registration_number: cust.companyRegistrationNumber || null,
          vat_number: cust.vatNumber || null,
          credit_account_id: creditAccountId,
          customer_type_id: customerTypeId,
          discount_id: discountId,
          tax_category_id: taxCategoryId,
          tags: tagsArray,
          custom: customField,
          contact_id: contactId,
          archived: cust.archived === 'true',
          address_1: primaryAddress.address1 || null,
          address_2: primaryAddress.address2 || null,
          city: primaryAddress.city || null,
          state: primaryAddress.state || null,
          state_code: primaryAddress.stateCode || null,
          zip: primaryAddress.zip || null,
          country: primaryAddress.country || null,
          country_code: primaryAddress.countryCode || null,
          phone_mobile: mobilePhone,
          phone_home: homePhone,
          phone_work: workPhone,
          phone_pager: pagerPhone,
          phone_fax: faxPhone,
          email_primary: primaryEmail,
          email_secondary: secondaryEmail,
          website,
          no_email: contact.noEmail === 'true',
          no_phone: contact.noPhone === 'true',
          no_mail: contact.noMail === 'true',
          note: noteText,
          note_is_public: noteIsPublic,
        };

        const [localCust] = await Customer.upsert(customerPayload, { transaction });

        const payloadForHash = {
          first_name: cust.firstName,
          last_name: cust.lastName,
          email: primaryEmail,
          phone: mobilePhone,
          archived: cust.archived === 'true',
          tax_category_id: taxCategoryId,
          discount_id: discountId,
          tags: tagsArray ? [...tagsArray].sort() : [],
          note: noteText,
          note_is_public: noteIsPublic,
        };
        const hash = this.calculateHash(payloadForHash);

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'customer',
            lightspeed_id: cust.customerID.toString(),
            local_id: localCust.id,
            hash,
          },
          { transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * pushCustomerToLightspeed - creates or updates a customer in Lightspeed
   */
  public static async pushCustomerToLightspeed(localCustomerId: number): Promise<any> {
    const customer = await Customer.findByPk(localCustomerId);
    if (!customer) {
      throw new Error(`Customer ID ${localCustomerId} not found.`);
    }

    // Build the payload
    const payload: any = {
      firstName: customer.first_name,
      lastName: customer.last_name,
      dob: customer.dob ? customer.dob.toISOString() : null,
      title: customer.title || null,
      company: customer.company || null,
      companyRegistrationNumber: customer.company_registration_number || null,
      vatNumber: customer.vat_number || null,
    };

    // Association IDs for Lightspeed
    if (customer.customer_type_id) {
      const ct = await CustomerType.findByPk(customer.customer_type_id);
      if (ct?.lightspeed_customer_type_id) {
        payload.customerTypeID = parseInt(ct.lightspeed_customer_type_id, 10) || 0;
      }
    }
    if (customer.discount_id) {
      const disc = await Discount.findByPk(customer.discount_id);
      if (disc?.lightspeed_discount_id) {
        payload.discountID = parseInt(disc.lightspeed_discount_id, 10) || 0;
      }
    }
    if (customer.tax_category_id) {
      const tc = await TaxCategory.findByPk(customer.tax_category_id);
      if (tc?.lightspeed_tax_category_id) {
        payload.taxCategoryID = parseInt(tc.lightspeed_tax_category_id, 10) || 0;
      }
    }
    if (customer.credit_account_id) {
      const ca = await CreditAccount.findByPk(customer.credit_account_id);
      if (ca?.lightspeed_credit_account_id) {
        payload.creditAccountID = parseInt(ca.lightspeed_credit_account_id, 10) || 0;
      }
    }

    // Note
    if (customer.note) {
      payload.Note = {
        note: customer.note,
        isPublic: customer.note_is_public ? 'true' : 'false',
      };
    }

    // Tags
    if (customer.tags) {
      const tagList = Array.isArray(customer.tags)
        ? customer.tags
        : typeof customer.tags === 'string'
          ? (customer.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];
      if (tagList.length === 1) {
        payload.Tags = { tag: tagList[0] };
      } else if (tagList.length > 1) {
        payload.Tags = tagList.map((t: string) => ({ tag: t }));
      }
    }

    // Contact details
    const contact: any = {
      noEmail: customer.no_email ? 'true' : 'false',
      noPhone: customer.no_phone ? 'true' : 'false',
      noMail: customer.no_mail ? 'true' : 'false',
    };

    if (customer.custom) {
      contact.custom = customer.custom;
    }

    // Address
    if (customer.address_1 || customer.city || customer.zip) {
      contact.Addresses = {
        ContactAddress: {
          address1: customer.address_1 || '',
          address2: customer.address_2 || '',
          city: customer.city || '',
          state: customer.state || '',
          stateCode: customer.state_code || '',
          zip: customer.zip || '',
          country: customer.country || '',
          countryCode: customer.country_code || '',
        },
      };
    }

    // Emails
    const emailList = [];
    if (customer.email_primary) {
      emailList.push({ address: customer.email_primary, useType: 'Primary' });
    }
    if (customer.email_secondary) {
      emailList.push({ address: customer.email_secondary, useType: 'Secondary' });
    }
    if (emailList.length > 0) {
      contact.Emails = { ContactEmail: emailList };
    }

    // Phones
    const phoneList = [];
    if (customer.phone_mobile) {
      phoneList.push({ number: customer.phone_mobile, useType: 'Mobile' });
    }
    if (customer.phone_home) {
      phoneList.push({ number: customer.phone_home, useType: 'Home' });
    }
    if (customer.phone_work) {
      phoneList.push({ number: customer.phone_work, useType: 'Work' });
    }
    if (customer.phone_pager) {
      phoneList.push({ number: customer.phone_pager, useType: 'Pager' });
    }
    if (customer.phone_fax) {
      phoneList.push({ number: customer.phone_fax, useType: 'Fax' });
    }
    if (phoneList.length > 0) {
      contact.Phones = { ContactPhone: phoneList };
    }

    // Website
    if (customer.website) {
      contact.Websites = {
        ContactWebsite: [{ url: customer.website }],
      };
    }

    payload.Contact = contact;

    let response: any;
    if (customer.lightspeed_customer_id) {
      // Update
      const path = `Customer/${customer.lightspeed_customer_id}.json`;
      logger.info(`Updating customer ${customer.lightspeed_customer_id} on Lightspeed...`);
      response = await this.makeRequest(path, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      // Create
      logger.info(`Creating customer ${customer.first_name} ${customer.last_name} on Lightspeed...`);
      response = await this.makeRequest('Customer.json', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    // Extract the returned customer
    const responseCustomer = this.extractList<any>(response, 'Customer')[0];
    if (!responseCustomer || !responseCustomer.customerID) {
      throw new Error('Invalid response from Lightspeed Customer API');
    }

    const lightspeedCustomerId = responseCustomer.customerID.toString();

    // If it was a create, update the local customer model with the ID
    if (!customer.lightspeed_customer_id) {
      await customer.update({ lightspeed_customer_id: lightspeedCustomerId });
    }

    // Calculate hash for local map tracking
    const payloadForHash = {
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email_primary,
      phone: customer.phone_mobile,
      archived: customer.archived,
    };
    const hash = this.calculateHash(payloadForHash);

    // Write mapping
    await LightspeedEntityMap.upsert({
      entity_type: 'customer',
      lightspeed_id: lightspeedCustomerId,
      local_id: customer.id,
      hash,
    });

    return responseCustomer;
  }

  /**
   * archiveCustomerOnLightspeed - archives a customer on Lightspeed using DELETE
   */
  public static async archiveCustomerOnLightspeed(lightspeedCustomerId: string): Promise<any> {
    const path = `Customer/${lightspeedCustomerId}.json`;
    logger.info(`Archiving customer ${lightspeedCustomerId} in Lightspeed...`);
    return this.makeRequest(path, { method: 'DELETE' });
  }

  /**
   * syncDiscountsPage - updates discounts in local DB
   */
  public static async syncDiscountsPage(discounts: any[]): Promise<void> {
    const transaction = await sequelize.transaction();
    try {
      for (const disc of discounts) {
        const [localDisc] = await Discount.upsert(
          {
            lightspeed_discount_id: disc.discountID.toString(),
            name: disc.name,
            discount_amount: parseFloat(disc.discountAmount || '0'),
            discount_percent: parseFloat(disc.discountPercent || '0'),
            require_customer: disc.requireCustomer === 'true',
            archived: disc.archived === 'true',
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'discount',
            lightspeed_id: disc.discountID.toString(),
            local_id: localDisc.id,
            hash: this.calculateHash({ name: disc.name, archived: disc.archived }),
          },
          { transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * syncTaxCategoriesPage - updates tax categories in local DB
   */
  public static async syncTaxCategoriesPage(categories: any[]): Promise<void> {
    const transaction = await sequelize.transaction();
    try {
      for (const cat of categories) {
        const [localCat] = await TaxCategory.upsert(
          {
            lightspeed_tax_category_id: cat.taxCategoryID.toString(),
            is_tax_inclusive: cat.isTaxInclusive === 'true',
            tax_1_name: cat.tax1Name || null,
            tax_2_name: cat.tax2Name || null,
            tax_1_rate: parseFloat(cat.tax1Rate || '0'),
            tax_2_rate: parseFloat(cat.tax2Rate || '0'),
          },
          { transaction }
        );

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'tax_category',
            lightspeed_id: cat.taxCategoryID.toString(),
            local_id: localCat.id,
            hash: this.calculateHash({ isTaxInclusive: cat.isTaxInclusive, tax1Rate: cat.tax1Rate }),
          },
          { transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export default LightspeedService;
