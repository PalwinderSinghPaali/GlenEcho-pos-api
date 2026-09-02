import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { Brand, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import logger from '@/utils/logger';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Brand instance to include all the exact fields that are there in
 * Lightspeed (both camelCase and original database keys) so that the admin
 * panel receives a payload perfectly synced with the Lightspeed Manufacturer schema.
 */
function formatBrand(brandObj: any) {
  if (!brandObj) return null;
  const json = brandObj.toJSON ? brandObj.toJSON() : brandObj;

  return {
    ...json,
    // Exact Lightspeed API fields
    manufacturerID: parseInt(brandObj.lightspeed_brand_id, 10) || 0,
    name: brandObj.name,
    createTime: brandObj.createdAt || null,
    timeStamp: brandObj.updatedAt || null,
    productCount: json.productCount !== undefined ? (parseInt(json.productCount, 10) || 0) : undefined,
  };
}

// ---------------------------------------------------------------------------
// 1. GET /brand — Paginated flat list (maps to GET /Manufacturer.json)
// ---------------------------------------------------------------------------

export const getBrands = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where[Op.or] = [{ name: { [Op.iLike]: `%${search}%` } }, { lightspeed_brand_id: { [Op.iLike]: `%${search}%` } }];
    }

    const queryOptions: FindOptions = {
      where,
      attributes: {
        include: [
          [
            Brand.sequelize!.literal(`(
              SELECT COUNT(*)::int
              FROM products AS p
              WHERE p.brand_id = "Brand".id
            )`),
            'productCount'
          ]
        ]
      },
      order: [['name', sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Brand.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: Brand) => formatBrand(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const brands = await Brand.findAll(queryOptions);
    const formattedBrands = brands.map((b: Brand) => formatBrand(b));
    return res.sendSuccess(res, formattedBrands);
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 2. GET /brand/:id — Single brand detail (maps to GET /Manufacturer/{manufacturerID}.json)
// ---------------------------------------------------------------------------

export const getBrand = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid brand ID.');
    }

    const brand = await Brand.findByPk(id);
    if (!brand) {
      return res.sendError(res, 'Brand not found.');
    }

    // Retrieve Lightspeed sync metadata from the entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'brand',
        lightspeed_id: brand.lightspeed_brand_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatBrand(brand),
      lightspeed_sync_info: syncInfo
        ? {
            entity_map_id: syncInfo.id,
            lightspeed_id: syncInfo.lightspeed_id,
            local_id: syncInfo.local_id,
            last_sync: syncInfo.last_sync,
            hash: syncInfo.hash,
          }
        : null,
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 3. POST /brand — Create brand (maps to POST /Manufacturer.json)
// ---------------------------------------------------------------------------

export const createBrand = async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: unknown };

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.sendError(res, 'Brand name is required.');
    }

    const trimmedName = name.trim();

    // Check duplicate local name
    const existing = await Brand.findOne({ where: { name: trimmedName } });
    if (existing) {
      return res.sendError(res, `Brand with name '${trimmedName}' already exists.`);
    }

    const lsPayload = {
      name: trimmedName,
    };

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log('[READ-ONLY] Lightspeed Manufacturer CREATE payload:\n', JSON.stringify(lsPayload, null, 2));
      logger.info(
        '[READ-ONLY] Lightspeed Manufacturer CREATE payload (not sent): POST /Manufacturer.json ' +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(
        res,
        {
          message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
          payload: lsPayload,
        },
        200
      );
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    logger.info('Sending Manufacturer CREATE request to Lightspeed POS...');
    const response = await LightspeedService.createManufacturer(lsPayload);
    const responseList = LightspeedService.extractList<any>(response, 'Manufacturer');
    const lsManufacturer = responseList[0] || response.Manufacturer;
    if (!lsManufacturer || !lsManufacturer.manufacturerID) {
      throw new Error('Invalid response received from Lightspeed Manufacturer API.');
    }

    const lightspeedBrandId = lsManufacturer.manufacturerID.toString();

    // Create locally in database
    const brand = await Brand.create({
      name: trimmedName,
      lightspeed_brand_id: lightspeedBrandId,
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: brand.name,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'brand',
      lightspeed_id: lightspeedBrandId,
      local_id: brand.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(
      res,
      {
        brand: formatBrand(brand),
        message: 'Brand created successfully in Lightspeed and local database.',
      },
      201
    );
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 4. PUT /brand/:id — Update brand (maps to PUT /Manufacturer/{manufacturerID}.json)
// ---------------------------------------------------------------------------

export const updateBrand = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid brand ID.');
    }

    const brand = await Brand.findByPk(id);
    if (!brand) {
      return res.sendError(res, 'Brand not found.');
    }

    const { name } = req.body as { name?: unknown };

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return res.sendError(res, 'Brand name cannot be empty.');
    }

    const newName = name !== undefined ? (name as string).trim() : brand.name;

    // Check duplicate local name if changed
    if (name !== undefined && newName !== brand.name) {
      const existing = await Brand.findOne({ where: { name: newName } });
      if (existing) {
        return res.sendError(res, `Another brand with name '${newName}' already exists.`);
      }
    }

    const lsPayload = {
      name: newName,
    };

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Manufacturer UPDATE payload for brand ID ${brand.lightspeed_brand_id}:\n`,
        JSON.stringify(lsPayload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed Manufacturer UPDATE payload (not sent): PUT /Manufacturer/${brand.lightspeed_brand_id}.json ` +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
        payload: lsPayload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    let lightspeedBrandId = brand.lightspeed_brand_id;
    if (!lightspeedBrandId || lightspeedBrandId.startsWith('local_')) {
      logger.info('Brand has local ID only. Creating in Lightspeed POS with payload:', lsPayload);
      const response = await LightspeedService.createManufacturer(lsPayload);
      const responseList = LightspeedService.extractList<any>(response, 'Manufacturer');
      const lsManufacturer = responseList[0] || response.Manufacturer;
      if (!lsManufacturer || !lsManufacturer.manufacturerID) {
        throw new Error('Invalid response received from Lightspeed Manufacturer API.');
      }
      lightspeedBrandId = lsManufacturer.manufacturerID.toString();
    } else {
      logger.info(`Updating manufacturer ${lightspeedBrandId} in Lightspeed POS with payload:`, lsPayload);
      await LightspeedService.updateManufacturer(lightspeedBrandId, lsPayload);
    }

    // Persist locally in Database
    await brand.update({
      lightspeed_brand_id: lightspeedBrandId,
      name: newName,
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: brand.name,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'brand',
      lightspeed_id: lightspeedBrandId,
      local_id: brand.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(res, {
      brand: formatBrand(brand),
      message: 'Brand updated successfully in Lightspeed and local database.',
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default {
  getBrands,
  getBrand,
  createBrand,
  updateBrand,
};
