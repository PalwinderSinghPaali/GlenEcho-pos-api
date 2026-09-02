import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { ProductInventory, Product, Shop } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import logger from '@/utils/logger';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a ProductInventory instance to match standard casing and structure.
 */
function formatInventory(inv: any) {
  if (!inv) return null;
  const json = inv.toJSON ? inv.toJSON() : inv;

  return {
    ...json,
    qoh: parseInt(json.qoh || 0, 10),
    unitCost: parseFloat(json.unit_cost || 0),
    reorderPoint: parseInt(json.reorder_point || 0, 10),
    reorderLevel: parseInt(json.reorder_level || 0, 10),
    lightspeedItemShopID: json.lightspeed_item_shop_id || null,
    totalValue: parseFloat(json.total_value || 0),
    totalSaleValue: parseFloat(json.total_sale_value || 0),
    specialOrder: parseInt(json.special_order || 0, 10),
    sellable: parseInt(json.sellable || 0, 10),
    createTime: json.createdAt || json.created_at || null,
    timeStamp: json.updatedAt || json.updated_at || null,
  };
}

// ---------------------------------------------------------------------------
// 1. GET /inventory — Paginated inventories list (maps to GET /ItemShop.json)
// ---------------------------------------------------------------------------

export const getInventories = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const shopId = req.query.shopId ? Number(req.query.shopId) : undefined;
    const productId = req.query.productId ? Number(req.query.productId) : undefined;

    const where: any = {};
    if (shopId && !isNaN(shopId)) {
      where.shop_id = shopId;
    }
    if (productId && !isNaN(productId)) {
      where.product_id = productId;
    }

    const productWhere: any = {};
    if (search) {
      productWhere[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { system_sku: { [Op.iLike]: `%${search}%` } },
        { custom_sku: { [Op.iLike]: `%${search}%` } },
        { upc: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const queryOptions: any = {
      where,
      order: [['id', sort]],
      include: [
        {
          model: Product,
          as: 'product',
          where: search ? productWhere : undefined,
          required: !!search,
        },
        {
          model: Shop,
          as: 'shop',
          required: false,
        },
      ],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await ProductInventory.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: any) => formatInventory(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const inventories = await ProductInventory.findAll(queryOptions);
    const formattedInventories = inventories.map((i: any) => formatInventory(i));
    return res.sendSuccess(res, formattedInventories);
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 2. GET /inventory/:id — Single inventory record detail (maps to GET /ItemShop/{itemShopID}.json)
// ---------------------------------------------------------------------------

export const getInventory = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid inventory ID.');
    }

    const inventory = await ProductInventory.findByPk(id, {
      include: [
        {
          model: Product,
          as: 'product',
          required: false,
        },
        {
          model: Shop,
          as: 'shop',
          required: false,
        },
      ],
    });

    if (!inventory) {
      return res.sendError(res, 'Inventory record not found.');
    }

    return res.sendSuccess(res, formatInventory(inventory));
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 3. PUT /inventory/:id — Update inventory record locally (maps to PUT /ItemShop/{itemShopID}.json)
// ---------------------------------------------------------------------------

export const updateInventory = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid inventory ID.');
    }

    const inventory = await ProductInventory.findByPk(id, {
      include: [
        { model: Product, as: 'product' },
        { model: Shop, as: 'shop' },
      ],
    });

    if (!inventory) {
      return res.sendError(res, 'Inventory record not found.');
    }

    const { reorder_point, reorder_level } = req.body as {
      reorder_point?: unknown;
      reorder_level?: unknown;
    };

    if (reorder_point === undefined && reorder_level === undefined) {
      return res.sendError(res, 'Only reorder_point and reorder_level can be updated on ItemShop.');
    }

    const newRepoint = reorder_point !== undefined ? Number(reorder_point) : inventory.reorder_point;
    const newRelevel = reorder_level !== undefined ? Number(reorder_level) : inventory.reorder_level;

    if (isNaN(newRepoint) || isNaN(newRelevel)) {
      return res.sendError(res, 'reorder_point and reorder_level must be valid numbers.');
    }

    const product = (inventory as any).product;
    const shop = (inventory as any).shop;

    // Log the Lightspeed ItemShop PUT payload that would be sent (READ-ONLY mode)
    logger.info(
      `[READ-ONLY] Lightspeed ItemShop UPDATE payload (not sent): PUT /ItemShop/local_itemshop_${inventory.id}.json (Item: ${product?.lightspeed_item_id || 'N/A'}, Shop: ${shop?.lightspeed_shop_id || 'N/A'}) ` +
        JSON.stringify({
          reorderPoint: String(newRepoint),
          reorderLevel: String(newRelevel),
        })
    );

    // Persist locally
    await inventory.update({
      reorder_point: newRepoint,
      reorder_level: newRelevel,
    });

    let queued = false;
    if (inventory.lightspeed_item_shop_id) {
      const job = await LightspeedService.enqueuePushJob('PUSH_ITEM_SHOP', {
        lightspeedItemShopId: inventory.lightspeed_item_shop_id,
        changedFields: {
          reorderPoint: String(newRepoint),
          reorderLevel: String(newRelevel),
        },
      });
      if (job) {
        queued = true;
      }
    }

    return res.sendSuccess(res, {
      inventory: formatInventory(inventory),
      message: queued
        ? 'Inventory record updated successfully and sync job queued.'
        : 'Inventory record updated successfully (local only — read-only mode or no Lightspeed map).',
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default {
  getInventories,
  getInventory,
  updateInventory,
};
