import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { Employee, Shop, Register } from '@/database/models';
import logger from '@/utils/logger';

function formatEmployee(employeeObj: any) {
  if (!employeeObj) return null;
  const json = employeeObj.toJSON ? employeeObj.toJSON() : employeeObj;

  return {
    id: json.id,
    employeeID: parseInt(json.lightspeed_employee_id, 10) || json.lightspeed_employee_id,
    lightspeed_employee_id: json.lightspeed_employee_id,
    firstName: json.first_name,
    lastName: json.last_name || '',
    name: [json.first_name, json.last_name].filter(Boolean).join(' '),
    lockOut: !!json.lock_out,
    archived: !!json.archived,
    contactID: json.contact_id,
    clockInEmployeeHoursID: json.clock_in_employee_hours_id,
    employeeRoleID: json.employee_role_id,
    employeeRoleName: json.employee_role_name,
    limitToShopID: json.lightspeed_limit_to_shop_id
      ? parseInt(json.lightspeed_limit_to_shop_id, 10) || json.lightspeed_limit_to_shop_id
      : null,
    limit_to_shop_id: json.limit_to_shop_id,
    lastShopID: json.lightspeed_last_shop_id
      ? parseInt(json.lightspeed_last_shop_id, 10) || json.lightspeed_last_shop_id
      : null,
    last_shop_id: json.last_shop_id,
    lastSaleID: json.last_sale_id,
    lastRegisterID: json.last_register_id,
    email: json.email,
    phone: json.phone,
    timeStamp: json.time_stamp,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    limitShop: json.limitShop || null,
    lastShop: json.lastShop || null,
    openedRegisters: json.openedRegisters || [],
  };
}

// 1. GET /employee - List employees (searchable, filterable, paginated)
export const getEmployees = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'desc' ? 'DESC' : 'ASC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { employee_role_name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_employee_id: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (req.query.shopId) {
      where[Op.or] = [
        { last_shop_id: Number(req.query.shopId) || 0 },
        { limit_to_shop_id: Number(req.query.shopId) || 0 },
        { lightspeed_last_shop_id: String(req.query.shopId) },
        { lightspeed_limit_to_shop_id: String(req.query.shopId) },
      ];
    }

    if (req.query.lockOut !== undefined) {
      where.lock_out = req.query.lockOut === 'true';
    }

    if (req.query.archived !== undefined) {
      where.archived = req.query.archived === 'true';
    }

    const queryOptions: FindOptions = {
      where,
      order: [
        ['first_name', sort],
        ['last_name', sort],
      ],
      include: [
        { model: Shop, as: 'limitShop', required: false },
        { model: Shop, as: 'lastShop', required: false },
      ],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Employee.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: Employee) => formatEmployee(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const employees = await Employee.findAll(queryOptions);
    const formattedEmployees = employees.map((r: Employee) => formatEmployee(r));
    return res.sendSuccess(res, formattedEmployees);
  } catch (error: unknown) {
    logger.error('Error fetching employees:', error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 2. GET /employee/:id - Get a single employee by local or Lightspeed ID
export const getEmployeeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(id);

    const where: any = isNumeric
      ? { [Op.or]: [{ id: Number(id) }, { lightspeed_employee_id: id }] }
      : { lightspeed_employee_id: id };

    const employee = await Employee.findOne({
      where,
      include: [
        { model: Shop, as: 'limitShop', required: false },
        { model: Shop, as: 'lastShop', required: false },
        { model: Register, as: 'openedRegisters', required: false },
      ],
    });

    if (!employee) {
      return res.sendError(res, 'Employee not found');
    }

    return res.sendSuccess(res, formatEmployee(employee)!);
  } catch (error: unknown) {
    logger.error('Error fetching employee by ID:', error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};
