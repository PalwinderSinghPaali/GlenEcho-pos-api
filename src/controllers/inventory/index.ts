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
// 3. PUT /inventory/:id — Update inventory record (maps to PUT /ItemShop/{itemShopID}.json)
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

    const { reorder_point, reorder_level, reorderPoint, reorderLevel, qoh } = req.body as {
      reorder_point?: unknown;
      reorder_level?: unknown;
      reorderPoint?: unknown;
      reorderLevel?: unknown;
      qoh?: unknown;
    };

    if (qoh !== undefined) {
      return res.sendError(
        res,
        'QOH cannot be updated directly via ItemShop inventory endpoint. Only reorder_point and reorder_level are supported as per Lightspeed documentation.'
      );
    }

    const resolvedRepoint =
      reorder_point !== undefined ? reorder_point : reorderPoint;
    const resolvedRelevel =
      reorder_level !== undefined ? reorder_level : reorderLevel;

    if (resolvedRepoint === undefined && resolvedRelevel === undefined) {
      return res.sendError(
        res,
        'Only reorder_point and reorder_level can be updated on ItemShop.'
      );
    }

    const newRepoint =
      resolvedRepoint !== undefined ? Number(resolvedRepoint) : inventory.reorder_point;
    const newRelevel =
      resolvedRelevel !== undefined ? Number(resolvedRelevel) : inventory.reorder_level;

    if (isNaN(newRepoint) || isNaN(newRelevel)) {
      return res.sendError(
        res,
        'reorder_point and reorder_level must be valid numbers.'
      );
    }

    const product = (inventory as any).product;
    const shop = (inventory as any).shop;

    // Prepare Lightspeed ItemShop PUT payload (PUT /ItemShop/{itemShopID}.json)
    const lsItemShopPayload: Record<string, string> = {};
    if (resolvedRepoint !== undefined) {
      lsItemShopPayload.reorderPoint = String(newRepoint);
    }
    if (resolvedRelevel !== undefined) {
      lsItemShopPayload.reorderLevel = String(newRelevel);
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      const debugPayload = {
        itemShopID: inventory.lightspeed_item_shop_id || `local_itemshop_${inventory.id}`,
        item: product?.lightspeed_item_id || 'N/A',
        shop: shop?.lightspeed_shop_id || 'N/A',
        endpoint: `PUT /ItemShop/${inventory.lightspeed_item_shop_id || `local_${inventory.id}`}.json`,
        payload: lsItemShopPayload,
      };

      console.log(
        `[READ-ONLY] Lightspeed ItemShop UPDATE payload for inventory ID ${inventory.id}:\n`,
        JSON.stringify(debugPayload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed ItemShop UPDATE payload (not sent): PUT /ItemShop/${inventory.lightspeed_item_shop_id || `local_${inventory.id}`}.json ${JSON.stringify(debugPayload)}`
      );

      return res.sendSuccess(res, {
        message:
          'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
        payload: debugPayload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.

    // 1. Update reorderPoint/reorderLevel on Lightspeed POS via PUT /ItemShop/{itemShopID}.json
    if (
      Object.keys(lsItemShopPayload).length > 0 &&
      inventory.lightspeed_item_shop_id &&
      !inventory.lightspeed_item_shop_id.startsWith('local_')
    ) {
      logger.info(
        `Updating ItemShop ${inventory.lightspeed_item_shop_id} in Lightspeed POS via PUT:`,
        lsItemShopPayload
      );
      await LightspeedService.updateItemShop(
        inventory.lightspeed_item_shop_id,
        lsItemShopPayload
      );
    }

    // 2. Persist locally in Database
    await inventory.update({
      reorder_point: newRepoint,
      reorder_level: newRelevel,
    });

    return res.sendSuccess(res, {
      inventory: formatInventory(inventory),
      message: 'Inventory record updated successfully in Lightspeed POS and local database.',
    });
  } catch (error: unknown) {
    logger.error(error);
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
