import { Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import sequelize from '@/database/connection';
import {
  Category,
  LightspeedEntityMap,
  Product,
  Brand,
  ProductImage,
  ProductMatrix,
  Tag,
  ProductInventory,
  Shop,
  ProductVendor,
  Vendor,
} from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import logger from '@/utils/logger';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Category instance to include all the exact fields that are there in
 * Lightspeed (both camelCase and original database keys) so that the admin
 * panel receives a payload perfectly synced with the Lightspeed Category schema.
 */
function formatCategory(catObj: any) {
  if (!catObj) return null;
  const json = catObj.toJSON ? catObj.toJSON() : catObj;

  // If parent object is loaded, get its lightspeed ID, otherwise check parent_id
  let lightspeedParentId = '0';
  if (json.parent) {
    lightspeedParentId = json.parent.lightspeed_category_id || '0';
  } else if (json.parent_id === null || json.parent_id === 0) {
    lightspeedParentId = '0';
  } else {
    // If parent is not loaded but we have parent_id, default to it, but typically
    // the parent is loaded in our queries or parentID is handled.
    lightspeedParentId = String(json.parent_id);
  }
  const parsedParentId = parseInt(lightspeedParentId, 10) || 0;

  return {
    ...json,
    // Exact Lightspeed API fields
    categoryID: parseInt(json.lightspeed_category_id, 10) || 0,
    name: json.name,
    nodeDepth: String(json.node_depth || 0),
    fullPathName: json.full_path_name || json.name,
    leftNode: json.left_node !== undefined ? json.left_node : 0,
    rightNode: json.right_node !== undefined ? json.right_node : 0,
    createTime: json.createdAt || json.created_at || null,
    timeStamp: json.updatedAt || json.updated_at || null,
    parentID: parsedParentId,
  };
}

/**
 * Walks up the parent chain for a given parent category ID and builds a
 * slash-delimited full path string, appending `currentName` at the end.
 *
 * @example
 *   // Parent chain: "Décor" -> "Christmas Décor"
 *   await buildFullPathName(parentId, "Ornaments")
 *   // => "Décor / Christmas Décor / Ornaments"
 */
async function buildFullPathName(parentCategoryId: number | null, currentName: string): Promise<string> {
  if (!parentCategoryId) return currentName;

  const ancestors: string[] = [];
  let currentParentId: number | null = parentCategoryId;

  while (currentParentId) {
    const parent: Category | null = await Category.findByPk(currentParentId, {
      attributes: ['id', 'name', 'parent_id'],
    });
    if (!parent) break;
    ancestors.unshift(parent.name);
    currentParentId = parent.parent_id;
  }

  return [...ancestors, currentName].join(' / ');
}

/**
 * Checks whether `ancestorId` is a strict ancestor of `categoryId` in the
 * category tree.  Used to prevent circular parent assignments.
 *
 * Returns `true` if `ancestorId` IS an ancestor (i.e. the assignment would
 * create a cycle), `false` otherwise.
 */
async function isAncestor(categoryId: number, ancestorId: number): Promise<boolean> {
  let currentId: number | null = categoryId;

  // Safety cap: max 200 levels of nesting to avoid infinite loops on bad data.
  for (let guard = 0; guard < 200; guard++) {
    const cat: Category | null = await Category.findByPk(currentId, {
      attributes: ['id', 'parent_id'],
    });
    if (!cat || cat.parent_id === null) return false;
    if (cat.parent_id === ancestorId) return true;
    currentId = cat.parent_id;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. GET /categories — Paginated flat list
// ---------------------------------------------------------------------------

/**
 * Returns a flat, paginated list of all categories.
 *
 * Query parameters:
 *   - `search`      – full-text search across `name` and `full_path_name`
 *   - `sort`        – `asc` | `desc` (default: `desc`)
 *   - `page`        – page number (default: 1)
 *   - `limit`       – records per page (default: 15, matching Lightspeed UI)
 *   - `depth`       – filter by exact `node_depth`
 *   - `pagination`  – set to `"true"` to receive paginated response envelope
 *
 * Always includes the parent category (name + full path) and a child count.
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;
    const depth = req.query.depth !== undefined ? Number(req.query.depth) : undefined;

    const where: any = {};

    if (search) {
      where[Op.or] = [{ name: { [Op.iLike]: `%${search}%` } }, { full_path_name: { [Op.iLike]: `%${search}%` } }];
    }

    if (depth !== undefined && !isNaN(depth)) {
      where.node_depth = depth;
    }

    const queryOptions: any = {
      where,
      order: [['name', sort as string]],
      include: [
        {
          model: Category,
          as: 'parent',
          attributes: ['id', 'name', 'full_path_name', 'node_depth', 'lightspeed_category_id'],
          required: false,
        },
        {
          model: Category,
          as: 'children',
          attributes: ['id'],
          required: false,
        },
      ],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Category.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: any) => formatCategory(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const categories = await Category.findAll(queryOptions);
    const formattedCategories = categories.map((c: any) => formatCategory(c));
    return res.sendSuccess(res, formattedCategories);
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 2. GET /categories/tree — Full nested tree
// ---------------------------------------------------------------------------

/**
 * Returns the entire category hierarchy as a nested tree, matching the
 * indented display shown in the Lightspeed Category screen.
 *
 * Implementation: fetches ALL categories in a single query ordered by depth
 * then name, then builds the tree in a single O(n) in-memory pass using a
 * Map — no recursive DB queries required.
 *
 * Each node contains all DB fields plus a `children` array.
 */
export const getCategoryTree = async (_req: Request, res: Response) => {
  try {
    const allCategories: any[] = (await Category.findAll({
      order: [
        ['node_depth', 'ASC'],
        ['name', 'ASC'],
      ],
      raw: true,
    })) as any[];

    // O(n) tree build: map → then wire parent→child
    const map = new Map<number, any>();
    const roots: any[] = [];

    for (const cat of allCategories) {
      map.set(cat.id, { ...formatCategory(cat), children: [] });
    }

    for (const cat of allCategories) {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return res.sendSuccess(res, roots);
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 3. GET /categories/:id — Single category detail
// ---------------------------------------------------------------------------

/**
 * Returns a single category by its local DB `id`.
 *
 * Response includes:
 *   - Full category fields (with Lightspeed-mapped names in `lightspeed_sync_info`)
 *   - Parent category (with full path)
 *   - Immediate children list
 *   - Product count assigned to this category
 *   - `lightspeed_sync_info` from `LightspeedEntityMap` (if present)
 */
export const getCategory = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid category ID.');
    }

    const category = await Category.findByPk(id, {
      include: [
        {
          model: Category,
          as: 'parent',
          attributes: ['id', 'name', 'full_path_name', 'node_depth', 'lightspeed_category_id'],
          required: false,
        },
        {
          model: Category,
          as: 'children',
          attributes: ['id', 'name', 'full_path_name', 'node_depth', 'lightspeed_category_id'],
          required: false,
        },
      ],
    });

    if (!category) {
      return res.sendError(res, 'Category not found.');
    }

    // Fetch product count for this category
    const productCount = await Product.count({ where: { category_id: id } });

    // Attempt to retrieve Lightspeed sync metadata from the entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'category',
        lightspeed_id: category.lightspeed_category_id,
      },
    });

    const categoryJson = formatCategory(category);
    if (categoryJson.parent) {
      categoryJson.parent = formatCategory(categoryJson.parent);
    }
    if (categoryJson.children) {
      categoryJson.children = categoryJson.children.map((c: any) => formatCategory(c));
    }

    return res.sendSuccess(res, {
      ...categoryJson,
      product_count: productCount,
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
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 4. POST /categories — Create category locally + log LS payload
// ---------------------------------------------------------------------------

/**
 * Creates a new category in the local database.
 *
 * In READ-ONLY mode no write is made to Lightspeed; instead the exact payload
 * that WOULD be sent to `POST /Category.json` is logged via `logger.info`.
 *
 * Body fields:
 *   - `name`            (required) – Display name of the category
 *   - `parent_id`       (optional) – Local DB id of the parent category
 *   - `full_path_name`  (optional) – If omitted, auto-built from parent chain
 *
 * Auto-generates a `lightspeed_category_id` prefixed with `local_<timestamp>`
 * for locally-created records that have never existed in Lightspeed.
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, parent_id, full_path_name } = req.body as {
      name?: unknown;
      parent_id?: unknown;
      full_path_name?: unknown;
    };

    // --- Validation ---
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.sendError(res, 'Category name is required.');
    }

    const trimmedName = name.trim();

    // --- Resolve parent + derive depth ---
    let nodeDepth = 0;
    let resolvedParentId: number | null = null;
    let parentLightspeedId: string | null = null;

    if (parent_id !== undefined && parent_id !== null && parent_id !== '') {
      const parsedParentId = Number(parent_id);
      if (isNaN(parsedParentId)) {
        return res.sendError(res, 'parent_id must be a valid integer.');
      }

      const parentCat = await Category.findByPk(parsedParentId);
      if (!parentCat) {
        return res.sendError(res, `Parent category with ID ${parsedParentId} not found.`);
      }

      resolvedParentId = parentCat.id;
      nodeDepth = parentCat.node_depth + 1;
      parentLightspeedId = parentCat.lightspeed_category_id;
    }

    // --- Build full_path_name ---
    const computedFullPath =
      full_path_name && typeof full_path_name === 'string' && full_path_name.trim()
        ? full_path_name.trim()
        : await buildFullPathName(resolvedParentId, trimmedName);

    const lsPayload: any = {
      name: trimmedName,
      fullPathName: computedFullPath,
      parentID: parentLightspeedId ? parseInt(parentLightspeedId, 10) || 0 : 0,
    };

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log('[READ-ONLY] Lightspeed Category CREATE payload:\n', JSON.stringify(lsPayload, null, 2));
      logger.info(
        '[READ-ONLY] Lightspeed Category CREATE payload (not sent): POST /Category.json ' +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(
        res,
        {
          message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
          payload: lsPayload,
        },
        200
      );
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    logger.info('Sending Category CREATE request to Lightspeed POS...');
    const response = await LightspeedService.createCategory(lsPayload);
    const responseList = LightspeedService.extractList<any>(response, 'Category');
    const lsCategory = responseList[0] || response.Category;
    if (!lsCategory || !lsCategory.categoryID) {
      throw new Error('Invalid response received from Lightspeed Category API.');
    }

    const lightspeedCategoryId = lsCategory.categoryID.toString();

    // Create locally in database
    const category = await Category.create({
      name: trimmedName,
      parent_id: resolvedParentId,
      full_path_name: lsCategory.fullPathName || computedFullPath,
      lightspeed_category_id: lightspeedCategoryId,
      node_depth: parseInt(lsCategory.nodeDepth || String(nodeDepth), 10) || 0,
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: category.name,
      parent_id: category.parent_id,
      full_path_name: category.full_path_name,
      node_depth: category.node_depth,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'category',
      lightspeed_id: lightspeedCategoryId,
      local_id: category.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(
      res,
      {
        category: formatCategory(category),
        message: 'Category created successfully in Lightspeed and local database.',
      },
      201
    );
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 5. PUT /categories/:id — Update category locally + log LS payload
// ---------------------------------------------------------------------------

/**
 * Updates a category's `name`, `parent_id`, or `full_path_name` in the local
 * database.
 *
 * In READ-ONLY mode the Lightspeed `PUT /Category/<id>.json` payload is logged
 * but never sent.
 *
 * Guards:
 *   - `lightspeed_category_id` is intentionally NOT updatable (sync-protected).
 *   - Circular parent assignments are rejected (a category cannot become a
 *     descendant of itself).
 *
 * `node_depth` and `full_path_name` are auto-recalculated whenever the parent
 * changes.
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid category ID.');
    }

    const category = await Category.findByPk(id);
    if (!category) {
      return res.sendError(res, 'Category not found.');
    }

    const { name, parent_id, full_path_name } = req.body as {
      name?: unknown;
      parent_id?: unknown;
      full_path_name?: unknown;
    };

    // --- Validate name ---
    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return res.sendError(res, 'Category name cannot be empty.');
    }

    const newName = name !== undefined ? (name as string).trim() : category.name;

    // --- Resolve new parent + depth ---
    let newParentId: number | null = category.parent_id;
    let newDepth: number = category.node_depth;

    if (parent_id !== undefined) {
      if (parent_id === null || parent_id === 0 || parent_id === '') {
        // Promote to root
        newParentId = null;
        newDepth = 0;
      } else {
        const parsedParentId = Number(parent_id);
        if (isNaN(parsedParentId)) {
          return res.sendError(res, 'parent_id must be a valid integer or null.');
        }

        // Cannot set self as parent
        if (parsedParentId === id) {
          return res.sendError(res, 'A category cannot be its own parent.');
        }

        // Circular reference guard — the proposed new parent must not be a
        // descendant of the category being updated.
        const wouldCycle = await isAncestor(parsedParentId, id);
        if (wouldCycle) {
          return res.sendError(
            res,
            'Cannot set parent: the selected parent is a descendant of this category (circular reference).'
          );
        }

        const parentCat = await Category.findByPk(parsedParentId);
        if (!parentCat) {
          return res.sendError(res, `Parent category with ID ${parsedParentId} not found.`);
        }

        newParentId = parentCat.id;
        newDepth = parentCat.node_depth + 1;
      }
    }

    // --- Auto-rebuild full_path_name ---
    const newFullPath =
      full_path_name && typeof full_path_name === 'string' && full_path_name.trim()
        ? full_path_name.trim()
        : await buildFullPathName(newParentId, newName);

    // --- Determine Lightspeed parent ID for the payload ---
    let parentLightspeedId: string | null = null;
    if (newParentId !== null) {
      const parentCat = await Category.findByPk(newParentId, {
        attributes: ['lightspeed_category_id'],
      });
      parentLightspeedId = parentCat ? parentCat.lightspeed_category_id : null;
    }

    const lsPayload: any = {
      name: newName,
      fullPathName: newFullPath,
    };
    if (parent_id !== undefined) {
      lsPayload.parentID = parentLightspeedId ? parseInt(parentLightspeedId, 10) || 0 : 0;
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Category UPDATE payload for category ID ${category.lightspeed_category_id}:\n`,
        JSON.stringify(lsPayload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed Category UPDATE payload (not sent): PUT /Category/${category.lightspeed_category_id}.json ` +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
        payload: lsPayload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    let lightspeedCategoryId = category.lightspeed_category_id;
    if (!lightspeedCategoryId || lightspeedCategoryId.startsWith('local_')) {
      logger.info('Category has local ID only. Creating in Lightspeed POS with payload:', lsPayload);
      const response = await LightspeedService.createCategory(lsPayload);
      const responseList = LightspeedService.extractList<any>(response, 'Category');
      const lsCategory = responseList[0] || response.Category;
      if (!lsCategory || !lsCategory.categoryID) {
        throw new Error('Invalid response received from Lightspeed Category API.');
      }
      lightspeedCategoryId = lsCategory.categoryID.toString();
    } else {
      logger.info(`Updating category ${lightspeedCategoryId} in Lightspeed POS with payload:`, lsPayload);
      await LightspeedService.updateCategory(lightspeedCategoryId, lsPayload);
    }

    // Persist locally in Database
    await category.update({
      lightspeed_category_id: lightspeedCategoryId,
      name: newName,
      parent_id: newParentId,
      full_path_name: newFullPath,
      node_depth: newDepth,
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: category.name,
      parent_id: category.parent_id,
      full_path_name: category.full_path_name,
      node_depth: category.node_depth,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'category',
      lightspeed_id: lightspeedCategoryId,
      local_id: category.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(res, {
      category: formatCategory(category),
      message: 'Category updated successfully in Lightspeed and local database.',
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 6. DELETE /categories/:id — Delete locally + log LS payload
// ---------------------------------------------------------------------------

/**
 * Deletes a category from the local database.
 *
 * In READ-ONLY mode the Lightspeed `DELETE /Category/<id>.json` call is logged
 * but never sent.
 *
 * Safety guards (both checked before deletion):
 *   1. Category must have no child categories.
 *   2. Category must have no assigned products — unless `?force=true` is passed,
 *      in which case all products are unassigned (`category_id = null`) first.
 *
 * Returns a `warning` field in the response when products were unassigned.
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid category ID.');
    }

    const category = await Category.findByPk(id);
    if (!category) {
      return res.sendError(res, 'Category not found.');
    }

    // Guard 1 — block deletion if children exist
    const childCount = await Category.count({ where: { parent_id: id } });
    if (childCount > 0) {
      return res.sendError(
        res,
        `Cannot delete category '${category.name}': it has ${childCount} child ` +
          `categor${childCount === 1 ? 'y' : 'ies'}. Remove or reassign children first.`
      );
    }

    // Guard 2 — block deletion if products are assigned (unless ?force=true)
    const productCount = await Product.count({ where: { category_id: id } });
    if (productCount > 0) {
      if (req.query.force !== 'true') {
        return res.sendError(
          res,
          `Cannot delete category '${category.name}': ${productCount} ` +
            `product${productCount === 1 ? ' is' : 's are'} assigned to it. ` +
            `Use ?force=true to unassign products and proceed.`
        );
      }
      // Force mode — detach products before deletion
      await Product.update({ category_id: null }, { where: { category_id: id } });
    }

    const lightspeedCategoryId = category.lightspeed_category_id;

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the delete payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Category DELETE payload for category ID ${lightspeedCategoryId}: DELETE /Category/${lightspeedCategoryId}.json`
      );
      logger.info(
        `[READ-ONLY] Lightspeed Category DELETE payload (not sent): DELETE /Category/${lightspeedCategoryId}.json`
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Delete payload displayed in console (no writes performed to POS or Database).',
        categoryID: lightspeedCategoryId,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with delete in Lightspeed POS and local Database.
    if (lightspeedCategoryId && !lightspeedCategoryId.startsWith('local_')) {
      logger.info(`Deleting category ${lightspeedCategoryId} in Lightspeed POS via DELETE...`);
      await LightspeedService.deleteCategory(lightspeedCategoryId);
    }

    await category.destroy();

    if (lightspeedCategoryId) {
      await LightspeedEntityMap.destroy({
        where: {
          entity_type: 'category',
          lightspeed_id: lightspeedCategoryId,
        },
      });
    }

    return res.sendSuccess(res, {
      message: `Category '${category.name}' deleted successfully from Lightspeed and local database.`,
      ...(productCount > 0
        ? {
            warning: `${productCount} product${productCount === 1 ? ' was' : 's were'} unassigned from this category.`,
          }
        : {}),
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 7. GET /categories/:id/products — Products belonging to a category
// ---------------------------------------------------------------------------

/**
 * Returns the paginated list of products assigned to a specific category.
 *
 * Query parameters:
 *   - `page`        – page number (default: 1)
 *   - `limit`       – records per page (default: 15, matching Lightspeed UI)
 *   - `pagination`  – set to `"true"` to use the paginated response envelope
 *
 * Response always includes the category summary object for UI convenience.
 */
export const getCategoryProducts = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid category ID.');
    }

    const category = await Category.findByPk(id, {
      attributes: ['id', 'name', 'full_path_name', 'node_depth', 'lightspeed_category_id'],
    });
    if (!category) {
      return res.sendError(res, 'Category not found.');
    }

    // 1. Fetch immediate subcategories for this category (for frontend filters)
    const subcategories = await Category.findAll({
      where: { parent_id: id },
      attributes: ['id', 'name', 'lightspeed_category_id'],
      order: [['name', 'ASC']],
    });

    // 2. Parse pagination parameters
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    // 3. Resolve category IDs to query
    // Recursively fetch all descendants (parent + all subcategories)
    const descendantQuery = `
      WITH RECURSIVE category_tree AS (
        SELECT id FROM categories WHERE id = :categoryId
        UNION ALL
        SELECT c.id FROM categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
      )
      SELECT id FROM category_tree;
    `;
    const descendantResults = (await sequelize.query(descendantQuery, {
      replacements: { categoryId: id },
      type: QueryTypes.SELECT,
    })) as Array<{ id: number }>;
    const allowedCategoryIds = descendantResults.map((r) => r.id);

    let categoryIds: number[] = [];
    const subcategoryIdsParam = (req.query.subcategory_ids || req.query.subcategoryIds) as string;

    if (subcategoryIdsParam) {
      // Parse specific subcategories requested
      const requestedIds = subcategoryIdsParam
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => !isNaN(x));

      // Keep only those requested category IDs that are actually descendants of this parent category
      categoryIds = requestedIds.filter((x) => allowedCategoryIds.includes(x));
    } else {
      // Otherwise, return products from the parent category and all its descendants
      categoryIds = allowedCategoryIds;
    }

    // 4. Build Product filters
    const where: any = {
      category_id: {
        [Op.in]: categoryIds,
      },
      archived: req.query.archived === 'true' ? true : req.query.archived === 'false' ? false : false, // Default to active products only
    };

    // Search filter
    const search = (req.query.search as string) || '';
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

    // Brand filter (supports comma-separated list of brand IDs)
    const brandIdParam = (req.query.brand_id || req.query.brandId) as string;
    if (brandIdParam) {
      const brandIds = brandIdParam
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => !isNaN(x));
      if (brandIds.length > 0) {
        where.brand_id = {
          [Op.in]: brandIds,
        };
      }
    }

    // Vendor filter (supports comma-separated list of vendor IDs)
    const vendorIdParam = (req.query.vendor_id || req.query.vendorId) as string;
    if (vendorIdParam) {
      const vendorIds = vendorIdParam
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => !isNaN(x));
      if (vendorIds.length > 0) {
        where.id = {
          [Op.in]: sequelize.literal(`(
            SELECT product_id FROM product_vendors WHERE vendor_id IN (${vendorIds.join(',')})
          )`),
        };
      }
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

    // Sorting parameters
    const sortBy = (req.query.sortBy || req.query.sort || 'id') as string;
    const order = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';

    const baseQuery: any = {
      where,
      order: [[sortBy, order]],
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

    // 5. Execute query and respond
    const formattedCategory = formatCategory(category);
    const formattedSubcategories = subcategories.map((sub) => formatCategory(sub));

    if (req.query.pagination === 'true') {
      const { count, rows } = await Product.findAndCountAll({
        ...baseQuery,
        offset,
        limit,
      });
      return res.sendPaginationSuccess(
        res,
        {
          category: formattedCategory,
          subcategories: formattedSubcategories,
          products: rows,
        },
        count
      );
    }

    const products = await Product.findAll(baseQuery);
    return res.sendSuccess(res, {
      category: formattedCategory,
      subcategories: formattedSubcategories,
      products,
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 8. POST /categories/merge — Merge source category into target
// ---------------------------------------------------------------------------

/**
 * Merges one category (source) into another (target), matching the Merge
 * sidebar feature visible in the Lightspeed Category detail screen.
 *
 * Operations performed locally:
 *   1. All **products** assigned to `source` are moved to `target`.
 *   2. All **child categories** of `source` are re-parented to `target`.
 *   3. `source` category is deleted.
 *
 * In READ-ONLY mode the equivalent Lightspeed actions are logged but never
 * sent.
 *
 * Body:
 *   - `source_id` – local DB id of the category to be consumed
 *   - `target_id` – local DB id of the category that absorbs the source
 */
export const mergeCategoryInto = async (req: Request, res: Response) => {
  try {
    const { source_id, target_id } = req.body as {
      source_id?: unknown;
      target_id?: unknown;
    };

    if (source_id === undefined || source_id === null) {
      return res.sendError(res, 'source_id is required.');
    }
    if (target_id === undefined || target_id === null) {
      return res.sendError(res, 'target_id is required.');
    }

    const parsedSourceId = Number(source_id);
    const parsedTargetId = Number(target_id);

    if (isNaN(parsedSourceId) || isNaN(parsedTargetId)) {
      return res.sendError(res, 'source_id and target_id must be valid integers.');
    }

    if (parsedSourceId === parsedTargetId) {
      return res.sendError(res, 'source_id and target_id must be different categories.');
    }

    const [sourceCategory, targetCategory] = await Promise.all([
      Category.findByPk(parsedSourceId),
      Category.findByPk(parsedTargetId),
    ]);

    if (!sourceCategory) {
      return res.sendError(res, `Source category with ID ${parsedSourceId} not found.`);
    }
    if (!targetCategory) {
      return res.sendError(res, `Target category with ID ${parsedTargetId} not found.`);
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Category MERGE payload: sourceID=${sourceCategory.lightspeed_category_id}, targetID=${targetCategory.lightspeed_category_id}`
      );
      logger.info(
        '[READ-ONLY] Lightspeed Category MERGE payload (not sent): ' +
          JSON.stringify({
            action: 'merge',
            sourceID: sourceCategory.lightspeed_category_id,
            targetID: targetCategory.lightspeed_category_id,
            note: 'All products and child categories from source would be moved to target, then source deleted.',
          })
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Merge payload displayed in console (no writes performed to POS or Database).',
        payload: {
          action: 'merge',
          sourceID: sourceCategory.lightspeed_category_id,
          targetID: targetCategory.lightspeed_category_id,
        },
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // Step 1 — Move all products from source → target
    const movedProducts = await Product.update(
      { category_id: parsedTargetId },
      { where: { category_id: parsedSourceId } }
    );

    // Step 2 — Re-parent all children of source → target
    const movedChildren = await Category.update(
      { parent_id: parsedTargetId },
      { where: { parent_id: parsedSourceId } }
    );

    // Step 3 — If source category exists in Lightspeed POS, delete it
    const sourceLsId = sourceCategory.lightspeed_category_id;
    if (sourceLsId && !sourceLsId.startsWith('local_')) {
      logger.info(`Deleting merged source category ${sourceLsId} in Lightspeed POS via DELETE...`);
      await LightspeedService.deleteCategory(sourceLsId);
    }

    // Step 4 — Delete source category locally
    await sourceCategory.destroy();

    if (sourceLsId) {
      await LightspeedEntityMap.destroy({
        where: {
          entity_type: 'category',
          lightspeed_id: sourceLsId,
        },
      });
    }

    return res.sendSuccess(res, {
      message: `Category '${sourceCategory.name}' merged into '${targetCategory.name}' successfully in Lightspeed and local database.`,
      summary: {
        products_moved: movedProducts[0],
        children_re_parented: movedChildren[0],
        source_deleted: sourceCategory.name,
        merged_into: targetCategory.name,
      },
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 9. GET /categories/featured — Top-level parent categories with item count
// ---------------------------------------------------------------------------

/**
 * Returns a list of all top-level (parent) categories with their name, ID,
 * and recursive count of products assigned to them and their subcategories.
 *
 * Query parameters:
 *   - `hideEmpty` – if "true", filters out categories that have 0 products (default: false)
 */
export const getFeaturedCategories = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = req.query.limit !== undefined ? Math.max(1, Number(req.query.limit)) : undefined;
    const offset = limit !== undefined ? (page - 1) * limit : 0;

    let query = `
      WITH RECURSIVE category_tree AS (
        -- Start from every category
        SELECT
          c.id,
          c.parent_id,
          c.id AS root_id
        FROM categories c
        WHERE c.parent_id IS NULL

        UNION ALL

        SELECT
          child.id,
          child.parent_id,
          ct.root_id
        FROM categories child
        JOIN category_tree ct
          ON child.parent_id = ct.id
      ),
      featured_categories AS (
        SELECT
          root.id,
          root.name,
          root.lightspeed_category_id,
          COUNT(p.id)::int AS product_count,
          COUNT(*) OVER()::int AS total_count
        FROM products p
        JOIN category_tree ct
          ON p.category_id = ct.id
        JOIN categories root
          ON root.id = ct.root_id
        GROUP BY root.id, root.name, root.lightspeed_category_id
        HAVING COUNT(p.id) > 1
      )
      SELECT *
      FROM featured_categories
      ORDER BY product_count DESC, name ASC
    `;

    const replacements: any = {};

    if (limit !== undefined) {
      query += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = limit;
      replacements.offset = offset;
    }

    const results = (await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    })) as any[];

    const totalCount = results.length > 0 ? results[0].total_count : 0;

    // Format results to remove total_count from each item's payload
    const formattedCategories = results.map(({ total_count: _total_count, ...rest }) => rest);

    if (req.query.pagination === 'true' || limit !== undefined) {
      return res.sendPaginationSuccess(res, formattedCategories, totalCount);
    }

    return res.sendSuccess(res, formattedCategories);
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to retrieve featured categories.');
  }
};

// ---------------------------------------------------------------------------
// Default export (named exports above are the canonical interface)
// ---------------------------------------------------------------------------

export default {
  getCategories,
  getCategoryTree,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryProducts,
  mergeCategoryInto,
  getFeaturedCategories,
};
