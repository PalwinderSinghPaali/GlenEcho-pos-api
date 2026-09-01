import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { Tag, LightspeedEntityMap, ProductTag } from '@/database/models';
import logger from '@/utils/logger';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Tag instance to include all the exact fields that are there in
 * Lightspeed (both camelCase and original database keys) so that the admin
 * panel receives a payload perfectly synced with the Lightspeed Tag schema.
 */
function formatTag(tagObj: Tag) {
  if (!tagObj) return null;
  const json = tagObj.toJSON();

  return {
    ...json,
    // Exact Lightspeed API fields
    tagID: parseInt(tagObj.lightspeed_tag_id, 10) || 0,
    name: tagObj.name,
    archived: !!tagObj.archived,
    createTime: tagObj.createdAt || null,
    timeStamp: tagObj.updatedAt || null,
  };
}

// ---------------------------------------------------------------------------
// 1. GET /tag — Paginated flat list (maps to GET /Tag.json)
// ---------------------------------------------------------------------------

export const getTags = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const archivedParam = req.query.archived as string;
    const archived = archivedParam === 'true' ? true : archivedParam === 'false' ? false : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_tag_id: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (archived !== undefined) {
      where.archived = archived;
    }

    const queryOptions: FindOptions = {
      where,
      order: [['name', sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Tag.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: Tag) => formatTag(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const tags = await Tag.findAll(queryOptions);
    const formattedTags = tags.map((t: Tag) => formatTag(t));
    return res.sendSuccess(res, formattedTags);
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to fetch the tags. Please try again later.');
  }
};

// ---------------------------------------------------------------------------
// 2. GET /tag/:id — Single tag detail (maps to GET /Tag/{tagID}.json)
// ---------------------------------------------------------------------------

export const getTag = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid tag ID.');
    }

    const tag = await Tag.findByPk(id);
    if (!tag) {
      return res.sendError(res, 'Tag not found.');
    }

    // Retrieve Lightspeed sync metadata from the entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'tag',
        lightspeed_id: tag.lightspeed_tag_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatTag(tag),
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
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to fetch the tag. Please try again later.');
  }
};

// ---------------------------------------------------------------------------
// 3. POST /tag — Create tag locally (maps to POST /Tag.json)
// ---------------------------------------------------------------------------

export const createTag = async (req: Request, res: Response) => {
  try {
    const { name, archived } = req.body as { name?: unknown; archived?: unknown };

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.sendError(res, 'Tag name is required.');
    }

    const trimmedName = name.trim();

    // Check duplicate local name
    const existing = await Tag.findOne({ where: { name: trimmedName } });
    if (existing) {
      return res.sendError(res, `Tag with name '${trimmedName}' already exists.`);
    }

    // Generate local-only Lightspeed ID
    const localLsId = `local_${Date.now()}`;

    const lsPayload = {
      name: trimmedName,
      archived: archived === true || archived === 'true' ? 'true' : 'false',
    };

    // Log the Lightspeed payload that would be sent (READ-ONLY mode)
    logger.info(
      '[READ-ONLY] Lightspeed Tag CREATE payload (not sent): POST /Tag.json ' +
        JSON.stringify(lsPayload)
    );

    // Create locally
    const tag = await Tag.create({
      name: trimmedName,
      lightspeed_tag_id: localLsId,
      archived: archived === true || archived === 'true',
    });

    return res.sendSuccess(
      res,
      { tag: formatTag(tag), message: 'Tag created successfully (local only — READ-ONLY mode active).' },
      201
    );
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to create the tag. Please try again later.');
  }
};

// ---------------------------------------------------------------------------
// 4. PUT /tag/:id — Update tag locally (maps to PUT /Tag/{tagID}.json)
// ---------------------------------------------------------------------------

export const updateTag = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid tag ID.');
    }

    const tag = await Tag.findByPk(id);
    if (!tag) {
      return res.sendError(res, 'Tag not found.');
    }

    const { name, archived } = req.body as { name?: unknown; archived?: unknown };

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return res.sendError(res, 'Tag name cannot be empty.');
    }

    const newName = name !== undefined ? (name as string).trim() : tag.name;
    const newArchived = archived !== undefined ? (archived === true || archived === 'true') : tag.archived;

    // Check duplicate local name if changed
    if (name !== undefined && newName !== tag.name) {
      const existing = await Tag.findOne({ where: { name: newName } });
      if (existing) {
        return res.sendError(res, `Another tag with name '${newName}' already exists.`);
      }
    }

    const lsPayload = {
      tagID: tag.lightspeed_tag_id,
      name: newName,
      archived: newArchived ? 'true' : 'false',
    };

    // Log the Lightspeed payload that would be sent (READ-ONLY mode)
    logger.info(
      '[READ-ONLY] Lightspeed Tag UPDATE payload (not sent): PUT /Tag/' +
        tag.lightspeed_tag_id +
        '.json ' +
        JSON.stringify(lsPayload)
    );

    // Persist locally
    await tag.update({
      name: newName,
      archived: newArchived,
    });

    return res.sendSuccess(res, {
      tag: formatTag(tag),
      message: 'Tag updated successfully (local only — READ-ONLY mode active).',
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to update the tag. Please try again later.');
  }
};

// ---------------------------------------------------------------------------
// 5. DELETE /tag/:id — Delete tag locally (maps to DELETE /Tag/{tagID}.json)
// ---------------------------------------------------------------------------

export const deleteTag = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid tag ID.');
    }

    const tag = await Tag.findByPk(id);
    if (!tag) {
      return res.sendError(res, 'Tag not found.');
    }

    // Check if products are associated with this tag
    const productCount = await ProductTag.count({ where: { tag_id: id } });
    if (productCount > 0) {
      if (req.query.force !== 'true') {
        return res.sendError(
          res,
          `Cannot delete tag '${tag.name}': ${productCount} ` +
            `product${productCount === 1 ? ' is' : 's are'} associated with it. ` +
            `Use ?force=true to disassociate products and proceed.`
        );
      }
      // Force mode — detach products from tag (optional since DB onDelete CASCADE handles it,
      // but doing it explicitly guarantees clean state before tag is destroyed)
      await ProductTag.destroy({ where: { tag_id: id } });
    }

    const lightspeedTagId = tag.lightspeed_tag_id;

    // Log the Lightspeed payload that would be sent (READ-ONLY mode)
    logger.info(
      `[READ-ONLY] Lightspeed Tag DELETE payload (not sent): DELETE /Tag/${lightspeedTagId}.json`
    );

    await tag.destroy();

    return res.sendSuccess(res, {
      message: `Tag '${tag.name}' deleted successfully (local only — READ-ONLY mode active).`,
      ...(productCount > 0
        ? {
            warning: `${productCount} product association${productCount === 1 ? ' was' : 's were'} removed.`,
          }
        : {}),
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to delete the tag. Please try again later.');
  }
};

export default {
  getTags,
  getTag,
  createTag,
  updateTag,
  deleteTag,
};
