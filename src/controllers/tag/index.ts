import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { Tag, LightspeedEntityMap, ProductTag } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import logger from '@/utils/logger';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Tag instance to include all the exact fields that are there in
 * Lightspeed (both camelCase and original database keys) so that the admin
 * panel receives a payload perfectly synced with the Lightspeed Tag schema.
 */
function formatTag(tagObj: any) {
  if (!tagObj) return null;
  const json = tagObj.toJSON ? tagObj.toJSON() : tagObj;

  return {
    ...json,
    // Exact Lightspeed API fields
    tagID: parseInt(json.lightspeed_tag_id, 10) || 0,
    name: json.name,
    archived: !!json.archived,
    createTime: json.createdAt || null,
    timeStamp: json.updatedAt || null,
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

    const lsPayload = {
      name: trimmedName,
    };

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log('[READ-ONLY] Lightspeed Tag CREATE payload:\n', JSON.stringify(lsPayload, null, 2));
      logger.info(
        '[READ-ONLY] Lightspeed Tag CREATE payload (not sent): POST /Tag.json ' +
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
    logger.info('Sending Tag CREATE request to Lightspeed POS...');
    const response = await LightspeedService.createTag(lsPayload);
    const responseList = LightspeedService.extractList<any>(response, 'Tag');
    const lsTag = responseList[0] || response.Tag;
    if (!lsTag || !lsTag.tagID) {
      throw new Error('Invalid response received from Lightspeed Tag API.');
    }

    const lightspeedTagId = lsTag.tagID.toString();

    // Create locally in database
    const tag = await Tag.create({
      name: trimmedName,
      lightspeed_tag_id: lightspeedTagId,
      archived: archived === true || archived === 'true',
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: tag.name,
      archived: tag.archived,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'tag',
      lightspeed_id: lightspeedTagId,
      local_id: tag.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(
      res,
      { tag: formatTag(tag), message: 'Tag created successfully in Lightspeed and local database.' },
      201
    );
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to create the tag. Please try again later.');
  }
};

// ---------------------------------------------------------------------------
// 4. PUT /tag/:id — Update tag (maps to PUT /Tag/{tagID}.json)
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
      name: newName,
    };

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Tag UPDATE payload for tag ID ${tag.lightspeed_tag_id}:\n`,
        JSON.stringify(lsPayload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed Tag UPDATE payload (not sent): PUT /Tag/${tag.lightspeed_tag_id}.json ` +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
        payload: lsPayload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    let lightspeedTagId = tag.lightspeed_tag_id;
    if (!lightspeedTagId || lightspeedTagId.startsWith('local_')) {
      logger.info('Tag has local ID only. Creating in Lightspeed POS with payload:', lsPayload);
      const response = await LightspeedService.createTag(lsPayload);
      const responseList = LightspeedService.extractList<any>(response, 'Tag');
      const lsTag = responseList[0] || response.Tag;
      if (!lsTag || !lsTag.tagID) {
        throw new Error('Invalid response received from Lightspeed Tag API.');
      }
      lightspeedTagId = lsTag.tagID.toString();
    } else {
      logger.info(`Updating tag ${lightspeedTagId} in Lightspeed POS with payload:`, lsPayload);
      await LightspeedService.updateTag(lightspeedTagId, lsPayload);
    }

    // Persist locally in Database
    await tag.update({
      lightspeed_tag_id: lightspeedTagId,
      name: newName,
      archived: newArchived,
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: tag.name,
      archived: tag.archived,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'tag',
      lightspeed_id: lightspeedTagId,
      local_id: tag.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(res, {
      tag: formatTag(tag),
      message: 'Tag updated successfully in Lightspeed and local database.',
    });
  } catch (error: unknown) {
    logger.error(error);
    return res.sendError(res, (error as Error).message || 'Not able to update the tag. Please try again later.');
  }
};

// ---------------------------------------------------------------------------
// 5. DELETE /tag/:id — Delete tag (maps to DELETE /Tag/{tagID}.json)
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
      // Force mode — detach products from tag
      await ProductTag.destroy({ where: { tag_id: id } });
    }

    const lightspeedTagId = tag.lightspeed_tag_id;

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the delete payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Tag DELETE payload for tag ID ${lightspeedTagId}: DELETE /Tag/${lightspeedTagId}.json`
      );
      logger.info(
        `[READ-ONLY] Lightspeed Tag DELETE payload (not sent): DELETE /Tag/${lightspeedTagId}.json`
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Delete payload displayed in console (no writes performed to POS or Database).',
        tagID: lightspeedTagId,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with delete in Lightspeed POS and local Database.
    if (lightspeedTagId && !lightspeedTagId.startsWith('local_')) {
      logger.info(`Deleting tag ${lightspeedTagId} in Lightspeed POS via DELETE...`);
      await LightspeedService.deleteTag(lightspeedTagId);
    }

    await tag.destroy();

    if (lightspeedTagId) {
      await LightspeedEntityMap.destroy({
        where: {
          entity_type: 'tag',
          lightspeed_id: lightspeedTagId,
        },
      });
    }

    return res.sendSuccess(res, {
      message: `Tag '${tag.name}' deleted successfully from Lightspeed and local database.`,
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
