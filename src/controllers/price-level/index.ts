import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { PriceLevel, LightspeedEntityMap } from '@/database/models';
import logger from '@/utils/logger';

function formatPriceLevel(levelObj: PriceLevel) {
  if (!levelObj) return null;
  const json = levelObj.toJSON();

  return {
    ...json,
    priceLevelID: parseInt(levelObj.lightspeed_price_level_id, 10) || 0,
    name: levelObj.name,
    archived: !!levelObj.archived,
    canBeArchived: !!levelObj.can_be_archived,
    type: levelObj.type,
    Calculation: levelObj.calculation || '',
    createTime: levelObj.createdAt || null,
    timeStamp: levelObj.updatedAt || null,
  };
}

export const getPriceLevels = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_price_level_id: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const queryOptions: FindOptions = {
      where,
      order: [['name', sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await PriceLevel.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: PriceLevel) => formatPriceLevel(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const levels = await PriceLevel.findAll(queryOptions);
    const formattedLevels = levels.map((l: PriceLevel) => formatPriceLevel(l));
    return res.sendSuccess(res, formattedLevels);
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

export const getPriceLevel = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid price level ID.');
    }

    const level = await PriceLevel.findByPk(id);
    if (!level) {
      return res.sendError(res, 'Price level not found.');
    }

    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'price_level',
        lightspeed_id: level.lightspeed_price_level_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatPriceLevel(level),
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
  getPriceLevels,
  getPriceLevel,
};
