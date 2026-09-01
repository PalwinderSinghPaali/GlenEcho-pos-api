import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { Register, Shop, Employee } from '@/database/models';
import logger from '@/utils/logger';

function formatRegister(registerObj: any) {
  if (!registerObj) return null;
  const json = registerObj.toJSON ? registerObj.toJSON() : registerObj;

  return {
    id: json.id,
    registerID: parseInt(json.lightspeed_register_id, 10) || json.lightspeed_register_id,
    lightspeed_register_id: json.lightspeed_register_id,
    name: json.name,
    open: !!json.open,
    openTime: json.open_time,
    tipEnabled: !!json.tip_enabled,
    shopID: json.lightspeed_shop_id ? parseInt(json.lightspeed_shop_id, 10) || json.lightspeed_shop_id : null,
    shop_id: json.shop_id,
    openEmployeeID: json.lightspeed_open_employee_id
      ? parseInt(json.lightspeed_open_employee_id, 10) || json.lightspeed_open_employee_id
      : null,
    open_employee_id: json.open_employee_id,
    ccTerminalID: json.cc_terminal_id,
    archived: !!json.archived,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    shop: json.shop || null,
    openEmployee: json.openEmployee || null,
  };
}

// 1. GET /register - List registers (searchable, filterable, paginated)
export const getRegisters = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_register_id: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (req.query.shopId) {
      where[Op.or] = [
        { shop_id: Number(req.query.shopId) || 0 },
        { lightspeed_shop_id: String(req.query.shopId) },
      ];
    }

    if (req.query.open !== undefined) {
      where.open = req.query.open === 'true';
    }

    if (req.query.archived !== undefined) {
      where.archived = req.query.archived === 'true';
    }

    const queryOptions: FindOptions = {
      where,
      order: [['name', sort]],
      include: [
        { model: Shop, as: 'shop', required: false },
        { model: Employee, as: 'openEmployee', required: false },
      ],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Register.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: Register) => formatRegister(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const registers = await Register.findAll(queryOptions);
    const formattedRegisters = registers.map((r: Register) => formatRegister(r));
    return res.sendSuccess(res, formattedRegisters);
  } catch (error: unknown) {
    logger.error('Error fetching registers:', error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 2. GET /register/:id - Get a single register by local or Lightspeed ID
export const getRegisterById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(id);

    const where: any = isNumeric
      ? { [Op.or]: [{ id: Number(id) }, { lightspeed_register_id: id }] }
      : { lightspeed_register_id: id };

    const register = await Register.findOne({
      where,
      include: [
        { model: Shop, as: 'shop', required: false },
        { model: Employee, as: 'openEmployee', required: false },
      ],
    });

    if (!register) {
      return res.sendError(res, 'Register not found');
    }

    return res.sendSuccess(res, formatRegister(register)!);
  } catch (error: unknown) {
    logger.error('Error fetching register by ID:', error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};
