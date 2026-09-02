import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { CustomerType, Discount, TaxCategory, LightspeedEntityMap } from '@/database/models';
import logger from '@/utils/logger';

// Helper to format customer type response
function formatCustomerType(customerTypeObj: CustomerType) {
  if (!customerTypeObj) return null;
  return customerTypeObj.toJSON ? customerTypeObj.toJSON() : customerTypeObj;
}

// 1. GET /customer-type - List customer types (searchable, filterable, paginated)
export const getCustomerTypes = async (req: Request, res: Response) => {
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
        { lightspeed_customer_type_id: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const queryOptions: FindOptions = {
      where,
      order: [['name', sort]],
      include: [
        { model: Discount, as: 'discount', required: false },
        { model: TaxCategory, as: 'taxCategory', required: false },
      ],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await CustomerType.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: CustomerType) => formatCustomerType(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const customerTypes = await CustomerType.findAll(queryOptions);
    const formattedCustomerTypes = customerTypes.map((c: CustomerType) => formatCustomerType(c));
    return res.sendSuccess(res, formattedCustomerTypes);
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 2. GET /customer-type/:id - Get a single customer type by local ID
export const getCustomerType = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid customer type ID.');
    }

    const customerType = await CustomerType.findByPk(id, {
      include: [
        { model: Discount, as: 'discount', required: false },
        { model: TaxCategory, as: 'taxCategory', required: false },
      ],
    });

    if (!customerType) {
      return res.sendError(res, 'Customer type not found.');
    }

    // Retrieve Lightspeed sync metadata from the entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'customer_type',
        lightspeed_id: customerType.lightspeed_customer_type_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatCustomerType(customerType),
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
  getCustomerTypes,
  getCustomerType,
};
