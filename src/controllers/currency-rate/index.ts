import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { CurrencyRate, LightspeedEntityMap } from '@/database/models';
import logger from '@/utils/logger';

function formatCurrencyRate(currencyObj: CurrencyRate) {
  if (!currencyObj) return null;
  const json = currencyObj.toJSON();

  return {
    ...json,
    currencyRateID: parseInt(currencyObj.lightspeed_currency_rate_id, 10) || 0,
    currencyCode: currencyObj.currency_code,
    rate: currencyObj.rate,
    createTime: currencyObj.createdAt || null,
    timeStamp: currencyObj.updatedAt || null,
  };
}

export const getCurrencyRates = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { currency_code: { [Op.iLike]: `%${search}%` } },
        { lightspeed_currency_rate_id: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const queryOptions: FindOptions = {
      where,
      order: [['currency_code', sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await CurrencyRate.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: CurrencyRate) => formatCurrencyRate(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const currencies = await CurrencyRate.findAll(queryOptions);
    const formattedCurrencies = currencies.map((c: CurrencyRate) => formatCurrencyRate(c));
    return res.sendSuccess(res, formattedCurrencies);
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

export const getCurrencyRate = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid currency rate ID.');
    }

    const currency = await CurrencyRate.findByPk(id);
    if (!currency) {
      return res.sendError(res, 'Currency rate not found.');
    }

    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'currency_rate',
        lightspeed_id: currency.lightspeed_currency_rate_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatCurrencyRate(currency),
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
  getCurrencyRates,
  getCurrencyRate,
};
