import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { TaxClass, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import logger from '@/utils/logger';

// Helper to format tax class response
function formatTaxClass(taxClassObj: TaxClass, syncInfoMap?: Map<string, any>) {
  if (!taxClassObj) return null;
  const json = taxClassObj.toJSON ? taxClassObj.toJSON() : { ...taxClassObj };
  const syncInfo = syncInfoMap ? syncInfoMap.get(taxClassObj.lightspeed_tax_class_id) || null : null;

  return {
    ...json,
    lightspeed_sync_info: syncInfo,
  };
}

/**
 * 1. GET /tax-class - Retrieve all tax classes (flat, searchable, sortable, paginated)
 */
export const getTaxClasses = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const sortByParam = (req.query.sortBy as string) || 'name';
    const allowedSortFields = ['id', 'name', 'lightspeed_tax_class_id', 'createdAt', 'updatedAt'];
    const sortBy = allowedSortFields.includes(sortByParam) ? sortByParam : 'name';

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_tax_class_id: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const queryOptions: FindOptions = {
      where,
      order: [[sortBy, sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await TaxClass.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });

      const lsIds = rows.map((r: TaxClass) => r.lightspeed_tax_class_id).filter(Boolean);
      const entityMaps =
        lsIds.length > 0
          ? await LightspeedEntityMap.findAll({
              where: {
                entity_type: 'tax_class',
                lightspeed_id: { [Op.in]: lsIds },
              },
            })
          : [];

      const syncInfoMap = new Map<string, any>();
      entityMaps.forEach((em) => {
        syncInfoMap.set(em.lightspeed_id, {
          entity_map_id: em.id,
          lightspeed_id: em.lightspeed_id,
          local_id: em.local_id,
          last_sync: em.last_sync,
          hash: em.hash,
        });
      });

      const formattedRows = rows.map((r: TaxClass) => formatTaxClass(r, syncInfoMap));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const taxClasses = await TaxClass.findAll(queryOptions);

    const lsIds = taxClasses.map((r: TaxClass) => r.lightspeed_tax_class_id).filter(Boolean);
    const entityMaps =
      lsIds.length > 0
        ? await LightspeedEntityMap.findAll({
            where: {
              entity_type: 'tax_class',
              lightspeed_id: { [Op.in]: lsIds },
            },
          })
        : [];

    const syncInfoMap = new Map<string, any>();
    entityMaps.forEach((em) => {
      syncInfoMap.set(em.lightspeed_id, {
        entity_map_id: em.id,
        lightspeed_id: em.lightspeed_id,
        local_id: em.local_id,
        last_sync: em.last_sync,
        hash: em.hash,
      });
    });

    const formattedTaxClasses = taxClasses.map((t: TaxClass) => formatTaxClass(t, syncInfoMap));
    return res.sendSuccess(res, formattedTaxClasses);
  } catch (error: unknown) {
    logger.error('Error in getTaxClasses:', error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * 2. GET /tax-class/:id - Retrieve a single tax class by local ID or Lightspeed ID
 */
export const getTaxClass = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const numId = Number(rawId);

    let taxClass: TaxClass | null = null;
    if (!isNaN(numId)) {
      taxClass = await TaxClass.findByPk(numId);
    }
    if (!taxClass) {
      taxClass = await TaxClass.findOne({
        where: { lightspeed_tax_class_id: String(rawId) },
      });
    }

    if (!taxClass) {
      return res.sendError(res, 'Tax class not found.');
    }

    // Retrieve Lightspeed sync metadata from entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'tax_class',
        lightspeed_id: taxClass.lightspeed_tax_class_id,
      },
    });

    return res.sendSuccess(res, {
      ...(taxClass.toJSON ? taxClass.toJSON() : taxClass),
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
    logger.error('Error in getTaxClass:', error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

/**
 * 3. POST /tax-class/sync - Manually trigger sync of all tax classes from Lightspeed POS
 */
export const syncTaxClasses = async (_req: Request, res: Response) => {
  try {
    const syncedTaxClasses = await LightspeedService.syncTaxClasses();
    return res.sendSuccess(res, {
      message: `Successfully synchronized ${syncedTaxClasses.length} tax classes from Lightspeed.`,
      taxClasses: syncedTaxClasses,
    });
  } catch (error: any) {
    logger.error('Error syncing tax classes from Lightspeed:', error);
    return res.sendError(res, error.message || 'ERR_LIGHTSPEED_SYNC_FAILED');
  }
};

export default {
  getTaxClasses,
  getTaxClass,
  syncTaxClasses,
};
