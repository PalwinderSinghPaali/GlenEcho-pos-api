import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Stripe from 'stripe';
import sequelize from '@/database/connection';
import {
  Order,
  OrderItem,
  InventoryReservation,
  Product,
  ProductInventory,
  LightspeedSyncJob,
  PaymentTransaction,
} from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import logger from '@/utils/logger';
import config from '@/config';

const stripe = new Stripe(config.stripe.secretKey || 'dummy_key', {
  apiVersion: '2023-10-16' as any,
});

export const createPaymentIntent = async (req: Request, res: Response) => {
  const { email, firstName, lastName, phone, shippingAddress, billingAddress, items } = req.body;

  if (!email || !firstName || !lastName || !items || !Array.isArray(items) || items.length === 0) {
    return res.sendError(res, 'ERR_VALIDATION_FAILED', { error: 'Missing required parameters.' });
  }

  // Use a local transaction to lock ProductInventory rows and create reservations
  const localTransaction = await sequelize.transaction();
  let createdOrder: any = null;
  const createdReservations: any[] = [];

  try {
    const orderItemsToCreate: any[] = [];
    
    for (const item of items) {
      const { productId, quantity } = item;
      
      // 1. Lock the ProductInventory row for Shop 1 (Glen Echo location)
      const inventory = await ProductInventory.findOne({
        where: { product_id: productId, shop_id: 1 },
        include: [{ model: Product, as: 'product', required: true }],
        lock: localTransaction.LOCK.UPDATE,
        transaction: localTransaction,
      }) as any;

      if (!inventory || !inventory.product) {
        throw new Error(`Product ID ${productId} inventory not found.`);
      }

      const lightspeedItemId = inventory.product.lightspeed_item_id;
      if (!lightspeedItemId) {
        throw new Error(`Product ID ${productId} has no mapped Lightspeed Item ID.`);
      }

      // 2. Fetch live QOH (GET is read-only, so safe to call)
      let liveQoh = await LightspeedService.getLiveQoh(lightspeedItemId, 1);
      
      // If live API fails or returns 0, fall back to our local inventory cache
      if (liveQoh <= 0 && (inventory.qoh || 0) > 0) {
        logger.info(`Live QOH returned 0 for item ${lightspeedItemId}. Falling back to local cache: ${inventory.qoh}`);
        liveQoh = inventory.qoh || 0;
      }

      // 3. Sum active reservations
      const activeReservations = await InventoryReservation.sum('quantity', {
        where: {
          product_id: productId,
          status: 'active',
          expires_at: { [Op.gt]: new Date() },
        },
        transaction: localTransaction,
      }) || 0;

      const effectiveStock = liveQoh - activeReservations;
      logger.info(`Product ${productId} stock: Live QOH=${liveQoh}, Active Reservations=${activeReservations}, Effective Stock=${effectiveStock}`);

      if (effectiveStock < quantity) {
        const error: any = new Error(`INSUFFICIENT_STOCK`);
        error.productId = productId;
        throw error;
      }

      orderItemsToCreate.push({
        product_id: productId,
        quantity,
        price: inventory.product.price || 0,
        discount: 0,
      });
    }

    // 4. Calculate subtotal & tax locally for placeholder
    const subtotal = orderItemsToCreate.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.13;
    const total = subtotal + tax;

    // 5. Create Order with placeholder/estimated totals
    createdOrder = await Order.create(
      {
        user_id: req.user?.id || req.body.userId || null,
        status: 'pending_payment',
        total_amount: total,
        subtotal_amount: subtotal,
        tax_amount: tax,
        shipping_amount: 0,
        shipping_address: shippingAddress || {},
        billing_address: billingAddress || {},
        shipped_locally: false,
      },
      { transaction: localTransaction }
    );

    // 6. Create OrderItems & Inventory Reservations
    for (const item of orderItemsToCreate) {
      await OrderItem.create(
        {
          order_id: createdOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
        },
        { transaction: localTransaction }
      );

      const reservation = await InventoryReservation.create(
        {
          order_id: createdOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          status: 'active',
          expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes window
        },
        { transaction: localTransaction }
      );
      createdReservations.push(reservation);
    }

    await localTransaction.commit();
  } catch (error: any) {
    await localTransaction.rollback();
    logger.error('Error during local reservation transaction:', error);
    if (error.message === 'INSUFFICIENT_STOCK') {
      return res.sendError(res, 'ERR_INSUFFICIENT_STOCK', error);
    }
    return res.sendError(res, error.message, error);
  }

  // 7. Call external APIs outside local database transaction
  try {
    // Resolve Customer
    const customerID = await LightspeedService.resolveCustomer(email, {
      firstName,
      lastName,
      phone,
      address: shippingAddress,
    });

    // Compile SaleLines
    const saleLines: any[] = [];
    for (const item of items) {
      const inventory = await ProductInventory.findOne({
        where: { product_id: item.productId },
        include: [{ model: Product, as: 'product' }],
      }) as any;
      saleLines.push({
        itemID: inventory!.product!.lightspeed_item_id,
        unitQuantity: item.quantity.toString(),
        unitPrice: (inventory!.product!.price || 0).toFixed(2),
      });
    }

    // Dynamically resolve Register, Employee, and Shop from synced database records
    const { registerId, shopId } = await LightspeedService.resolveActiveRegister('1');
    const employeeId = await LightspeedService.resolveActiveEmployee(shopId);

    const salePayload = {
      completed: false,
      shopID: shopId,
      registerID: registerId,
      employeeID: employeeId,
      customerID,
      ShipTo: shippingAddress ? {
        firstName: shippingAddress.firstName || firstName,
        lastName: shippingAddress.lastName || lastName,
        shipNote: shippingAddress.shipNote || '',
        Contact: {
          Addresses: {
            ContactAddress: {
              address1: shippingAddress.address1 || '',
              city: shippingAddress.city || '',
              state: shippingAddress.state || '',
              zip: shippingAddress.zip || '',
              country: shippingAddress.country || 'Canada',
              countryCode: shippingAddress.countryCode || 'CA',
            }
          },
          Phones: phone ? {
            ContactPhone: {
              number: phone,
              useType: 'Mobile',
            }
          } : undefined,
          Emails: {
            ContactEmail: {
              address: email,
              useType: 'Primary',
            }
          }
        }
      } : undefined,
      SaleLines: {
        SaleLine: saleLines,
      },
    };

    // Create Open Sale on Lightspeed
    const openSale = await LightspeedService.createOpenSale(salePayload);

    // Initialize Stripe PaymentIntent with manual capture method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(openSale.calcTotal) * 100), // convert to cents
      currency: 'cad',
      capture_method: 'manual',
      metadata: {
        orderId: createdOrder.id.toString(),
        lightspeedSaleId: openSale.saleID,
      },
    });

    // Two-Phase Write: Update local Order with real calcTotal and saleID
    await createdOrder.update({
      total_amount: parseFloat(openSale.calcTotal),
      tax_amount: parseFloat(openSale.taxTotal),
      lightspeed_sale_id: openSale.saleID,
      stripe_payment_intent: paymentIntent.id,
    });

    return res.sendSuccess(res, {
      clientSecret: paymentIntent.client_secret,
      orderId: createdOrder.order_uuid,
      id: createdOrder.id,
      total: openSale.calcTotal,
    });

  } catch (error: any) {
    logger.error('Error establishing external checkout resources, executing compensating release...', error);
    
    // Compensating Step: void/release the local reservations
    try {
      await sequelize.transaction(async (t) => {
        await InventoryReservation.update(
          { status: 'released' },
          { where: { order_id: createdOrder.id }, transaction: t }
        );
        await createdOrder.update({ status: 'sync_failed' }, { transaction: t });
      });
    } catch (dbErr) {
      logger.error('Failed to execute compensating database cleanup:', dbErr);
    }

    return res.sendError(res, error.message, error);
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = config.stripe.webhookSecret;

  if (!sig || !webhookSecret) {
    logger.error('Stripe webhook error: Missing signature or webhook secret.');
    return res.status(400).send('Webhook signature configuration missing.');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent((req as any).rawBody, sig, webhookSecret);
  } catch (err: any) {
    logger.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`Received Stripe webhook event: ${event.type}`);

  if (event.type === 'payment_intent.amount_capturable_updated') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const orderId = paymentIntent.metadata.orderId;
    const lightspeedSaleId = paymentIntent.metadata.lightspeedSaleId;

    if (!orderId) {
      logger.error(`Webhook error: Missing orderId metadata on payment intent ${paymentIntent.id}`);
      return res.status(400).send('Missing metadata.');
    }

    // Atomic transaction: mark order as authorized and queue job
    const t = await sequelize.transaction();
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      const queryWhere = isUUID ? { order_uuid: orderId } : { id: Number(orderId) };
      
      const order = await Order.findOne({
        where: queryWhere,
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!order) {
        throw new Error(`Order ${orderId} not found.`);
      }

      // Idempotency Guard
      if (order.status !== 'pending_payment') {
        logger.info(`Order ${order.id} is already in state: ${order.status}. Ignoring webhook.`);
        await t.commit();
        return res.status(200).json({ received: true });
      }

      await order.update({ status: 'authorized' }, { transaction: t });
      
      // Enqueue job into the sync_jobs table using our transactional outbox pattern
      await LightspeedSyncJob.create(
        {
          job_type: 'COMPLETE_SALE',
          payload: {
            orderId: order.id,
            lightspeedSaleId,
            stripePaymentIntentId: paymentIntent.id,
            amount: (paymentIntent.amount / 100).toFixed(2),
          },
          status: 'pending',
          attempts: 0,
          max_attempts: 3,
          run_at: new Date(),
        },
        { transaction: t }
      );

      await t.commit();
      logger.info(`Order ${order.id} successfully marked as authorized; enqueued COMPLETE_SALE job.`);
    } catch (err: any) {
      await t.rollback();
      logger.error('Error handling webhook payment intent authorization:', err);
      return res.status(500).send('Webhook processing failed.');
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    // Handle async payment failure
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const orderId = paymentIntent.metadata.orderId;

    if (orderId) {
      const t = await sequelize.transaction();
      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const queryWhere = isUUID ? { order_uuid: orderId } : { id: Number(orderId) };
        
        const order = await Order.findOne({
          where: queryWhere,
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (order && order.status === 'pending_payment') {
          await order.update({ status: 'cancelled' }, { transaction: t });
          await InventoryReservation.update(
            { status: 'released' },
            { where: { order_id: order.id }, transaction: t }
          );
          
          // Log failed transaction
          await PaymentTransaction.create(
            {
              order_id: order.id,
              provider: 'stripe',
              transaction_id: paymentIntent.id,
              amount: paymentIntent.amount / 100,
              status: 'failed',
              raw_response: paymentIntent,
            },
            { transaction: t }
          );
          
          // Void the sale asynchronously in Lightspeed
          await LightspeedSyncJob.create(
            {
              job_type: 'VOID_SALE',
              payload: {
                lightspeedSaleId: paymentIntent.metadata.lightspeedSaleId,
              },
              status: 'pending',
              attempts: 0,
              max_attempts: 3,
              run_at: new Date(),
            },
            { transaction: t }
          );
        }
        await t.commit();
        logger.info(`Order ${orderId} marked as cancelled due to payment failure.`);
      } catch (err) {
        await t.rollback();
        logger.error('Error handling payment failure webhook:', err);
        return res.status(500).send('Webhook failure handling failed.');
      }
    }
  }

  return res.status(200).json({ received: true });
};
