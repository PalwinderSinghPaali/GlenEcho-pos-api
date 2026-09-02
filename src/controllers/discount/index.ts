import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { Discount, LightspeedEntityMap } from '@/database/models';
import logger from '@/utils/logger';

// Helper to format discount response
function formatDiscount(discountObj: Discount) {
  if (!discountObj) return null;
  return discountObj.toJSON ? discountObj.toJSON() : discountObj;
}

// 1. GET /discount - List discounts (searchable, filterable, paginated)
export const getDiscounts = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const archivedParam = req.query.archived as string;
    const archived = archivedParam === 'true' ? true : archivedParam === 'false' ? false : undefined;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_discount_id: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (archived !== undefined) {
      where.archived = archived;
    }

    const queryOptions: FindOptions = {
      where,
      order: [['name', sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Discount.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: Discount) => formatDiscount(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const discounts = await Discount.findAll(queryOptions);
    const formattedDiscounts = discounts.map((d: Discount) => formatDiscount(d));
    return res.sendSuccess(res, formattedDiscounts);
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 2. GET /discount/:id - Get a single discount by local ID
export const getDiscount = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid discount ID.');
    }

    const discount = await Discount.findByPk(id);
    if (!discount) {
      return res.sendError(res, 'Discount not found.');
    }

    // Retrieve Lightspeed sync metadata from the entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'discount',
        lightspeed_id: discount.lightspeed_discount_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatDiscount(discount),
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
  getDiscounts,
  getDiscount,
};
