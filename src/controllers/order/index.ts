import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Order, OrderItem, Product, InventoryReservation, LightspeedSyncJob } from '@/database/models';
import sequelize from '@/database/connection';
import logger from '@/utils/logger';

// Helper to format Order
function formatOrder(order: any) {
  if (!order) return null;
  const json = order.toJSON ? order.toJSON() : { ...order };
  if (json.ticket_number && !json.ticketNumber) {
    json.ticketNumber = json.ticket_number;
  }
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
        { 'billing_address.firstName': { [Op.iLike]: `%${search}%` } },
        { 'billing_address.lastName': { [Op.iLike]: `%${search}%` } },
      ];
      
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

    const formattedRows = rows.map((r: any) => formatOrder(r));
    return res.sendPaginationSuccess(res, formattedRows, count);
  } catch (error: unknown) {
    logger.error('Error fetching orders:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

// 2. GET /orders/:id - Get a single order with items and product details (supports integer id, order_uuid, and ticket_number)
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

    let order = await Order.findOne({
      where: queryWhere,
      include: [
        {
          model: OrderItem,
          as: 'items',
          required: false,
          include: [{ model: Product, as: 'product', required: false }]
        }
      ],
    });

    // If not found by primary key ID and query was not a UUID, attempt lookup by ticket_number
    if (!order && !isUUID) {
      order = await Order.findOne({
        where: { ticket_number: id },
        include: [
          {
            model: OrderItem,
            as: 'items',
            required: false,
            include: [{ model: Product, as: 'product', required: false }]
          }
        ],
      });
    }

    if (!order) {
      return res.sendError(res, 'ERR_ORDER_NOT_FOUND', { error: 'Order not found.' });
    }

    return res.sendSuccess(res, formatOrder(order));
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
