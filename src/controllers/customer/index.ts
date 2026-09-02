import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Customer, CustomerType, CreditAccount, TaxCategory } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

/**
 * Formats a Customer instance for response.
 */
function formatCustomer(cust: any) {
  if (!cust) return null;
  return cust.toJSON ? cust.toJSON() : cust;
}

// 1. GET /customer — Paginated customer list (searchable, filterable)
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const customerTypeId = req.query.customerTypeId ? Number(req.query.customerTypeId) : undefined;
    const creditAccountId = req.query.creditAccountId ? Number(req.query.creditAccountId) : undefined;
    const archivedParam = req.query.archived as string;
    const archived = archivedParam === 'true' ? true : archivedParam === 'false' ? false : undefined;

    const where: any = {};

    if (customerTypeId && !isNaN(customerTypeId)) {
      where.customer_type_id = customerTypeId;
    }
    if (creditAccountId && !isNaN(creditAccountId)) {
      where.credit_account_id = creditAccountId;
    }

    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { email_primary: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
        { phone_mobile: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (archived !== undefined) {
      where.archived = archived;
    } 

    const queryOptions: any = {
      where,
      order: [['id', sort]],
      include: [
        { model: CustomerType, as: 'customerType', required: false },
        { model: CreditAccount, as: 'creditAccount', required: false },
        { model: TaxCategory, as: 'taxCategory', required: false },
      ],
      offset,
      limit,
      distinct: true,
    };

    const { count, rows } = await Customer.findAndCountAll(queryOptions);
    const formattedRows = rows.map((r: any) => formatCustomer(r));
    return res.sendPaginationSuccess(res, formattedRows, count);
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 2. GET /customer/:id — Single customer detail
export const getCustomer = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid customer ID.');
    }

    const customer = await Customer.findByPk(id, {
      include: [
        { model: CustomerType, as: 'customerType', required: false },
        { model: CreditAccount, as: 'creditAccount', required: false },
        { model: TaxCategory, as: 'taxCategory', required: false },
      ],
    });

    if (!customer) {
      return res.sendError(res, 'Customer not found.');
    }

    return res.sendSuccess(res, formatCustomer(customer));
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 3. POST /customer — Create a customer locally and queue Lightspeed push job
export const createCustomer = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // Resolve association IDs if provided as lightspeed IDs
    let customerTypeId: number | null = null;
    if (payload.customer_type_id) {
      customerTypeId = Number(payload.customer_type_id);
    }
    let creditAccountId: number | null = null;
    if (payload.credit_account_id) {
      creditAccountId = Number(payload.credit_account_id);
    }

    const localCustomer = await Customer.create({
      first_name: payload.first_name,
      last_name: payload.last_name,
      dob: payload.dob ? new Date(payload.dob) : null,
      title: payload.title || null,
      company: payload.company || null,
      company_registration_number: payload.company_registration_number || null,
      vat_number: payload.vat_number || null,
      customer_type_id: customerTypeId,
      credit_account_id: creditAccountId,
      address_1: payload.address_1 || null,
      address_2: payload.address_2 || null,
      city: payload.city || null,
      state: payload.state || null,
      state_code: payload.state_code || null,
      zip: payload.zip || null,
      country: payload.country || null,
      country_code: payload.country_code || null,
      phone_mobile: payload.phone_mobile || null,
      phone_home: payload.phone_home || null,
      phone_work: payload.phone_work || null,
      email_primary: payload.email_primary || null,
      email_secondary: payload.email_secondary || null,
      website: payload.website || null,
      no_email: payload.no_email === true,
      no_phone: payload.no_phone === true,
      no_mail: payload.no_mail === true,
      note: payload.note || null,
      note_is_public: payload.note_is_public === true,
      archived: false,
    });

    // Enqueue outbound push sync job
    let queued = false;
    const job = await LightspeedService.enqueuePushJob('PUSH_CUSTOMER', { customerId: localCustomer.id });
    if (job) {
      queued = true;
    }

    return res.sendSuccess(res, {
      customer: formatCustomer(localCustomer),
      message: queued
        ? 'Customer created successfully and sync job queued.'
        : 'Customer created successfully locally (read-only mode active).',
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 4. PUT /customer/:id — Update customer locally and queue push job
export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid customer ID.');
    }

    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.sendError(res, 'Customer not found.');
    }

    const payload = req.body;

    const updatePayload: any = {};
    const fields = [
      'first_name',
      'last_name',
      'title',
      'company',
      'company_registration_number',
      'vat_number',
      'customer_type_id',
      'credit_account_id',
      'address_1',
      'address_2',
      'city',
      'state',
      'state_code',
      'zip',
      'country',
      'country_code',
      'phone_mobile',
      'phone_home',
      'phone_work',
      'email_primary',
      'email_secondary',
      'website',
      'no_email',
      'no_phone',
      'no_mail',
      'note',
      'note_is_public',
      'archived',
    ];

    for (const f of fields) {
      if (payload[f] !== undefined) {
        updatePayload[f] = payload[f];
      }
    }

    if (payload.dob !== undefined) {
      updatePayload.dob = payload.dob ? new Date(payload.dob) : null;
    }

    await customer.update(updatePayload);

    // Enqueue outbound push sync job
    let queued = false;
    const job = await LightspeedService.enqueuePushJob('PUSH_CUSTOMER', { customerId: customer.id });
    if (job) {
      queued = true;
    }

    return res.sendSuccess(res, {
      customer: formatCustomer(customer),
      message: queued
        ? 'Customer updated successfully and sync job queued.'
        : 'Customer updated successfully locally (read-only mode active).',
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 5. DELETE /customer/:id — Archive customer locally and in Lightspeed
export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid customer ID.');
    }

    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.sendError(res, 'Customer not found.');
    }

    await customer.update({ archived: true });

    let queued = false;
    if (customer.lightspeed_customer_id) {
      const job = await LightspeedService.enqueuePushJob('PUSH_CUSTOMER_ARCHIVE', {
        lightspeedCustomerId: customer.lightspeed_customer_id,
      });
      if (job) {
        queued = true;
      }
    }

    return res.sendSuccess(res, {
      customer: formatCustomer(customer),
      message: queued
        ? 'Customer archived successfully and sync job queued.'
        : 'Customer archived successfully locally (read-only mode or no Lightspeed mapping).',
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};
