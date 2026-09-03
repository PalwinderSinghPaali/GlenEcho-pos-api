import { Request, Response } from 'express';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import config from '@/config';
import logger from '@/utils/logger';
import sequelize from '@/database/connection';
import {
  Product,
  Category,
  Brand,
  Vendor,
  ProductMatrix,
  Tag,
  ProductTag,
  ProductImage,
  ProductInventory,
  ProductVendor,
  Shop,
  LightspeedEntityMap,
} from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Product instance to include all sub-resources and map to camelCase structure
 * where appropriate to perfectly align with the POS integration responses.
 */
async function formatProduct(product: Product, syncInfoMap?: Map<string, any>) {
  if (!product) return null;
  const json = product.toJSON();

  let syncInfo = null;
  if (syncInfoMap) {
    syncInfo = syncInfoMap.get(product.lightspeed_item_id) || null;
  } else {
    const dbMap = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'product',
        lightspeed_id: product.lightspeed_item_id,
      },
    });
    if (dbMap) {
      syncInfo = {
        entity_map_id: dbMap.id,
        lightspeed_id: dbMap.lightspeed_id,
        local_id: dbMap.local_id,
        last_sync: dbMap.last_sync,
        hash: dbMap.hash,
      };
    }
  }

  return {
    ...json,
    itemID: parseInt(product.lightspeed_item_id, 10) || 0,
    systemID: product.system_sku,
    customSKU: product.custom_sku,
    manufacturerSKU: product.manufacturer_sku,
    Note: product.note
      ? {
          note: product.note,
          isPublic: product.display_note ? 'true' : 'false',
        }
      : null,
    displayNote: product.display_note ? 'true' : 'false',
    createTime: product.createdAt,
    timeStamp: product.updatedAt,
    lightspeed_sync_info: syncInfo,
  };
}

/**
 * Parses a single CSV line into an array of values, handling quotes and escaped quotes.
 */
function parseCSVRow(rowStr: string): string[] {
  const result: string[] = [];
  let curVal = '';
  let insideQuotes = false;
  for (let i = 0; i < rowStr.length; i++) {
    const c = rowStr[i];
    if (c === '"') {
      if (insideQuotes && rowStr[i + 1] === '"') {
        curVal += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (c === ',' && !insideQuotes) {
      result.push(curVal.trim());
      curVal = '';
    } else {
      curVal += c;
    }
  }
  result.push(curVal.trim());
  return result;
}

/**
 * Helper to parse comma-separated IDs from request query parameters.
 */
function getMultiSelectIds(param: unknown): number[] | undefined {
  if (!param) return undefined;
  const ids = String(param)
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => !isNaN(x));
  return ids.length > 0 ? ids : undefined;
}

// ---------------------------------------------------------------------------
// 1. GET /product — Paginated & searchable list of products with relations
// ---------------------------------------------------------------------------
export const getProducts = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) || 'id';
    const order = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const categoryIds = getMultiSelectIds(req.query.category_id || req.query.categoryId);
    const brandIds = getMultiSelectIds(req.query.brand_id || req.query.brandId);
    const matrixIds = getMultiSelectIds(req.query.product_matrix_id || req.query.productMatrixId || req.query.matrixId);
    const vendorIds = getMultiSelectIds(req.query.vendor_id || req.query.vendorId);
    const archived = req.query.archived === 'true' ? true : req.query.archived === 'false' ? false : undefined;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { system_sku: { [Op.iLike]: `%${search}%` } },
        { custom_sku: { [Op.iLike]: `%${search}%` } },
        { upc: { [Op.iLike]: `%${search}%` } },
        { ean: { [Op.iLike]: `%${search}%` } },
        { manufacturer_sku: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (categoryIds) {
      where.category_id = { [Op.in]: categoryIds };
    }
    if (brandIds) {
      where.brand_id = { [Op.in]: brandIds };
    }
    if (matrixIds) {
      where.product_matrix_id = { [Op.in]: matrixIds };
    }
    if (vendorIds) {
      where.id = {
        [Op.in]: sequelize.literal(`(
          SELECT product_id FROM product_vendors WHERE vendor_id IN (${vendorIds.join(',')})
        )`),
      };
    }
    if (archived !== undefined) {
      where.archived = archived;
    } 

    // Price range filters
    const minPriceParam = req.query.min_price || req.query.minPrice;
    const maxPriceParam = req.query.max_price || req.query.maxPrice;
    const minPrice = minPriceParam ? Number(minPriceParam) : undefined;
    const maxPrice = maxPriceParam ? Number(maxPriceParam) : undefined;

    if (minPrice !== undefined && !isNaN(minPrice)) {
      where.price = { ...(where.price || {}), [Op.gte]: minPrice };
    }
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      where.price = { ...(where.price || {}), [Op.lte]: maxPrice };
    }

    const queryOptions: any = {
      where,
      order: [[sort, order]],
      include: [
        { model: Category, as: 'category' },
        { model: Brand, as: 'brand' },
        { model: ProductMatrix, as: 'matrix' },
        { model: Tag, as: 'tags', through: { attributes: [] } },
        { model: ProductImage, as: 'images' },
        {
          model: ProductInventory,
          as: 'inventories',
          include: [{ model: Shop, as: 'shop' }],
        },
        {
          model: ProductVendor,
          as: 'productVendors',
          include: [{ model: Vendor, as: 'vendor' }],
        },
      ],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Product.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });

      const itemIds = rows.map((p) => p.lightspeed_item_id).filter(Boolean);
      const entityMaps = await LightspeedEntityMap.findAll({
        where: {
          entity_type: 'product',
          lightspeed_id: { [Op.in]: itemIds },
        },
      });

      const syncInfoMap = new Map<string, any>();
      entityMaps.forEach((em) => {
        syncInfoMap.set(em.lightspeed_id, {
          entity_map_id: em.id,
          lightspeed_id: em.lightspeed_id,
          local_id: em.local_id,
          last_sync: em.last_sync,
          hash: em.hash,
        });
      });

      const formattedRows = await Promise.all(rows.map((p) => formatProduct(p, syncInfoMap)));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const products = await Product.findAll(queryOptions);

    const itemIds = products.map((p) => p.lightspeed_item_id).filter(Boolean);
    const entityMaps = await LightspeedEntityMap.findAll({
      where: {
        entity_type: 'product',
        lightspeed_id: { [Op.in]: itemIds },
      },
    });

    const syncInfoMap = new Map<string, any>();
    entityMaps.forEach((em) => {
      syncInfoMap.set(em.lightspeed_id, {
        entity_map_id: em.id,
        lightspeed_id: em.lightspeed_id,
        local_id: em.local_id,
        last_sync: em.last_sync,
        hash: em.hash,
      });
    });

    const formattedProducts = await Promise.all(products.map((p) => formatProduct(p, syncInfoMap)));
    return res.sendSuccess(res, formattedProducts);
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'NOT ABLE_TO_RETRIEVE_PRODUCTS');
  }
};

// ---------------------------------------------------------------------------
// 2. GET /product/:id — Single product detail
// ---------------------------------------------------------------------------
export const getProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid product ID.');
    }

    const product = await Product.findByPk(id, {
      include: [
        { model: Category, as: 'category' },
        { model: Brand, as: 'brand' },
        { model: ProductMatrix, as: 'matrix' },
        { model: Tag, as: 'tags', through: { attributes: [] } },
        { model: ProductImage, as: 'images' },
        {
          model: ProductInventory,
          as: 'inventories',
          include: [{ model: Shop, as: 'shop' }],
        },
        {
          model: ProductVendor,
          as: 'productVendors',
          include: [{ model: Vendor, as: 'vendor' }],
        },
      ],
    });

    if (!product) {
      return res.sendError(res, 'Product not found.');
    }

    const formatted = await formatProduct(product);
    return res.sendSuccess(res, formatted!);
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'NOT ABLE_TO_RETRIEVE_PRODUCT');
  }
};

// ---------------------------------------------------------------------------
// 3. POST /product — Create product locally + log Lightspeed payload
// ---------------------------------------------------------------------------
export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      description,
      system_sku,
      custom_sku,
      upc,
      ean,
      manufacturer_sku,
      price,
      msrp,
      online_price,
      default_cost,
      brand_id,
      category_id,
      product_matrix_id,
      discountable,
      taxable,
      item_type,
      publish_to_ecom,
      serialized,
      attribute_1_value,
      attribute_2_value,
      attribute_3_value,
      note,
      display_note,
      tax_class_id,
      tax_class_name,
      tag_ids,
      tags,
    } = req.body;

    const resolvedDescription = description || req.body.Description;
    if (!resolvedDescription || typeof resolvedDescription !== 'string' || resolvedDescription.trim() === '') {
      return res.sendError(res, 'Product description is required.');
    }

    // Resolve Brand/Category/Matrix IDs on Lightspeed side for logged payload
    const resolvedBrandId =
      brand_id !== undefined ? brand_id : (req.body.brandId !== undefined ? req.body.brandId : req.body.manufacturerID);
    let brandLsId = '0';
    if (resolvedBrandId) {
      const b = await Brand.findByPk(resolvedBrandId);
      if (b) brandLsId = b.lightspeed_brand_id;
    }

    const resolvedCategoryId =
      category_id !== undefined
        ? category_id
        : (req.body.categoryId !== undefined ? req.body.categoryId : req.body.categoryID);
    let categoryLsId = '0';
    if (resolvedCategoryId) {
      const c = await Category.findByPk(resolvedCategoryId);
      if (c) categoryLsId = c.lightspeed_category_id;
    }

    const resolvedMatrixId =
      product_matrix_id !== undefined
        ? product_matrix_id
        : (req.body.productMatrixId !== undefined ? req.body.productMatrixId : req.body.itemMatrixID);
    let matrixLsId = '0';
    if (resolvedMatrixId) {
      const m = await ProductMatrix.findByPk(resolvedMatrixId);
      if (m) matrixLsId = m.lightspeed_matrix_id;
    }

    // Resolve Tags (by IDs or by string names)
    let resolvedTagNames: string[] = [];
    let resolvedTagIds: number[] = [];

    const rawTagIds = tag_ids || req.body.tagIds;
    const rawTags = tags || req.body.Tags;

    if (Array.isArray(rawTagIds) && rawTagIds.length > 0) {
      const dbTags = await Tag.findAll({ where: { id: rawTagIds } });
      resolvedTagIds = dbTags.map((t) => t.id);
      resolvedTagNames = dbTags.map((t) => t.name.trim());
    } else if (Array.isArray(rawTags) && rawTags.length > 0) {
      for (const tName of rawTags) {
        if (typeof tName === 'string' && tName.trim() !== '') {
          const trimmed = tName.trim();
          const [tRecord] = await Tag.findOrCreate({
            where: { name: trimmed },
            defaults: {
              lightspeed_tag_id: `local_tag_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              name: trimmed,
              archived: false,
            },
          });
          resolvedTagIds.push(tRecord.id);
          resolvedTagNames.push(trimmed);
        }
      }
    }

    // Resolve Note and Display Note (supports Note, note, notes, display_note, displayNote, isPublic)
    const rawNote =
      note !== undefined ? note : (req.body.Note !== undefined ? req.body.Note : req.body.notes);

    let resolvedNote: string | null = null;
    let resolvedDisplayNote =
      display_note === true ||
      display_note === 'true' ||
      req.body.displayNote === true ||
      req.body.displayNote === 'true' ||
      req.body.isPublic === true ||
      req.body.isPublic === 'true';

    if (typeof rawNote === 'object' && rawNote !== null) {
      if (rawNote.note !== undefined && rawNote.note !== null) {
        resolvedNote = String(rawNote.note).trim();
      }
      if (rawNote.isPublic !== undefined) {
        resolvedDisplayNote = rawNote.isPublic === true || rawNote.isPublic === 'true';
      }
    } else if (typeof rawNote === 'string') {
      const trimmed = rawNote.trim();
      if (trimmed.length > 0) {
        resolvedNote = trimmed;
      }
    }

    // Resolve Attributes
    const resolvedAttr1 =
      attribute_1_value !== undefined
        ? attribute_1_value
        : (req.body.attribute1 !== undefined ? req.body.attribute1 : req.body.attribute_1);
    const resolvedAttr2 =
      attribute_2_value !== undefined
        ? attribute_2_value
        : (req.body.attribute2 !== undefined ? req.body.attribute2 : req.body.attribute_2);
    const resolvedAttr3 =
      attribute_3_value !== undefined
        ? attribute_3_value
        : (req.body.attribute3 !== undefined ? req.body.attribute3 : req.body.attribute_3);

    // Resolve Initial Stock / QOH
    const rawQoh =
      req.body.qoh !== undefined
        ? req.body.qoh
        : (req.body.initial_stock !== undefined
          ? req.body.initial_stock
          : (req.body.quantity !== undefined
            ? req.body.quantity
            : (req.body.stock !== undefined ? req.body.stock : undefined)));

    const specifiedShopId = req.body.shop_id || req.body.shopId || req.body.shopID;
    const requestedItemShops = Array.isArray(req.body.item_shops)
      ? req.body.item_shops
      : (Array.isArray(req.body.itemShops)
        ? req.body.itemShops
        : (req.body.ItemShops?.ItemShop
          ? (Array.isArray(req.body.ItemShops.ItemShop) ? req.body.ItemShops.ItemShop : [req.body.ItemShops.ItemShop])
          : undefined));

    let totalInitialQoh = 0;
    if (requestedItemShops && requestedItemShops.length > 0) {
      for (const is of requestedItemShops) {
        const q = Number(is.qoh !== undefined ? is.qoh : (is.quantity !== undefined ? is.quantity : is.stock));
        if (!isNaN(q) && q > 0) {
          totalInitialQoh += q;
        }
      }
    } else if (rawQoh !== undefined) {
      const parsedQoh = Number(rawQoh);
      if (!isNaN(parsedQoh) && parsedQoh > 0) {
        totalInitialQoh = parsedQoh;
      }
    }

    const resolvedTaxClassId = tax_class_id
      ? String(tax_class_id)
      : (req.body.taxClassID ? String(req.body.taxClassID) : '0');
    const resolvedPrice = price !== undefined ? price : (req.body.Price !== undefined ? req.body.Price : 0);
    const resolvedMsrp =
      msrp !== undefined
        ? msrp
        : (req.body.Msrp !== undefined ? req.body.Msrp : (req.body.MSRP !== undefined ? req.body.MSRP : 0));
    const resolvedOnlinePrice =
      online_price !== undefined ? online_price : (req.body.onlinePrice !== undefined ? req.body.onlinePrice : 0);
    const resolvedCost =
      default_cost !== undefined
        ? default_cost
        : (req.body.defaultCost !== undefined ? req.body.defaultCost : (req.body.cost !== undefined ? req.body.cost : 0));

    const lsPayload: any = {
      description: resolvedDescription.trim(),
      defaultCost: String(resolvedCost !== undefined && resolvedCost !== null ? resolvedCost : 0),
      discountable: discountable !== false ? 'true' : 'false',
      tax: taxable !== false ? 'true' : 'false',
      itemType: item_type || req.body.itemType || 'default',
      serialized: serialized ? 'true' : 'false',
      publishToEcom: publish_to_ecom !== false ? 'true' : 'false',
      Prices: {
        ItemPrice: [
          { amount: String(resolvedPrice || 0), useTypeID: '1', useType: 'Default' },
          { amount: String(resolvedMsrp || 0), useTypeID: '2', useType: 'MSRP' },
          { amount: String(resolvedOnlinePrice || 0), useTypeID: '3', useType: 'Online' },
        ],
      },
      manufacturerID: brandLsId,
      categoryID: categoryLsId,
      itemMatrixID: matrixLsId,
    };

    if (resolvedTaxClassId !== '0') {
      lsPayload.taxClassID = resolvedTaxClassId;
    }
    const resolvedCustomSku = custom_sku || req.body.customSku;
    const resolvedManufacturerSku = manufacturer_sku || req.body.manufacturerSku;
    const resolvedUpc = upc || req.body.Upc;
    const resolvedEan = ean || req.body.Ean;
    const resolvedSystemSkuInput = system_sku || req.body.systemSku;

    if (resolvedCustomSku) lsPayload.customSku = String(resolvedCustomSku);
    if (resolvedManufacturerSku) lsPayload.manufacturerSku = String(resolvedManufacturerSku);
    if (resolvedUpc) lsPayload.upc = String(resolvedUpc);
    if (resolvedEan) lsPayload.ean = String(resolvedEan);

    // Note and Display Note in Lightspeed payload
    if (resolvedNote) {
      lsPayload.note = resolvedNote;
      lsPayload.displayNote = resolvedDisplayNote ? 'true' : 'false';
      lsPayload.Note = {
        note: resolvedNote,
        isPublic: resolvedDisplayNote ? 'true' : 'false',
      };
    } else if (resolvedDisplayNote) {
      lsPayload.displayNote = 'true';
    }

    // Attributes in Lightspeed payload
    if (resolvedAttr1) lsPayload.attribute1 = String(resolvedAttr1);
    if (resolvedAttr2) lsPayload.attribute2 = String(resolvedAttr2);
    if (resolvedAttr3) lsPayload.attribute3 = String(resolvedAttr3);

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log('[READ-ONLY] Lightspeed Item CREATE payload:\n', JSON.stringify(lsPayload, null, 2));
      let qohPayload = null;
      if (totalInitialQoh > 0) {
        qohPayload = {
          ItemShops: {
            ItemShop: {
              itemShopID: 'placeholder_item_shop_id',
              qoh: totalInitialQoh,
            },
          },
        };
        console.log('[READ-ONLY] Lightspeed Item QOH UPDATE payload:\n', JSON.stringify(qohPayload, null, 2));
      }
      logger.info(
        `[READ-ONLY] Lightspeed Item CREATE payload (not sent): POST /Item.json ${JSON.stringify(lsPayload)}`
      );

      return res.sendSuccess(
        res,
        {
          message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
          payload: lsPayload,
          ...(qohPayload ? { qohPayload } : {}),
        },
        200
      );
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    logger.info('Sending Item CREATE request to Lightspeed POS...');
    const response = await LightspeedService.createProduct(lsPayload);
    const responseList = LightspeedService.extractList<any>(response, 'Item');
    const lsItem = responseList[0] || response.Item;
    if (!lsItem || !lsItem.itemID) {
      throw new Error('Invalid response received from Lightspeed Item API.');
    }

    const lightspeedItemId = lsItem.itemID.toString();
    const resolvedSystemSku = lsItem.systemSku ? lsItem.systemSku.toString() : (resolvedSystemSkuInput || null);

    // Retrieve ItemShops relation from Lightspeed (or fetch via GET if not present in create response)
    let lsItemShops: any[] =
      lsItem.ItemShops && lsItem.ItemShops.ItemShop ? LightspeedService.extractList<any>(lsItem.ItemShops, 'ItemShop') : [];

    if (lsItemShops.length === 0) {
      try {
        const itemDetail = await LightspeedService.getItem(lightspeedItemId, 'load_relations=["ItemShops"]');
        const detailList = LightspeedService.extractList<any>(itemDetail, 'Item');
        const detailedItem = detailList[0] || itemDetail.Item || itemDetail;
        if (detailedItem?.ItemShops?.ItemShop) {
          lsItemShops = LightspeedService.extractList<any>(detailedItem.ItemShops, 'ItemShop');
        }
      } catch (shopErr) {
        logger.warn(`Could not load ItemShops for newly created Item ${lightspeedItemId}:`, shopErr);
      }
    }

    // Filter out virtual summary shop (shopID: "0").
    // In Lightspeed Retail, shopID "0" is a read-only aggregate pseudo-shop across all stores.
    // Lightspeed explicitly rejects updating QOH on shopID 0, and local DB only maps real shops.
    const realItemShops = lsItemShops.filter(
      (s: any) => s && s.shopID !== undefined && s.shopID !== null && String(s.shopID) !== '0'
    );

    // Apply Option 1: Update initial QOH on Lightspeed via PUT /Item/{itemID}.json
    const qohUpdates: Array<{ itemShopID: string | number; qoh: number }> = [];
    const stockByItemShopId = new Map<string, number>();
    const stockByShopId = new Map<string, number>();

    if (totalInitialQoh > 0 && realItemShops.length > 0) {
      if (requestedItemShops && requestedItemShops.length > 0) {
        for (const reqShop of requestedItemShops) {
          const q = Number(
            reqShop.qoh !== undefined ? reqShop.qoh : (reqShop.quantity !== undefined ? reqShop.quantity : reqShop.stock)
          );
          if (!isNaN(q) && q > 0) {
            const match = realItemShops.find(
              (s: any) =>
                (reqShop.itemShopID && String(s.itemShopID) === String(reqShop.itemShopID)) ||
                (reqShop.shopID && String(s.shopID) === String(reqShop.shopID)) ||
                (reqShop.shop_id && String(s.shopID) === String(reqShop.shop_id))
            );
            if (match) {
              qohUpdates.push({ itemShopID: match.itemShopID, qoh: q });
              stockByItemShopId.set(String(match.itemShopID), q);
              stockByShopId.set(String(match.shopID), q);
            }
          }
        }
      } else {
        // Single initialQoh: assign to requested shop or default to first real shop in realItemShops
        let targetShop = realItemShops[0];
        if (specifiedShopId) {
          const dbShop = await Shop.findByPk(specifiedShopId);
          const targetLsShopId = dbShop ? dbShop.lightspeed_shop_id : String(specifiedShopId);
          const found = realItemShops.find((s: any) => String(s.shopID) === targetLsShopId);
          if (found) targetShop = found;
        }

        if (targetShop) {
          qohUpdates.push({ itemShopID: targetShop.itemShopID, qoh: totalInitialQoh });
          stockByItemShopId.set(String(targetShop.itemShopID), totalInitialQoh);
          stockByShopId.set(String(targetShop.shopID), totalInitialQoh);
        }
      }

      if (qohUpdates.length > 0) {
        try {
          logger.info(`Pushing initial QOH to Lightspeed for Item ${lightspeedItemId}:`, qohUpdates);
          await LightspeedService.updateItemQOH(
            lightspeedItemId,
            qohUpdates.length === 1 ? qohUpdates[0] : qohUpdates
          );
        } catch (qohErr) {
          logger.error(`Failed to update initial QOH on Lightspeed for Item ${lightspeedItemId}:`, qohErr);
        }
      }
    }

    const transaction = await sequelize.transaction();

    try {
      const product = await Product.create(
        {
          lightspeed_item_id: lightspeedItemId,
          description: resolvedDescription.trim(),
          system_sku: resolvedSystemSku,
          custom_sku: resolvedCustomSku || null,
          upc: resolvedUpc || null,
          ean: resolvedEan || null,
          manufacturer_sku: resolvedManufacturerSku || null,
          price: resolvedPrice || 0,
          msrp: resolvedMsrp || 0,
          online_price: resolvedOnlinePrice || 0,
          default_cost: resolvedCost || 0,
          brand_id: resolvedBrandId || null,
          category_id: resolvedCategoryId || null,
          product_matrix_id: resolvedMatrixId || null,
          discountable: discountable !== false,
          taxable: taxable !== false,
          item_type: item_type || req.body.itemType || 'Item',
          publish_to_ecom: publish_to_ecom !== false,
          serialized: !!serialized,
          attribute_1_value: resolvedAttr1 ? String(resolvedAttr1) : null,
          attribute_2_value: resolvedAttr2 ? String(resolvedAttr2) : null,
          attribute_3_value: resolvedAttr3 ? String(resolvedAttr3) : null,
          note: resolvedNote || null,
          display_note: !!resolvedDisplayNote,
          archived: false,
          tax_class_id: resolvedTaxClassId !== '0' ? resolvedTaxClassId : null,
          tax_class_name: tax_class_name || null,
          qoh: totalInitialQoh,
        },
        { transaction }
      );

      // Create ProductTag mappings
      if (resolvedTagIds.length > 0) {
        const bulkTags = resolvedTagIds.map((tId) => ({
          product_id: product.id,
          tag_id: tId,
        }));
        await ProductTag.bulkCreate(bulkTags, { transaction });
      }

      // Create ProductInventory records for the item's REAL shops (prevent duplicate product_id + shop_id)
      const insertedShopIds = new Set<number>();

      if (realItemShops.length > 0) {
        for (const shopData of realItemShops) {
          const lsShopId = shopData.shopID?.toString();
          const dbShop = await Shop.findOne({ where: { lightspeed_shop_id: lsShopId } });
          let localShopId = dbShop ? dbShop.id : null;

          if (!localShopId) {
            const shopMap = await LightspeedEntityMap.findOne({
              where: { entity_type: 'shop', lightspeed_id: lsShopId },
              transaction,
            });
            if (shopMap) {
              localShopId = shopMap.local_id;
            }
          }

          // If no local shop found or this localShopId is already created, skip to satisfy unique constraint
          if (!localShopId || insertedShopIds.has(localShopId)) {
            continue;
          }
          insertedShopIds.add(localShopId);

          const assignedQoh =
            stockByItemShopId.get(String(shopData.itemShopID)) ?? stockByShopId.get(String(lsShopId)) ?? 0;

          await ProductInventory.create(
            {
              product_id: product.id,
              shop_id: localShopId,
              qoh: assignedQoh,
              unit_cost: resolvedCost || 0,
              reorder_point: parseInt(shopData.reorderPoint || '0', 10),
              reorder_level: parseInt(shopData.reorderLevel || '0', 10),
              lightspeed_item_shop_id: shopData.itemShopID?.toString() || null,
              total_value: assignedQoh * (resolvedCost || 0),
              reserved: 0,
              layaway: 0,
              special_order: 0,
              workorder: 0,
              total_sale_value: assignedQoh * (resolvedPrice || 0),
              sellable: assignedQoh,
            },
            { transaction }
          );
        }
      }

      // Fallback: If no real ItemShops created, create a single record for default shop if not already inserted
      if (insertedShopIds.size === 0) {
        const defaultShop = await Shop.findOne();
        if (defaultShop && !insertedShopIds.has(defaultShop.id)) {
          insertedShopIds.add(defaultShop.id);
          await ProductInventory.create(
            {
              product_id: product.id,
              shop_id: defaultShop.id,
              qoh: totalInitialQoh,
              unit_cost: resolvedCost || 0,
              reorder_point: 0,
              reorder_level: 0,
              lightspeed_item_shop_id: null,
              total_value: totalInitialQoh * (resolvedCost || 0),
              reserved: 0,
              layaway: 0,
              special_order: 0,
              workorder: 0,
              total_sale_value: totalInitialQoh * (resolvedPrice || 0),
              sellable: totalInitialQoh,
            },
            { transaction }
          );
        }
      }

      // Create mapping in Entity Map with initial hash
      const hashPayload = {
        product_matrix_id: product.product_matrix_id,
        brand_id: product.brand_id,
        category_id: product.category_id,
        system_sku: product.system_sku,
        custom_sku: product.custom_sku,
        upc: product.upc,
        ean: product.ean,
        manufacturer_sku: product.manufacturer_sku,
        description: product.description,
        price: product.price,
        msrp: product.msrp,
        online_price: product.online_price,
        default_cost: product.default_cost,
        qoh: product.qoh,
        discountable: product.discountable,
        taxable: product.taxable,
        item_type: product.item_type,
        publish_to_ecom: product.publish_to_ecom,
        serialized: product.serialized,
        attribute_1_value: product.attribute_1_value,
        attribute_2_value: product.attribute_2_value,
        attribute_3_value: product.attribute_3_value,
        note: product.note,
        display_note: product.display_note,
        archived: product.archived,
        tax_class_id: product.tax_class_id,
        tax_class_name: product.tax_class_name,
        shops: realItemShops.map((s) => ({
          shopID: s.shopID,
          qoh: stockByItemShopId.get(String(s.itemShopID)) ?? 0,
          itemShopID: s.itemShopID,
        })),
        vendors: [],
        tags: [...resolvedTagNames].sort(),
        images: [],
      };
      const hash = LightspeedService.calculateHash(hashPayload);

      await LightspeedEntityMap.upsert(
        {
          entity_type: 'product',
          lightspeed_id: lightspeedItemId,
          local_id: product.id,
          hash,
          last_sync: new Date(),
        },
        { transaction }
      );

      await transaction.commit();

      const formatted = await formatProduct(product);
      return res.sendSuccess(
        res,
        { product: formatted, message: 'Product created successfully in Lightspeed and local database.' },
        201
      );
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 4. PUT /product/:id — Update product locally + log Lightspeed payload
// ---------------------------------------------------------------------------
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid product ID.');
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.sendError(res, 'Product not found.');
    }

    const updates = req.body;
    if (
      updates.description !== undefined &&
      (typeof updates.description !== 'string' || updates.description.trim() === '')
    ) {
      return res.sendError(res, 'Product description cannot be empty.');
    }

    // Prepare updated values
    const finalDescription = updates.description !== undefined ? updates.description.trim() : product.description;
    const finalBrandId = updates.brand_id !== undefined ? updates.brand_id : product.brand_id;
    const finalCategoryId = updates.category_id !== undefined ? updates.category_id : product.category_id;
    const finalMatrixId =
      updates.product_matrix_id !== undefined ? updates.product_matrix_id : product.product_matrix_id;

    let brandLsId = '0';
    if (finalBrandId) {
      const b = await Brand.findByPk(finalBrandId);
      if (b) brandLsId = b.lightspeed_brand_id;
    }

    let categoryLsId = '0';
    if (finalCategoryId) {
      const c = await Category.findByPk(finalCategoryId);
      if (c) categoryLsId = c.lightspeed_category_id;
    }

    let matrixLsId = '0';
    if (finalMatrixId) {
      const m = await ProductMatrix.findByPk(finalMatrixId);
      if (m) matrixLsId = m.lightspeed_matrix_id;
    }

    const finalTaxClassId =
      updates.tax_class_id !== undefined
        ? updates.tax_class_id
          ? String(updates.tax_class_id)
          : null
        : product.tax_class_id;
    const finalTaxClassName =
      updates.tax_class_name !== undefined ? updates.tax_class_name : product.tax_class_name;

    // Resolve Tags if provided
    let resolvedTagNames: string[] | undefined = undefined;
    let resolvedTagIds: number[] | undefined = undefined;

    if (updates.tag_ids !== undefined && Array.isArray(updates.tag_ids)) {
      const dbTags = await Tag.findAll({ where: { id: updates.tag_ids } });
      resolvedTagIds = dbTags.map((t) => t.id);
      resolvedTagNames = dbTags.map((t) => t.name.trim());
    } else if (updates.tags !== undefined && Array.isArray(updates.tags)) {
      resolvedTagIds = [];
      resolvedTagNames = [];
      for (const tName of updates.tags) {
        if (typeof tName === 'string' && tName.trim() !== '') {
          const trimmed = tName.trim();
          const [tRecord] = await Tag.findOrCreate({
            where: { name: trimmed },
            defaults: {
              lightspeed_tag_id: `local_tag_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              name: trimmed,
              archived: false,
            },
          });
          resolvedTagIds.push(tRecord.id);
          resolvedTagNames.push(trimmed);
        }
      }
    }

    const finalPrice = updates.price !== undefined ? updates.price : product.price;
    const finalMsrp = updates.msrp !== undefined ? updates.msrp : product.msrp;
    const finalOnlinePrice = updates.online_price !== undefined ? updates.online_price : product.online_price;
    const finalCost = updates.default_cost !== undefined ? updates.default_cost : product.default_cost;
    const finalDiscountable = updates.discountable !== undefined ? updates.discountable : product.discountable;
    const finalTaxable = updates.taxable !== undefined ? updates.taxable : product.taxable;
    const finalPublishToEcom =
      updates.publish_to_ecom !== undefined ? updates.publish_to_ecom : product.publish_to_ecom;
    const finalSerialized = updates.serialized !== undefined ? updates.serialized : product.serialized;
    const finalItemType = updates.item_type !== undefined ? updates.item_type : product.item_type;

    const lsPayload: any = {
      description: finalDescription,
      defaultCost: String(finalCost !== undefined && finalCost !== null ? finalCost : 0),
      discountable: finalDiscountable ? 'true' : 'false',
      tax: finalTaxable ? 'true' : 'false',
      itemType: finalItemType || 'default',
      serialized: finalSerialized ? 'true' : 'false',
      publishToEcom: finalPublishToEcom ? 'true' : 'false',
      Prices: {
        ItemPrice: [
          { amount: String(finalPrice || 0), useTypeID: '1', useType: 'Default' },
          { amount: String(finalMsrp || 0), useTypeID: '2', useType: 'MSRP' },
          { amount: String(finalOnlinePrice || 0), useTypeID: '3', useType: 'Online' },
        ],
      },
      manufacturerID: brandLsId,
      categoryID: categoryLsId,
      itemMatrixID: matrixLsId,
    };

    if (finalTaxClassId) {
      lsPayload.taxClassID = finalTaxClassId;
    }

    const finalCustomSku = updates.custom_sku !== undefined ? updates.custom_sku : product.custom_sku;
    const finalManufacturerSku =
      updates.manufacturer_sku !== undefined ? updates.manufacturer_sku : product.manufacturer_sku;
    const finalUpc = updates.upc !== undefined ? updates.upc : product.upc;
    const finalEan = updates.ean !== undefined ? updates.ean : product.ean;

    // Resolve Note update
    const rawNoteUpdate =
      updates.note !== undefined ? updates.note : (updates.Note !== undefined ? updates.Note : updates.notes);

    let finalNote = product.note;
    let finalDisplayNote = product.display_note;

    if (rawNoteUpdate !== undefined) {
      if (typeof rawNoteUpdate === 'object' && rawNoteUpdate !== null) {
        if (rawNoteUpdate.note !== undefined) {
          finalNote = rawNoteUpdate.note ? String(rawNoteUpdate.note).trim() : null;
        }
        if (rawNoteUpdate.isPublic !== undefined) {
          finalDisplayNote = rawNoteUpdate.isPublic === true || rawNoteUpdate.isPublic === 'true';
        }
      } else if (typeof rawNoteUpdate === 'string') {
        finalNote = rawNoteUpdate.trim() || null;
      } else if (rawNoteUpdate === null) {
        finalNote = null;
      }
    }

    if (updates.display_note !== undefined || updates.displayNote !== undefined || updates.isPublic !== undefined) {
      const d =
        updates.display_note !== undefined
          ? updates.display_note
          : (updates.displayNote !== undefined ? updates.displayNote : updates.isPublic);
      finalDisplayNote = d === true || d === 'true';
    }

    if (finalCustomSku) lsPayload.customSku = String(finalCustomSku);
    if (finalManufacturerSku) lsPayload.manufacturerSku = String(finalManufacturerSku);
    if (finalUpc) lsPayload.upc = String(finalUpc);
    if (finalEan) lsPayload.ean = String(finalEan);

    if (finalNote !== undefined) {
      lsPayload.note = finalNote || '';
      lsPayload.displayNote = finalDisplayNote ? 'true' : 'false';
      if (finalNote) {
        lsPayload.Note = {
          note: finalNote,
          isPublic: finalDisplayNote ? 'true' : 'false',
        };
      }
    } else if (finalDisplayNote !== undefined) {
      lsPayload.displayNote = finalDisplayNote ? 'true' : 'false';
    }

    // Resolve Attributes update
    const finalAttr1 =
      updates.attribute_1_value !== undefined
        ? updates.attribute_1_value
        : (updates.attribute1 !== undefined ? updates.attribute1 : product.attribute_1_value);
    const finalAttr2 =
      updates.attribute_2_value !== undefined
        ? updates.attribute_2_value
        : (updates.attribute2 !== undefined ? updates.attribute2 : product.attribute_2_value);
    const finalAttr3 =
      updates.attribute_3_value !== undefined
        ? updates.attribute_3_value
        : (updates.attribute3 !== undefined ? updates.attribute3 : product.attribute_3_value);

    if (finalAttr1) lsPayload.attribute1 = String(finalAttr1);
    if (finalAttr2) lsPayload.attribute2 = String(finalAttr2);
    if (finalAttr3) lsPayload.attribute3 = String(finalAttr3);

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Item UPDATE payload for product ID ${product.lightspeed_item_id}:\n`,
        JSON.stringify(lsPayload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed Item UPDATE payload (not sent): PUT /Item/${product.lightspeed_item_id}.json ${JSON.stringify(lsPayload)}`
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
        payload: lsPayload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    let lightspeedItemId = product.lightspeed_item_id;
    let updatedSystemSku = product.system_sku;

    if (!lightspeedItemId || lightspeedItemId.startsWith('local_')) {
      logger.info('Product has local ID only. Creating in Lightspeed POS with payload:', lsPayload);
      const response = await LightspeedService.createProduct(lsPayload);
      const responseList = LightspeedService.extractList<any>(response, 'Item');
      const lsItem = responseList[0] || response.Item;
      if (!lsItem || !lsItem.itemID) {
        throw new Error('Invalid response received from Lightspeed Item API.');
      }
      lightspeedItemId = lsItem.itemID.toString();
      if (lsItem.systemSku) {
        updatedSystemSku = lsItem.systemSku.toString();
      }
    } else {
      logger.info(`Updating product ${lightspeedItemId} in Lightspeed POS with payload:`, lsPayload);
      await LightspeedService.updateProduct(lightspeedItemId, lsPayload);
    }

    const transaction = await sequelize.transaction();
    try {
      await product.update(
        {
          lightspeed_item_id: lightspeedItemId,
          system_sku: updates.system_sku !== undefined ? updates.system_sku : updatedSystemSku,
          description: finalDescription,
          custom_sku: updates.custom_sku !== undefined ? updates.custom_sku : product.custom_sku,
          upc: updates.upc !== undefined ? updates.upc : product.upc,
          ean: updates.ean !== undefined ? updates.ean : product.ean,
          manufacturer_sku:
            updates.manufacturer_sku !== undefined ? updates.manufacturer_sku : product.manufacturer_sku,
          price: updates.price !== undefined ? updates.price : product.price,
          msrp: updates.msrp !== undefined ? updates.msrp : product.msrp,
          online_price: updates.online_price !== undefined ? updates.online_price : product.online_price,
          default_cost: updates.default_cost !== undefined ? updates.default_cost : product.default_cost,
          brand_id: finalBrandId,
          category_id: finalCategoryId,
          product_matrix_id: finalMatrixId,
          discountable: updates.discountable !== undefined ? !!updates.discountable : product.discountable,
          taxable: updates.taxable !== undefined ? !!updates.taxable : product.taxable,
          item_type: updates.item_type !== undefined ? updates.item_type : product.item_type,
          publish_to_ecom: updates.publish_to_ecom !== undefined ? !!updates.publish_to_ecom : product.publish_to_ecom,
          serialized: updates.serialized !== undefined ? !!updates.serialized : product.serialized,
          attribute_1_value: finalAttr1 ? String(finalAttr1) : null,
          attribute_2_value: finalAttr2 ? String(finalAttr2) : null,
          attribute_3_value: finalAttr3 ? String(finalAttr3) : null,
          note: finalNote !== undefined ? finalNote : product.note,
          display_note: !!finalDisplayNote,
          archived: updates.archived !== undefined ? !!updates.archived : product.archived,
          tax_class_id: finalTaxClassId,
          tax_class_name: finalTaxClassName,
        },
        { transaction }
      );

      // Update ProductTag mappings if tags were updated
      if (resolvedTagIds !== undefined) {
        await ProductTag.destroy({ where: { product_id: product.id }, transaction });
        if (resolvedTagIds.length > 0) {
          const bulkTags = resolvedTagIds.map((tId) => ({
            product_id: product.id,
            tag_id: tId,
          }));
          await ProductTag.bulkCreate(bulkTags, { transaction });
        }
      }

      // Re-hash product for Sync tracking
      const hashPayload = {
        product_matrix_id: product.product_matrix_id,
        brand_id: product.brand_id,
        category_id: product.category_id,
        system_sku: product.system_sku,
        custom_sku: product.custom_sku,
        upc: product.upc,
        ean: product.ean,
        manufacturer_sku: product.manufacturer_sku,
        description: product.description,
        price: product.price,
        msrp: product.msrp,
        online_price: product.online_price,
        default_cost: product.default_cost,
        qoh: product.qoh,
        discountable: product.discountable,
        taxable: product.taxable,
        item_type: product.item_type,
        publish_to_ecom: product.publish_to_ecom,
        serialized: product.serialized,
        attribute_1_value: product.attribute_1_value,
        attribute_2_value: product.attribute_2_value,
        attribute_3_value: product.attribute_3_value,
        note: product.note,
        display_note: product.display_note,
        archived: product.archived,
        tax_class_id: product.tax_class_id,
        tax_class_name: product.tax_class_name,
        shops: [],
        vendors: [],
        tags: resolvedTagNames !== undefined ? [...resolvedTagNames].sort() : [],
        images: [],
      };
      const hash = LightspeedService.calculateHash(hashPayload);

      await LightspeedEntityMap.upsert(
        {
          entity_type: 'product',
          lightspeed_id: product.lightspeed_item_id,
          local_id: product.id,
          hash,
          last_sync: new Date(),
        },
        { transaction }
      );

      await transaction.commit();

      const formatted = await formatProduct(product);
      return res.sendSuccess(res, {
        product: formatted,
        message: 'Product updated successfully in Lightspeed and local database.',
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 5. DELETE /product/:id — Delete product locally + log Lightspeed payload
// ---------------------------------------------------------------------------
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid product ID.');
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.sendError(res, 'Product not found.');
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the delete payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Item DELETE payload for product ID ${product.lightspeed_item_id}: DELETE /Item/${product.lightspeed_item_id}.json`
      );
      logger.info(
        `[READ-ONLY] Lightspeed Item DELETE payload (not sent): DELETE /Item/${product.lightspeed_item_id}.json`
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Delete payload displayed in console (no writes performed to POS or Database).',
        itemID: product.lightspeed_item_id,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with delete/archive in Lightspeed POS and local Database.
    if (product.lightspeed_item_id && !product.lightspeed_item_id.startsWith('local_')) {
      logger.info(`Archiving product ${product.lightspeed_item_id} in Lightspeed POS via DELETE...`);
      await LightspeedService.archiveProduct(product.lightspeed_item_id);
    }

    const transaction = await sequelize.transaction();
    try {
      // Clean up child tables to prevent foreign key issues
      await ProductInventory.destroy({ where: { product_id: product.id }, transaction });
      await ProductVendor.destroy({ where: { product_id: product.id }, transaction });
      await ProductTag.destroy({ where: { product_id: product.id }, transaction });
      await ProductImage.destroy({ where: { product_id: product.id }, transaction });
      await LightspeedEntityMap.destroy({
        where: { entity_type: 'product', lightspeed_id: product.lightspeed_item_id },
        transaction,
      });

      await product.destroy({ transaction });
      await transaction.commit();

      return res.sendSuccess(res, {
        message: `Product '${product.description}' deleted successfully from Lightspeed and local database.`,
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 6. POST /product/:id/images — Upload images for product
// ---------------------------------------------------------------------------
export const uploadProductImages = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid product ID.');
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.sendError(res, 'Product not found.');
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.sendError(res, 'No image files uploaded.');
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      const existingImagesCount = await ProductImage.count({ where: { product_id: product.id } });
      const filesInfo = files.map((file, i) => {
        const lsImagePayload = {
          description: file.originalname,
          ordering: existingImagesCount + i,
          itemID: parseInt(product.lightspeed_item_id, 10) || 0,
        };
        console.log(
          `[READ-ONLY] Lightspeed Image UPLOAD payload for product ID ${product.lightspeed_item_id} with file '${file.originalname}':\n`,
          JSON.stringify(lsImagePayload, null, 2)
        );
        logger.info(
          `[READ-ONLY] Lightspeed Image UPLOAD payload (not sent): POST /Item/${product.lightspeed_item_id}/Image.json with file '${file.originalname}' payload: ${JSON.stringify(lsImagePayload)}`
        );
        return {
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          ordering: existingImagesCount + i,
        };
      });

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Image upload payload displayed in console (no writes performed to POS or Database).',
        payload: {
          productID: product.lightspeed_item_id,
          files: filesInfo,
        },
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with image upload to Lightspeed POS and local Database.
    const dir = path.join(__dirname, '../../../uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const imagesCreated: ProductImage[] = [];
    const existingImagesCount = await ProductImage.count({ where: { product_id: product.id } });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uniqueFilename = `${Date.now()}_${i}_${path.basename(file.originalname)}`;
      const filePath = path.join(dir, uniqueFilename);

      fs.writeFileSync(filePath, file.buffer);

      const localUrl = `${config.app.prefix}/${config.app.version}/lightspeed/images/${uniqueFilename}`;
      const isFeatured = existingImagesCount === 0 && i === 0;

      let lightspeedImageId = `local_img_${Date.now()}_${i}`;
      let lightspeedUrl: string | null = null;

      if (product.lightspeed_item_id && !product.lightspeed_item_id.startsWith('local_')) {
        try {
          logger.info(
            `Uploading image '${file.originalname}' to Lightspeed POS for product ${product.lightspeed_item_id}...`
          );
          const lsImgRes = await LightspeedService.uploadItemImage(
            product.lightspeed_item_id,
            file.buffer,
            file.originalname,
            file.mimetype,
            {
              description: file.originalname,
              ordering: existingImagesCount + i,
            }
          );
          const responseList = LightspeedService.extractList<any>(lsImgRes, 'Image');
          const lsImage = responseList[0] || lsImgRes.Image;
          if (lsImage && lsImage.imageID) {
            lightspeedImageId = lsImage.imageID.toString();
            if (lsImage.baseImageURL && lsImage.publicID) {
              lightspeedUrl = `${lsImage.baseImageURL}${lsImage.publicID}.jpg`;
            }
          }
        } catch (uploadErr) {
          logger.error(`Error uploading image to Lightspeed for product ${product.id}:`, uploadErr);
        }
      }

      const img = await ProductImage.create({
        product_id: product.id,
        lightspeed_image_id: lightspeedImageId,
        lightspeed_url: lightspeedUrl,
        local_path: localUrl,
        filename: file.originalname,
        is_featured: isFeatured,
        download_status: 'done',
      });

      imagesCreated.push(img);
    }

    return res.sendSuccess(res, {
      images: imagesCreated,
      message: 'Product images uploaded successfully to Lightspeed and local database.',
    });
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 7. DELETE /product/:id/images/:imageId — Delete image for product
// ---------------------------------------------------------------------------
export const deleteProductImage = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid product ID.');
    }

    const imageIdParam = req.params.imageId || (req.params as any).image_id;
    if (!imageIdParam) {
      return res.sendError(res, 'Image ID is required.');
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.sendError(res, 'Product not found.');
    }

    // Find image by local ID or lightspeed_image_id, scoped to this product
    const isNumeric = !isNaN(Number(imageIdParam));
    const imageWhere: any = {
      product_id: product.id,
      ...(isNumeric
        ? {
            [Op.or]: [
              { id: Number(imageIdParam) },
              { lightspeed_image_id: String(imageIdParam) },
            ],
          }
        : { lightspeed_image_id: String(imageIdParam) }),
    };

    const image = await ProductImage.findOne({ where: imageWhere });
    if (!image) {
      return res.sendError(res, 'Product image not found.');
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    if (isReadOnly) {
      const payload = {
        productID: product.lightspeed_item_id,
        imageID: image.lightspeed_image_id || image.id,
        filename: image.filename,
        endpoint: image.lightspeed_image_id
          ? `DELETE /Image/${image.lightspeed_image_id}.json`
          : 'Local database only',
      };
      console.log(
        `[READ-ONLY] Lightspeed Image DELETE payload for product ID ${product.lightspeed_item_id}:\n`,
        JSON.stringify(payload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed Image DELETE payload (not sent): DELETE /Image/${image.lightspeed_image_id || image.id}.json`
      );

      return res.sendSuccess(res, {
        message:
          'Read-only mode is active. Image delete payload displayed in console (no writes performed to POS or Database).',
        payload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // Delete from Lightspeed POS if image has a valid Lightspeed ID
    if (image.lightspeed_image_id && !image.lightspeed_image_id.startsWith('local_')) {
      try {
        logger.info(
          `Deleting image ${image.lightspeed_image_id} from Lightspeed POS for product ${product.lightspeed_item_id}...`
        );
        await LightspeedService.deleteItemImage(
          image.lightspeed_image_id,
          product.lightspeed_item_id && !product.lightspeed_item_id.startsWith('local_')
            ? product.lightspeed_item_id
            : undefined
        );
      } catch (lsErr: any) {
        logger.error(
          `Failed to delete image ${image.lightspeed_image_id} from Lightspeed POS:`,
          lsErr
        );
      }
    }

    // Attempt to delete local file from disk if present
    if (image.local_path) {
      try {
        const filename = path.basename(image.local_path);
        const uploadsDir = path.join(__dirname, '../../../uploads');
        const diskPath = path.join(uploadsDir, filename);
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      } catch (fileErr) {
        logger.warn(`Could not remove local image file for image ${image.id}:`, fileErr);
      }
    }

    const wasFeatured = image.is_featured;
    await image.destroy();

    // If the deleted image was featured, promote the first remaining image to featured
    if (wasFeatured) {
      const nextImg = await ProductImage.findOne({
        where: { product_id: product.id },
        order: [['id', 'ASC']],
      });
      if (nextImg) {
        await nextImg.update({ is_featured: true });
      }
    }

    return res.sendSuccess(res, {
      message: 'Product image deleted successfully from Lightspeed and local database.',
      deletedImageId: image.id,
      lightspeedImageId: image.lightspeed_image_id,
    });
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 7. POST /product/import-csv — Bulk import products from CSV
// ---------------------------------------------------------------------------
export const uploadProductsCSV = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.sendError(res, 'No CSV file uploaded.');
    }

    const csvContent = file.buffer.toString('utf-8');
    const lines = csvContent
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return res.sendError(res, 'CSV file is empty or missing data rows.');
    }

    // Clean & parse headers
    const headers = parseCSVRow(lines[0]);
    const cleanHeaders = headers.map((h) => h.toLowerCase().trim().replace(/^"|"$/g, ''));

    const getCleanIndex = (name: string) => cleanHeaders.indexOf(name.toLowerCase().trim());
    const getAllCleanIndices = (name: string) => {
      const indices: number[] = [];
      const target = name.toLowerCase().trim();
      cleanHeaders.forEach((h, idx) => {
        if (h === target) indices.push(idx);
      });
      return indices;
    };

    // Header Index Mapping
    const descIdx = getCleanIndex('Description');
    const sysIdIdx = getCleanIndex('System ID');
    const upcIdx = getCleanIndex('UPC');
    const eanIdx = getCleanIndex('EAN');
    const customSkuIdx = getCleanIndex('Custom SKU');
    const mfgSkuIdx = getCleanIndex('Manufacturer SKU');
    const vendorIdx = getCleanIndex('Vendor');
    const vendorIdIdx = getCleanIndex('Vendor ID');
    const vendorCostIdx = getCleanIndex('Vendor cost');
    const isDefaultVendorIdx = getCleanIndex('Is Default Vendor');
    const brandIdx = getCleanIndex('Brand');
    const defaultCostIdx = getCleanIndex('Default Cost');
    const defaultPriceIdx = getCleanIndex('Default - Price');
    const msrpPriceIdx = getCleanIndex('MSRP - Price');
    const onlinePriceIdx = getCleanIndex('Online - Price');
    const matrixDescIdx = getCleanIndex('Matrix Description');
    const matrixAttrSetIdx = getCleanIndex('Matrix Attribute Set');
    const attr1Idx = getCleanIndex('Attribute 1');
    const attr2Idx = getCleanIndex('Attribute 2');
    const attr3Idx = getCleanIndex('Attribute 3');
    const discountableIdx = getCleanIndex('Discountable');
    const taxableIdx = getCleanIndex('Taxable');
    const itemTypeIdx = getCleanIndex('Item Type');
    const publishToEcomIdx = getCleanIndex('Publish To eCom');
    const serializedIdx = getCleanIndex('Serialized');
    const categoryIdx = getCleanIndex('Category');
    const subcat1Idx = getCleanIndex('Subcategory 1');
    const subcat2Idx = getCleanIndex('Subcategory 2');
    const subcat3Idx = getCleanIndex('Subcategory 3');
    const subcat4Idx = getCleanIndex('Subcategory 4');
    const clearTagsIdx = getCleanIndex('Clear Existing Tags');
    const addTagsIdx = getCleanIndex('Add Tags');
    const noteIdx = getCleanIndex('Note');
    const displayNoteIdx = getCleanIndex('Display Note');
    const archiveIdx = getCleanIndex('Archive');
    const featuredImgIdx = getCleanIndex('Featured Image');
    const imgIndices = getAllCleanIndices('Image');
    const shopQohIdx = getCleanIndex('Shop Quantity on Hand');
    const shopUnitCostIdx = getCleanIndex('Shop Unit Cost');
    const shopReorderPointIdx = getCleanIndex('Shop Reorder Point');
    const shopReorderLevelIdx = getCleanIndex('Shop Reorder Level');

    // Make sure we have uploaded files mapped for image matching
    const uploadedFilesMap = new Map<string, Express.Multer.File>();
    if (req.files && Array.isArray(req.files)) {
      for (const f of req.files) {
        uploadedFilesMap.set(f.originalname.toLowerCase(), f);
        const nameWithoutExt = path.parse(f.originalname).name.toLowerCase();
        uploadedFilesMap.set(nameWithoutExt, f);
      }
    }

    // Resolve or create default shop
    const [defaultShop] = await Shop.findOrCreate({
      where: { lightspeed_shop_id: '1' },
      defaults: {
        lightspeed_shop_id: '1',
        name: 'Default Shop',
        archived: false,
      },
    });

    const productsImported: any[] = [];
    const transaction = await sequelize.transaction();

    try {
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVRow(lines[i]);
        if (row.length < cleanHeaders.length) continue;

        const val = (idx: number) => (idx !== -1 && row[idx] ? row[idx].trim() : '');

        const descVal = val(descIdx);
        const sysIdVal = val(sysIdIdx);
        const upcVal = val(upcIdx);
        const eanVal = val(eanIdx);
        const customSkuVal = val(customSkuIdx);
        const mfgSkuVal = val(mfgSkuIdx);
        const vendorVal = val(vendorIdx);
        const vendorIdVal = val(vendorIdIdx);
        const vendorCostVal = parseFloat(val(vendorCostIdx)) || 0;
        const isDefaultVendorVal = val(isDefaultVendorIdx).toLowerCase() === 'yes';
        const brandVal = val(brandIdx);
        const defaultCostVal = parseFloat(val(defaultCostIdx)) || 0;
        const defaultPriceVal = parseFloat(val(defaultPriceIdx)) || 0;
        const msrpPriceVal = parseFloat(val(msrpPriceIdx)) || 0;
        const onlinePriceVal = parseFloat(val(onlinePriceIdx)) || 0;
        const matrixDescVal = val(matrixDescIdx);
        const matrixAttrSetVal = val(matrixAttrSetIdx);
        const attr1Val = val(attr1Idx);
        const attr2Val = val(attr2Idx);
        const attr3Val = val(attr3Idx);
        const discountableVal = val(discountableIdx).toLowerCase() !== 'no';
        const taxableVal = val(taxableIdx).toLowerCase() !== 'no';
        const itemTypeVal = val(itemTypeIdx) || 'Item';
        const publishToEcomVal = val(publishToEcomIdx).toLowerCase() !== 'no';
        const serializedVal = val(serializedIdx).toLowerCase() === 'yes';
        const catVal = val(categoryIdx);
        const subcat1Val = val(subcat1Idx);
        const subcat2Val = val(subcat2Idx);
        const subcat3Val = val(subcat3Idx);
        const subcat4Val = val(subcat4Idx);
        const clearTagsVal = val(clearTagsIdx).toLowerCase() === 'yes';
        const addTagsVal = val(addTagsIdx);
        const noteVal = val(noteIdx);
        const displayNoteVal = val(displayNoteIdx).toLowerCase() === 'yes';
        const archiveVal = val(archiveIdx).toLowerCase() === 'yes';
        const featuredImgVal = val(featuredImgIdx);
        const shopQohVal = parseInt(val(shopQohIdx), 10) || 0;
        const shopUnitCostVal = parseFloat(val(shopUnitCostIdx)) || 0;
        const shopReorderPointVal = parseInt(val(shopReorderPointIdx), 10) || 0;
        const shopReorderLevelVal = parseInt(val(shopReorderLevelIdx), 10) || 0;

        // Skip if item has no description and no matrix description
        if (!descVal && !matrixDescVal) {
          logger.warn(`Skipping CSV line ${i + 1} because it has no description or matrix description.`);
          continue;
        }

        // 1. Resolve Category Hierarchy
        let categoryLocalId: number | null = null;
        const categoryPath = [catVal, subcat1Val, subcat2Val, subcat3Val, subcat4Val].filter(Boolean);

        if (categoryPath.length > 0) {
          let parentId: number | null = null;
          for (let depth = 0; depth < categoryPath.length; depth++) {
            const catName = categoryPath[depth];
            // Compute full path name
            const fullPathParts = categoryPath.slice(0, depth + 1);
            const fullPathName = fullPathParts.join(' / ');

            const [catRecord] = (await Category.findOrCreate({
              where: {
                name: catName,
                parent_id: parentId,
              },
              defaults: {
                name: catName,
                parent_id: parentId,
                node_depth: depth,
                full_path_name: fullPathName,
                lightspeed_category_id: `local_cat_${Date.now()}_${depth}`,
              },
              transaction,
            })) as [Category, boolean];
            parentId = catRecord.id;
            categoryLocalId = catRecord.id;
          }
        }

        // 2. Resolve Brand
        let brandLocalId: number | null = null;
        if (brandVal) {
          const [brandRecord] = await Brand.findOrCreate({
            where: { name: brandVal },
            defaults: {
              name: brandVal,
              lightspeed_brand_id: `local_brand_${Date.now()}`,
            },
            transaction,
          });
          brandLocalId = brandRecord.id;
        }

        // 3. Resolve Vendor
        let vendorLocalId: number | null = null;
        if (vendorVal) {
          const [vendorRecord] = await Vendor.findOrCreate({
            where: { name: vendorVal },
            defaults: {
              name: vendorVal,
              lightspeed_vendor_id: `local_vendor_${Date.now()}`,
              archived: false,
            },
            transaction,
          });
          vendorLocalId = vendorRecord.id;
        }

        // 4. Resolve Matrix
        let matrixLocalId: number | null = null;
        if (matrixDescVal) {
          let attr1Name: string | null = null;
          let attr2Name: string | null = null;
          let attr3Name: string | null = null;

          if (matrixAttrSetVal) {
            const parts = matrixAttrSetVal.split('/').map((s) => s.trim());
            attr1Name = parts[0] || null;
            attr2Name = parts[1] || null;
            attr3Name = parts[2] || null;
          }

          const [matrixRecord] = await ProductMatrix.findOrCreate({
            where: { description: matrixDescVal },
            defaults: {
              lightspeed_matrix_id: `local_matrix_${Date.now()}`,
              description: matrixDescVal,
              attribute_1_name: attr1Name,
              attribute_2_name: attr2Name,
              attribute_3_name: attr3Name,
              brand_id: brandLocalId,
              category_id: categoryLocalId,
              vendor_id: vendorLocalId,
            },
            transaction,
          });
          matrixLocalId = matrixRecord.id;
        }

        // 5. Create or Update Product
        let product: Product | null = null;

        // Try lookup by upc, ean, custom_sku, or description
        if (upcVal) {
          product = await Product.findOne({ where: { upc: upcVal }, transaction });
        }
        if (!product && eanVal) {
          product = await Product.findOne({ where: { ean: eanVal }, transaction });
        }
        if (!product && customSkuVal) {
          product = await Product.findOne({ where: { custom_sku: customSkuVal }, transaction });
        }
        if (!product && sysIdVal) {
          product = await Product.findOne({ where: { system_sku: sysIdVal }, transaction });
        }

        const finalProductDesc =
          descVal || `${matrixDescVal} (${[attr1Val, attr2Val, attr3Val].filter(Boolean).join(', ')})`;
        const productData = {
          description: finalProductDesc,
          system_sku: sysIdVal || null,
          custom_sku: customSkuVal || null,
          upc: upcVal || null,
          ean: eanVal || null,
          manufacturer_sku: mfgSkuVal || null,
          price: defaultPriceVal,
          msrp: msrpPriceVal,
          online_price: onlinePriceVal,
          default_cost: defaultCostVal,
          avg_cost: defaultCostVal,
          brand_id: brandLocalId,
          category_id: categoryLocalId,
          product_matrix_id: matrixLocalId,
          discountable: discountableVal,
          taxable: taxableVal,
          item_type: itemTypeVal,
          publish_to_ecom: publishToEcomVal,
          serialized: serializedVal,
          attribute_1_value: attr1Val || null,
          attribute_2_value: attr2Val || null,
          attribute_3_value: attr3Val || null,
          note: noteVal || null,
          display_note: displayNoteVal,
          archived: archiveVal,
        };

        if (product) {
          await product.update(productData, { transaction });
        } else {
          product = await Product.create(
            {
              ...productData,
              lightspeed_item_id: `local_item_${Date.now()}_${i}`,
              qoh: 0, // calculated from inventories
            },
            { transaction }
          );
        }

        // Log R-Series Item write action
        const pricesPayload = [
          { useType: 'Default', amount: product.price },
          { useType: 'MSRP', amount: product.msrp },
          { useType: 'Online', amount: product.online_price },
        ];
        const lsItemPayload = {
          description: product.description,
          systemSku: product.system_sku,
          customSku: product.custom_sku,
          upc: product.upc,
          ean: product.ean,
          manufacturerSku: product.manufacturer_sku,
          defaultCost: product.default_cost,
          discountable: product.discountable ? 'true' : 'false',
          tax: product.taxable ? 'true' : 'false',
          publishToEcom: product.publish_to_ecom ? 'true' : 'false',
          serialized: product.serialized ? 'true' : 'false',
          attribute1: product.attribute_1_value,
          attribute2: product.attribute_2_value,
          attribute3: product.attribute_3_value,
          note: product.note,
          displayNote: product.display_note ? 'true' : 'false',
          Prices: { ItemPrice: pricesPayload },
          manufacturerID: brandVal ? `local_brand_${brandLocalId}` : '0',
          categoryID: categoryLocalId ? `local_cat_${categoryLocalId}` : '0',
          itemMatrixID: matrixLocalId ? `local_matrix_${matrixLocalId}` : '0',
        };
        logger.info(
          `[READ-ONLY] CSV Import Item WRITE payload (not sent): POST /Item.json ${JSON.stringify(lsItemPayload)}`
        );

        // 6. Vendor Association
        if (vendorLocalId) {
          const existingPV = await ProductVendor.findOne({
            where: { product_id: product.id, vendor_id: vendorLocalId },
            transaction,
          });

          if (existingPV) {
            await existingPV.update(
              {
                vendor_sku: vendorIdVal || null,
                vendor_cost: vendorCostVal,
                is_primary: isDefaultVendorVal,
              },
              { transaction }
            );
          } else {
            await ProductVendor.create(
              {
                product_id: product.id,
                vendor_id: vendorLocalId,
                lightspeed_item_vendor_num_id: null,
                vendor_sku: vendorIdVal || null,
                vendor_cost: vendorCostVal,
                is_primary: isDefaultVendorVal,
                lead_time: 0,
                minimum_order_qty: 0,
              },
              { transaction }
            );
          }
        }

        // 7. Inventory Levels
        const existingInv = await ProductInventory.findOne({
          where: { product_id: product.id, shop_id: defaultShop.id },
          transaction,
        });

        if (existingInv) {
          await existingInv.update(
            {
              qoh: shopQohVal,
              unit_cost: shopUnitCostVal || defaultCostVal,
              reorder_point: shopReorderPointVal,
              reorder_level: shopReorderLevelVal,
            },
            { transaction }
          );
        } else {
          await ProductInventory.create(
            {
              product_id: product.id,
              shop_id: defaultShop.id,
              qoh: shopQohVal,
              unit_cost: shopUnitCostVal || defaultCostVal,
              reorder_point: shopReorderPointVal,
              reorder_level: shopReorderLevelVal,
            },
            { transaction }
          );
        }

        // Update overall QOH sum
        const totalQoh = await ProductInventory.sum('qoh', {
          where: { product_id: product.id },
          transaction,
        });
        await product.update({ qoh: totalQoh || 0 }, { transaction });

        // 8. Tags Association
        if (clearTagsVal) {
          await ProductTag.destroy({ where: { product_id: product.id }, transaction });
        }

        if (addTagsVal) {
          const tags = addTagsVal
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          for (const tagName of tags) {
            const [tagRecord] = await Tag.findOrCreate({
              where: { name: tagName },
              defaults: {
                name: tagName,
                lightspeed_tag_id: `local_tag_${Date.now()}`,
              },
              transaction,
            });

            await ProductTag.findOrCreate({
              where: { product_id: product.id, tag_id: tagRecord.id },
              defaults: {
                product_id: product.id,
                tag_id: tagRecord.id,
              },
              transaction,
            });
          }
        }

        // 9. Images Import
        const imageList = [featuredImgVal, ...imgIndices.map((idx) => val(idx))].filter(Boolean);
        const uploadsDir = path.join(__dirname, '../../../uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        for (let imgIndex = 0; imgIndex < imageList.length; imgIndex++) {
          const imgStr = imageList[imgIndex];
          const imgStrLower = imgStr.toLowerCase();
          const nameWithoutExt = path.parse(imgStr).name.toLowerCase();

          let fileBuffer: Buffer | null = null;
          let originalName = imgStr;
          let finalFilename = '';

          // Match in uploaded files
          const matchedFile = uploadedFilesMap.get(imgStrLower) || uploadedFilesMap.get(nameWithoutExt);
          if (matchedFile) {
            fileBuffer = matchedFile.buffer;
            originalName = matchedFile.originalname;
            finalFilename = `${Date.now()}_${i}_${imgIndex}_${path.basename(matchedFile.originalname)}`;
          } else {
            // Match in local project directory sources
            const pathsToCheck = [
              path.join('D:/Rajiv POS/GlenEchoNurseries-backend/lightspeed images', imgStr),
              path.join('D:/Rajiv POS/GlenEchoNurseries-backend/uploads', imgStr),
            ];

            if (!path.extname(imgStr)) {
              pathsToCheck.push(
                path.join('D:/Rajiv POS/GlenEchoNurseries-backend/lightspeed images', `${imgStr}.jpg`),
                path.join('D:/Rajiv POS/GlenEchoNurseries-backend/lightspeed images', `${imgStr}.png`),
                path.join('D:/Rajiv POS/GlenEchoNurseries-backend/uploads', `${imgStr}.jpg`),
                path.join('D:/Rajiv POS/GlenEchoNurseries-backend/uploads', `${imgStr}.png`)
              );
            }

            for (const p of pathsToCheck) {
              if (fs.existsSync(p)) {
                fileBuffer = fs.readFileSync(p);
                originalName = path.basename(p);
                finalFilename = `${Date.now()}_${i}_${imgIndex}_${originalName}`;
                break;
              }
            }
          }

          if (fileBuffer) {
            fs.writeFileSync(path.join(uploadsDir, finalFilename), fileBuffer);
            const imageUrl = `${config.app.prefix}/${config.app.version}/lightspeed/images/${finalFilename}`;

            const isFeatured = imgStr === featuredImgVal || imgIndex === 0;

            // Log upload image payload
            const lsImagePayload = {
              description: originalName,
              ordering: imgIndex,
              itemID: parseInt(product.lightspeed_item_id, 10) || 0,
            };
            logger.info(
              `[READ-ONLY] CSV Import Image WRITE payload (not sent): POST /Image.json with file '${originalName}' payload: ${JSON.stringify(lsImagePayload)}`
            );

            await ProductImage.findOrCreate({
              where: { product_id: product.id, filename: originalName },
              defaults: {
                product_id: product.id,
                lightspeed_image_id: `local_img_${Date.now()}_${i}_${imgIndex}`,
                lightspeed_url: null,
                local_path: imageUrl,
                filename: originalName,
                is_featured: isFeatured,
                download_status: 'done',
              },
              transaction,
            });
          } else {
            // Image not found in either upload stream or local templates folder
            logger.warn(
              `CSV Import warning: Image file '${imgStr}' could not be located in uploads or templates folder.`
            );
          }
        }

        // 10. Upsert LightspeedEntityMap hash ledger for product
        const updatedHashPayload = {
          product_matrix_id: product.product_matrix_id,
          brand_id: product.brand_id,
          category_id: product.category_id,
          system_sku: product.system_sku,
          custom_sku: product.custom_sku,
          upc: product.upc,
          ean: product.ean,
          manufacturer_sku: product.manufacturer_sku,
          description: product.description,
          price: product.price,
          msrp: product.msrp,
          online_price: product.online_price,
          default_cost: product.default_cost,
          qoh: product.qoh,
          discountable: product.discountable,
          taxable: product.taxable,
          item_type: product.item_type,
          publish_to_ecom: product.publish_to_ecom,
          serialized: product.serialized,
          attribute_1_value: product.attribute_1_value,
          attribute_2_value: product.attribute_2_value,
          attribute_3_value: product.attribute_3_value,
          note: product.note,
          display_note: product.display_note,
          archived: product.archived,
          shops: [],
          vendors: [],
          tags: [],
          images: [],
        };
        const hash = LightspeedService.calculateHash(updatedHashPayload);

        await LightspeedEntityMap.upsert(
          {
            entity_type: 'product',
            lightspeed_id: product.lightspeed_item_id,
            local_id: product.id,
            hash,
            last_sync: new Date(),
          },
          { transaction }
        );

        productsImported.push(product);
      }

      await transaction.commit();

      return res.sendSuccess(res, {
        importedCount: productsImported.length,
        message: `${productsImported.length} products successfully imported (local only — READ-ONLY mode active).`,
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 8. GET /product/search — Advanced search with relevance scoring, filters & facets
// ---------------------------------------------------------------------------
export const searchProducts = async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || (req.query.query as string) || '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const categoryIds = getMultiSelectIds(req.query.category_id || req.query.categoryId);
    const brandIds = getMultiSelectIds(req.query.brand_id || req.query.brandId);
    const matrixIds = getMultiSelectIds(req.query.product_matrix_id || req.query.productMatrixId || req.query.matrixId);
    const vendorIds = getMultiSelectIds(req.query.vendor_id || req.query.vendorId);
    const minPrice = req.query.min_price ? Number(req.query.min_price) : undefined;
    const maxPrice = req.query.max_price ? Number(req.query.max_price) : undefined;
    const inStock = req.query.in_stock === 'true';
    const tagId = req.query.tag_id ? Number(req.query.tag_id) : undefined;
    const sort = (req.query.sort as string) || 'relevance';
    const order = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';

    const where: any = {};
    where.archived = false; // default to active products only

    // 1. Handle Full-Text Search and Exact Matching
    let scoreAttr: any = null;
    let orderClause: any[] = [];

    if (query.trim()) {
      const cleanQuery = query.trim().toLowerCase();
      // Tokenize the query for FTS: keep alphanumeric and space, split by whitespace
      const words = cleanQuery
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      if (words.length > 0) {
        // Construct prefix search for each token (e.g. word1:* & word2:*)
        const tsquery = words.map((w) => `${w.replace(/['":*&|!]/g, '')}:*`).join(' & ');

        // Add full-text search match condition
        where[Op.and] = [sequelize.literal(`tsv_search @@ to_tsquery('english', ${sequelize.escape(tsquery)})`)];

        // Scoring algorithm: FTS rank + Exact SKU/UPC matches + Prefix SKU matches
        scoreAttr = [
          sequelize.literal(`
            (
              ts_rank(tsv_search, to_tsquery('english', ${sequelize.escape(tsquery)})) * 10 +
              (CASE 
                WHEN LOWER(system_sku) = ${sequelize.escape(cleanQuery)} OR LOWER(custom_sku) = ${sequelize.escape(cleanQuery)} OR LOWER(manufacturer_sku) = ${sequelize.escape(cleanQuery)} OR LOWER(upc) = ${sequelize.escape(cleanQuery)} THEN 100
                WHEN LOWER(description) = ${sequelize.escape(cleanQuery)} THEN 80
                WHEN LOWER(system_sku) LIKE ${sequelize.escape(cleanQuery + '%')} OR LOWER(custom_sku) LIKE ${sequelize.escape(cleanQuery + '%')} THEN 50
                ELSE 0
              END)
            )
          `),
          'search_score',
        ];
      }
    }

    // 2. Add Filters
    if (categoryIds) {
      where.category_id = { [Op.in]: categoryIds };
    }
    if (brandIds) {
      where.brand_id = { [Op.in]: brandIds };
    }
    if (matrixIds) {
      where.product_matrix_id = { [Op.in]: matrixIds };
    }
    if (vendorIds) {
      where.id = {
        [Op.in]: sequelize.literal(`(
          SELECT product_id FROM product_vendors WHERE vendor_id IN (${vendorIds.join(',')})
        )`),
      };
    }
    if (minPrice !== undefined && !isNaN(minPrice)) {
      where.price = { ...(where.price || {}), [Op.gte]: minPrice };
    }
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      where.price = { ...(where.price || {}), [Op.lte]: maxPrice };
    }
    if (inStock) {
      where.qoh = { [Op.gt]: 0 };
    }

    // Tag filter
    const tagInclude: any = {
      model: Tag,
      as: 'tags',
      attributes: ['id', 'name'],
      through: { attributes: [] },
    };
    if (tagId !== undefined && !isNaN(tagId)) {
      tagInclude.where = { id: tagId };
    }

    // 3. Set sorting order
    if (sort !== 'relevance') {
      orderClause = [[sort, order]];
    } else {
      // default: relevance
      if (scoreAttr) {
        orderClause = [[sequelize.literal('search_score'), 'DESC']];
      } else {
        orderClause = [['id', 'DESC']];
      }
    }

    // Include attributes (if search score is computed)
    const attributes = scoreAttr ? { include: [scoreAttr] } : undefined;

    // 4. Query Products (Paginated)
    const queryOptions: any = {
      where,
      attributes,
      order: orderClause,
      include: [
        { model: Category, as: 'category', attributes: ['id', 'name', 'full_path_name'] },
        { model: Brand, as: 'brand', attributes: ['id', 'name'] },
        tagInclude,
        { model: ProductImage, as: 'images' },
        {
          model: ProductInventory,
          as: 'inventories',
          attributes: ['id', 'qoh', 'shop_id'],
          include: [{ model: Shop, as: 'shop', attributes: ['id', 'name'] }],
        },
        {
          model: ProductVendor,
          as: 'productVendors',
          include: [{ model: Vendor, as: 'vendor' }],
        },
      ],
      offset,
      limit,
      distinct: true,
    };

    const { count, rows } = await Product.findAndCountAll(queryOptions);

    // Format products camelCase and get Lightspeed sync info
    const itemIds = rows.map((p) => p.lightspeed_item_id).filter(Boolean);
    const entityMaps = await LightspeedEntityMap.findAll({
      where: {
        entity_type: 'product',
        lightspeed_id: { [Op.in]: itemIds },
      },
    });

    const syncInfoMap = new Map<string, any>();
    entityMaps.forEach((em) => {
      syncInfoMap.set(em.lightspeed_id, {
        entity_map_id: em.id,
        lightspeed_id: em.lightspeed_id,
        local_id: em.local_id,
        last_sync: em.last_sync,
        hash: em.hash,
      });
    });

    const formattedRows = await Promise.all(rows.map((p) => formatProduct(p, syncInfoMap)));

    // 5. Dynamic Facet Aggregation (Brands, Categories, Tags, Prices)
    // Run concurrently to speed up the response
    const [brandFacets, categoryFacets, tagFacets, priceBounds] = await Promise.all([
      // Brands count
      Product.findAll({
        attributes: ['brand_id', [sequelize.fn('COUNT', sequelize.literal('DISTINCT "Product"."id"')), 'count']],
        where,
        include: [
          { model: Brand, as: 'brand', attributes: ['name'], required: true },
          ...(tagId !== undefined && !isNaN(tagId)
            ? [{ model: Tag, as: 'tags', attributes: [], through: { attributes: [] }, where: { id: tagId } }]
            : []),
        ],
        group: ['brand_id', 'brand.id', 'brand.name'],
        raw: true,
      }),

      // Categories count
      Product.findAll({
        attributes: ['category_id', [sequelize.fn('COUNT', sequelize.literal('DISTINCT "Product"."id"')), 'count']],
        where,
        include: [
          { model: Category, as: 'category', attributes: ['name'], required: true },
          ...(tagId !== undefined && !isNaN(tagId)
            ? [{ model: Tag, as: 'tags', attributes: [], through: { attributes: [] }, where: { id: tagId } }]
            : []),
        ],
        group: ['category_id', 'category.id', 'category.name'],
        raw: true,
      }),

      // Tags count
      Product.findAll({
        attributes: [
          [sequelize.col('tags.id'), 'tag_id'],
          [sequelize.col('tags.name'), 'tag_name'],
          [sequelize.fn('COUNT', sequelize.literal('DISTINCT "Product"."id"')), 'count'],
        ],
        where,
        include: [{ model: Tag, as: 'tags', attributes: [], through: { attributes: [] }, required: true }],
        group: ['tags.id', 'tags.name'],
        raw: true,
        subQuery: false,
      }),

      // Price range
      Product.findOne({
        attributes: [
          [sequelize.fn('MIN', sequelize.col('price')), 'min'],
          [sequelize.fn('MAX', sequelize.col('price')), 'max'],
        ],
        where,
        raw: true,
      }),
    ]);

    // Format facets output
    const facets = {
      brands: brandFacets.map((b: any) => ({
        id: b.brand_id,
        name: b['brand.name'],
        count: parseInt(b.count, 10),
      })),
      categories: categoryFacets.map((c: any) => ({
        id: c.category_id,
        name: c['category.name'],
        count: parseInt(c.count, 10),
      })),
      tags: tagFacets.map((t: any) => ({
        id: t.tag_id,
        name: t.tag_name,
        count: parseInt(t.count, 10),
      })),
      priceRange: {
        min: priceBounds && (priceBounds as any).min !== null ? parseFloat((priceBounds as any).min) : 0,
        max: priceBounds && (priceBounds as any).max !== null ? parseFloat((priceBounds as any).max) : 0,
      },
    };

    return res.status(200).json({
      success: true,
      data: {
        products: formattedRows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
        facets,
      },
    });
  } catch (error: any) {
    logger.error(error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

export default {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  deleteProductImage,
  uploadProductsCSV,
  searchProducts,
};
