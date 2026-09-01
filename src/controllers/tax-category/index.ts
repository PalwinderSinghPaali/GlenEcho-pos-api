import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { TaxCategory, LightspeedEntityMap } from '@/database/models';
import logger from '@/utils/logger';

// Helper to format tax category response
function formatTaxCategory(taxCategoryObj: TaxCategory) {
  if (!taxCategoryObj) return null;
  return taxCategoryObj.toJSON ? taxCategoryObj.toJSON() : taxCategoryObj;
}

// 1. GET /tax-category - List tax categories (searchable, filterable, paginated)
export const getTaxCategories = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { tax_1_name: { [Op.iLike]: `%${search}%` } },
        { tax_2_name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_tax_category_id: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const queryOptions: FindOptions = {
      where,
      order: [['id', sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await TaxCategory.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: TaxCategory) => formatTaxCategory(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const taxCategories = await TaxCategory.findAll(queryOptions);
    const formattedTaxCategories = taxCategories.map((t: TaxCategory) => formatTaxCategory(t));
    return res.sendSuccess(res, formattedTaxCategories);
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 2. GET /tax-category/:id - Get a single tax category by local ID
export const getTaxCategory = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid tax category ID.');
    }

    const taxCategory = await TaxCategory.findByPk(id);
    if (!taxCategory) {
      return res.sendError(res, 'Tax category not found.');
    }

    // Retrieve Lightspeed sync metadata from the entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'tax_category',
        lightspeed_id: taxCategory.lightspeed_tax_category_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatTaxCategory(taxCategory),
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

export default {
  getTaxCategories,
  getTaxCategory,
};
