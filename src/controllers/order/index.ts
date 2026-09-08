import { Request, Response } from 'express';
import { Op } from 'sequelize';
import {
  Order,
  OrderItem,
  Product,
  InventoryReservation,
  LightspeedSyncJob,
  User,
  Customer,
} from '@/database/models';
import sequelize from '@/database/connection';
import logger from '@/utils/logger';

// Helper to format Order
function formatOrder(order: any, customerMap?: Map<string, any>) {
  if (!order) return null;
  const json = order.toJSON ? order.toJSON() : { ...order };
  if (json.ticket_number && !json.ticketNumber) {
    json.ticketNumber = json.ticket_number;
  }

  // Sanitize user object (never expose passwords or reset tokens)
  if (json.user) {
    delete json.user.password;
    delete json.user.reset_password_token;
    delete json.user.reset_password_expires;
  }

  // Resolve customer information
  const customerEmail =
    json.shipping_address?.email ||
    json.billing_address?.email ||
    json.user?.email ||
    null;

  const matchedCustomer = customerEmail && customerMap ? customerMap.get(customerEmail.toLowerCase()) : null;

  json.customer = matchedCustomer
    ? {
        id: matchedCustomer.id,
        lightspeed_customer_id: matchedCustomer.lightspeed_customer_id,
        first_name: matchedCustomer.first_name || json.shipping_address?.firstName || json.user?.first_name || '',
        last_name: matchedCustomer.last_name || json.shipping_address?.lastName || json.user?.last_name || '',
        email: matchedCustomer.email_primary || customerEmail,
        phone:
          matchedCustomer.phone_mobile ||
          matchedCustomer.phone_home ||
          matchedCustomer.phone_work ||
          json.shipping_address?.phone ||
          json.billing_address?.phone ||
          null,
        company: matchedCustomer.company || null,
        address_1: matchedCustomer.address_1 || json.shipping_address?.address1 || null,
        address_2: matchedCustomer.address_2 || json.shipping_address?.address2 || null,
        city: matchedCustomer.city || json.shipping_address?.city || null,
        state: matchedCustomer.state || json.shipping_address?.state || null,
        zip: matchedCustomer.zip || json.shipping_address?.zip || null,
        country: matchedCustomer.country || json.shipping_address?.country || null,
      }
    : (json.shipping_address || json.billing_address || json.user
      ? {
          id: null,
          lightspeed_customer_id: null,
          first_name: json.shipping_address?.firstName || json.billing_address?.firstName || json.user?.first_name || '',
          last_name: json.shipping_address?.lastName || json.billing_address?.lastName || json.user?.last_name || '',
          email: customerEmail,
          phone: json.shipping_address?.phone || json.billing_address?.phone || null,
          company: null,
          address_1: json.shipping_address?.address1 || json.billing_address?.address1 || null,
          address_2: json.shipping_address?.address2 || json.billing_address?.address2 || null,
          city: json.shipping_address?.city || json.billing_address?.city || null,
          state: json.shipping_address?.state || json.billing_address?.state || null,
          zip: json.shipping_address?.zip || json.billing_address?.zip || null,
          country: json.shipping_address?.country || json.billing_address?.country || null,
        }
      : null);

  return json;
}

// 1. GET /orders - Get paginated, searchable, and filterable list of orders
export const getOrders = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const status = req.query.status as string;
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const ticketNumber = (req.query.ticketNumber || req.query.ticket_number) as string;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (userId && !isNaN(userId)) {
      where.user_id = userId;
    }

    if (ticketNumber) {
      where.ticket_number = ticketNumber;
    }

    if (search) {
      where[Op.or] = [
        { tracking_number: { [Op.iLike]: `%${search}%` } },
        { ticket_number: { [Op.iLike]: `%${search}%` } },
        { lightspeed_sale_id: { [Op.iLike]: `%${search}%` } },
        { carrier: { [Op.iLike]: `%${search}%` } },
        { 'shipping_address.firstName': { [Op.iLike]: `%${search}%` } },
        { 'shipping_address.lastName': { [Op.iLike]: `%${search}%` } },
        { 'shipping_address.email': { [Op.iLike]: `%${search}%` } },
        { 'shipping_address.phone': { [Op.iLike]: `%${search}%` } },
        { 'billing_address.firstName': { [Op.iLike]: `%${search}%` } },
        { 'billing_address.lastName': { [Op.iLike]: `%${search}%` } },
        { 'billing_address.email': { [Op.iLike]: `%${search}%` } },
        { 'billing_address.phone': { [Op.iLike]: `%${search}%` } },
      ];

      // Check if search matches user accounts
      try {
        const matchingUsers = await User.findAll({
          where: {
            [Op.or]: [
              { first_name: { [Op.iLike]: `%${search}%` } },
              { last_name: { [Op.iLike]: `%${search}%` } },
              { email: { [Op.iLike]: `%${search}%` } },
            ],
          },
          attributes: ['id'],
        });
        const userIds = matchingUsers.map((u: any) => u.id);
        if (userIds.length > 0) {
          where[Op.or].push({ user_id: { [Op.in]: userIds } });
        }
      } catch (userSearchErr) {
        logger.debug('User search check skipped:', userSearchErr);
      }
      
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search);
      if (isUUID) {
        where[Op.or].push({ order_uuid: { [Op.eq]: search } });
      } else {
        const searchNum = Number(search);
        if (!isNaN(searchNum) && Number.isInteger(searchNum) && searchNum > 0 && searchNum <= 2147483647) {
          where[Op.or].push({ id: { [Op.eq]: searchNum } });
        }
      }
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      order: [['createdAt', sort]],
      include: [
        {
          model: User,
          as: 'user',
          required: false,
          attributes: ['id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'createdAt'],
        },
        {
          model: OrderItem,
          as: 'items',
          required: false,
          include: [{ model: Product, as: 'product', required: false }]
        }
      ],
      offset,
      limit,
      distinct: true,
    });

    // Batch resolve Customers by email
    const emails = rows
      .map((r: any) => r.shipping_address?.email || r.billing_address?.email || r.user?.email)
      .filter(Boolean)
      .map((e: string) => e.toLowerCase());

    const customerMap = new Map<string, any>();
    if (emails.length > 0) {
      try {
        const customers = await Customer.findAll({
          where: {
            email_primary: {
              [Op.in]: emails,
            },
          },
        });
        customers.forEach((c: any) => {
          if (c.email_primary) {
            customerMap.set(c.email_primary.toLowerCase(), c.toJSON ? c.toJSON() : c);
          }
        });
      } catch (custErr) {
        logger.warn('Failed to load customers for orders batch:', custErr);
      }
    }

    const formattedRows = rows.map((r: any) => formatOrder(r, customerMap));
    return res.sendPaginationSuccess(res, formattedRows, count);
  } catch (error: unknown) {
    logger.error('Error fetching orders:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

// 2. GET /orders/:id - Get a single order with items, user, and customer details
export const getOrder = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    const queryWhere: any = {};
    if (isUUID) {
      queryWhere.order_uuid = id;
    } else {
      const idNum = Number(id);
      if (isNaN(idNum)) {
        return res.sendError(res, 'ERR_VALIDATION_FAILED', { error: 'Invalid order ID format.' });
      }
      queryWhere.id = idNum;
    }

    const orderInclude = [
      {
        model: User,
        as: 'user',
        required: false,
        attributes: ['id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'createdAt'],
      },
      {
        model: OrderItem,
        as: 'items',
        required: false,
        include: [{ model: Product, as: 'product', required: false }]
      }
    ];

    let order = await Order.findOne({
      where: queryWhere,
      include: orderInclude,
    });

    // If not found by primary key ID and query was not a UUID, attempt lookup by ticket_number
    if (!order && !isUUID) {
      order = await Order.findOne({
        where: { ticket_number: id },
        include: orderInclude,
      });
    }

    if (!order) {
      return res.sendError(res, 'ERR_ORDER_NOT_FOUND', { error: 'Order not found.' });
    }

    // Resolve customer information for single order
    const customerEmail =
      order.shipping_address?.email ||
      order.billing_address?.email ||
      (order as any).user?.email ||
      null;

    const customerMap = new Map<string, any>();
    if (customerEmail) {
      try {
        const customerRecord = await Customer.findOne({
          where: { email_primary: { [Op.iLike]: customerEmail } },
        });
        if (customerRecord && customerRecord.email_primary) {
          customerMap.set(customerRecord.email_primary.toLowerCase(), customerRecord.toJSON ? customerRecord.toJSON() : customerRecord);
        }
      } catch (custErr) {
        logger.warn('Failed to load customer for single order:', custErr);
      }
    }

    return res.sendSuccess(res, formatOrder(order, customerMap));
  } catch (error: unknown) {
    logger.error('Error fetching order details:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

// 3. PUT /orders/:id - Update order status, shipping/billing addresses, and tracking information
export const updateOrder = async (req: Request, res: Response) => {
  const localTransaction = await sequelize.transaction();
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    const queryWhere: any = {};
    if (isUUID) {
      queryWhere.order_uuid = id;
    } else {
      const idNum = Number(id);
      if (isNaN(idNum)) {
        await localTransaction.rollback();
        return res.sendError(res, 'ERR_VALIDATION_FAILED', { error: 'Invalid order ID format.' });
      }
      queryWhere.id = idNum;
    }

    let order = await Order.findOne({
      where: queryWhere,
      lock: localTransaction.LOCK.UPDATE,
      transaction: localTransaction,
    });

    if (!order && !isUUID) {
      order = await Order.findOne({
        where: { ticket_number: id },
        lock: localTransaction.LOCK.UPDATE,
        transaction: localTransaction,
      });
    }

    if (!order) {
      await localTransaction.rollback();
      return res.sendError(res, 'ERR_ORDER_NOT_FOUND', { error: 'Order not found.' });
    }

    const {
      status,
      carrier,
      tracking_number,
      estimated_delivery,
      shipping_address,
      billing_address,
    } = req.body;

    const updateFields: any = {};

    if (status !== undefined) {
      const allowedStatuses = ['pending_payment', 'authorized', 'paid', 'sync_failed', 'synced', 'manual_fulfillment_alert', 'cancelled', 'completed', 'shipped'];
      if (!allowedStatuses.includes(status)) {
        await localTransaction.rollback();
        return res.sendError(res, 'ERR_VALIDATION_FAILED', { error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
      }

      // Transition to cancelled actions
      if (status === 'cancelled' && order.status !== 'cancelled') {
        // Release reservations using order.id (integer PK)
        await InventoryReservation.update(
          { status: 'released' },
          { where: { order_id: order.id }, transaction: localTransaction }
        );

        // Enqueue VOID_SALE job if a Lightspeed sale is linked
        if (order.lightspeed_sale_id) {
          await LightspeedSyncJob.create(
            {
              job_type: 'VOID_SALE',
              payload: {
                lightspeedSaleId: order.lightspeed_sale_id,
              },
              status: 'pending',
              attempts: 0,
              max_attempts: 3,
              run_at: new Date(),
            },
            { transaction: localTransaction }
          );
        }
      }

      updateFields.status = status;
    }

    if (carrier !== undefined) updateFields.carrier = carrier;
    if (tracking_number !== undefined) updateFields.tracking_number = tracking_number;
    if (estimated_delivery !== undefined) {
      updateFields.estimated_delivery = estimated_delivery ? new Date(estimated_delivery) : null;
    }
    if (shipping_address !== undefined) updateFields.shipping_address = shipping_address;
    if (billing_address !== undefined) updateFields.billing_address = billing_address;

    // Track status transition to synced
    if (status === 'synced' && order.status !== 'synced') {
      updateFields.shipped_at = new Date();
    }

    await order.update(updateFields, { transaction: localTransaction });
    await localTransaction.commit();

    // Fetch updated copy with items using order.id (integer PK)
    const updatedOrder = await Order.findByPk(order.id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          required: false,
          include: [{ model: Product, as: 'product', required: false }]
        }
      ],
    });

    return res.sendSuccess(res, formatOrder(updatedOrder));
  } catch (error: unknown) {
    await localTransaction.rollback();
    logger.error('Error updating order:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

// 4. DELETE /orders/:id - Cancel an order (compensating inventory release and POS void)
export const deleteOrder = async (req: Request, res: Response) => {
  const localTransaction = await sequelize.transaction();
  try {
    const id = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    const queryWhere: any = {};
    if (isUUID) {
      queryWhere.order_uuid = id;
    } else {
      const idNum = Number(id);
      if (isNaN(idNum)) {
        await localTransaction.rollback();
        return res.sendError(res, 'ERR_VALIDATION_FAILED', { error: 'Invalid order ID format.' });
      }
      queryWhere.id = idNum;
    }

    let order = await Order.findOne({
      where: queryWhere,
      lock: localTransaction.LOCK.UPDATE,
      transaction: localTransaction,
    });

    if (!order && !isUUID) {
      order = await Order.findOne({
        where: { ticket_number: id },
        lock: localTransaction.LOCK.UPDATE,
        transaction: localTransaction,
      });
    }

    if (!order) {
      await localTransaction.rollback();
      return res.sendError(res, 'ERR_ORDER_NOT_FOUND', { error: 'Order not found.' });
    }

    if (order.status === 'cancelled') {
      await localTransaction.rollback();
      return res.sendError(res, 'ERR_VALIDATION_FAILED', { error: 'Order is already cancelled.' });
    }

    // Cancel order & release reservations using order.id (integer PK)
    await order.update({ status: 'cancelled' }, { transaction: localTransaction });
    await InventoryReservation.update(
      { status: 'released' },
      { where: { order_id: order.id }, transaction: localTransaction }
    );

    // Enqueue VOID_SALE job if a Lightspeed sale is linked
    if (order.lightspeed_sale_id) {
      await LightspeedSyncJob.create(
        {
          job_type: 'VOID_SALE',
          payload: {
            lightspeedSaleId: order.lightspeed_sale_id,
          },
          status: 'pending',
          attempts: 0,
          max_attempts: 3,
          run_at: new Date(),
        },
        { transaction: localTransaction }
      );
    }

    await localTransaction.commit();
    return res.sendSuccess(res, { message: 'Order successfully cancelled.', orderId: id });
  } catch (error: unknown) {
    await localTransaction.rollback();
    logger.error('Error deleting/cancelling order:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};
