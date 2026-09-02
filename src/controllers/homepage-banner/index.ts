import { Request, Response } from 'express';
import { Op, FindOptions } from 'sequelize';
import { HomepageBanner } from '@/database/models';
import logger from '@/utils/logger';
import config from '@/config';
import fs from 'fs';
import path from 'path';

// Helper to extract file name and delete it
const deleteImageFile = (imageUrl: string) => {
  if (!imageUrl) return;
  const parts = imageUrl.split('/images/');
  if (parts.length > 1) {
    const filename = parts[1];
    const filePath = path.join(__dirname, '../../../uploads', filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.info(`Deleted banner image file: ${filename}`);
      } catch (err) {
        logger.error(`Failed to delete banner image file: ${filePath}`, err);
      }
    }
  }
};

// 1. GET /homepage-banners - Public endpoint (active only)
export const getBanners = async (_req: Request, res: Response) => {
  try {
    const banners = await HomepageBanner.findAll({
      where: { is_active: true },
      order: [
        ['sort_order', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    });
    return res.sendSuccess(res, banners);
  } catch (error: any) {
    logger.error('Error fetching homepage banners:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 2. GET /homepage-banners/admin - Admin endpoint (all, searchable, paginated)
export const getAllBanners = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const queryOptions: FindOptions = {
      where,
      order: [
        ['sort_order', 'ASC'],
        ['createdAt', sort],
      ],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await HomepageBanner.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      return res.sendPaginationSuccess(res, rows, count);
    }

    const banners = await HomepageBanner.findAll(queryOptions);
    return res.sendSuccess(res, banners);
  } catch (error: any) {
    logger.error('Error fetching all homepage banners:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 3. GET /homepage-banners/:id - Get single banner
export const getBanner = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid banner ID.');
    }

    const banner = await HomepageBanner.findByPk(id);
    if (!banner) {
      return res.sendError(res, 'Banner not found.');
    }

    return res.sendSuccess(res, banner);
  } catch (error: any) {
    logger.error('Error fetching homepage banner detail:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 4. POST /homepage-banners - Create banner (Admin only)
export const createBanner = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      color,
      link_url,
      button_text,
      button_color,
      button_text_color,
      is_active,
      sort_order,
    } = req.body;

    const file = req.file;
    let imageUrl = null;

    if (file) {
      const dir = path.join(__dirname, '../../../uploads');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const uniqueFilename = `${Date.now()}_banner_${path.basename(file.originalname)}`;
      const filePath = path.join(dir, uniqueFilename);
      fs.writeFileSync(filePath, file.buffer);
      imageUrl = `${config.app.prefix}/${config.app.version}/lightspeed/images/${uniqueFilename}`;
    }

    const banner = await HomepageBanner.create({
      title,
      description,
      image_url: imageUrl,
      color,
      link_url,
      button_text,
      button_color,
      button_text_color,
      is_active: is_active !== undefined ? is_active : true,
      sort_order: sort_order !== undefined ? sort_order : 0,
    });

    return res.sendSuccess(res, banner, 201);
  } catch (error: any) {
    logger.error('Error creating homepage banner:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 5. PUT /homepage-banners/:id - Update banner (Admin only)
export const updateBanner = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid banner ID.');
    }

    const banner = await HomepageBanner.findByPk(id);
    if (!banner) {
      return res.sendError(res, 'Banner not found.');
    }

    const {
      title,
      description,
      color,
      link_url,
      button_text,
      button_color,
      button_text_color,
      is_active,
      sort_order,
    } = req.body;

    const file = req.file;
    let imageUrl = banner.image_url;
    let oldImageUrlToDelete = null;

    if (file) {
      const dir = path.join(__dirname, '../../../uploads');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const uniqueFilename = `${Date.now()}_banner_${path.basename(file.originalname)}`;
      const filePath = path.join(dir, uniqueFilename);
      fs.writeFileSync(filePath, file.buffer);

      oldImageUrlToDelete = banner.image_url;
      imageUrl = `${config.app.prefix}/${config.app.version}/lightspeed/images/${uniqueFilename}`;
    }

    await banner.update({
      title: title !== undefined ? title : banner.title,
      description: description !== undefined ? description : banner.description,
      image_url: imageUrl,
      color: color !== undefined ? color : banner.color,
      link_url: link_url !== undefined ? link_url : banner.link_url,
      button_text: button_text !== undefined ? button_text : banner.button_text,
      button_color: button_color !== undefined ? button_color : banner.button_color,
      button_text_color: button_text_color !== undefined ? button_text_color : banner.button_text_color,
      is_active: is_active !== undefined ? is_active : banner.is_active,
      sort_order: sort_order !== undefined ? sort_order : banner.sort_order,
    });

    // Cleanup old image file if replaced successfully
    if (oldImageUrlToDelete) {
      deleteImageFile(oldImageUrlToDelete);
    }

    return res.sendSuccess(res, banner);
  } catch (error: any) {
    logger.error('Error updating homepage banner:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// 6. DELETE /homepage-banners/:id - Delete banner (Admin only)
export const deleteBanner = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid banner ID.');
    }

    const banner = await HomepageBanner.findByPk(id);
    if (!banner) {
      return res.sendError(res, 'Banner not found.');
    }

    // Soft delete the banner
    await banner.destroy();

    return res.sendSuccess(res, { message: 'Banner deleted successfully.' });
  } catch (error: any) {
    logger.error('Error deleting homepage banner:', error);
    return res.sendError(res, error.message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

export default {
  getBanners,
  getAllBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
};
