import { Router } from 'express';
import multer from 'multer';
import {
  getBanners,
  getAllBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
} from '@/controllers/homepage-banner';
import { homepageBannerValidator } from '@/validators/homepage-banner';
import { validate } from '@/middleware/validator';
// import accessControl from '@/middleware/access-control';
// import accessAdmin from '@/middleware/auth-access';

const router = Router();

// Configure in-memory multer for image upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
});

// 1. Retrieve active banners (Public)
router.get('/', getBanners);

// Admin-only routes
// router.use(accessControl);
// router.use(accessAdmin);

// 2. Retrieve all banners (Admin panel list)
router.get('/admin', getAllBanners);

// 3. Retrieve single banner by ID
router.get('/:id', getBanner);

// 4. Create a banner
router.post('/', upload.single('file'), validate(homepageBannerValidator), createBanner);

// 5. Update a banner
router.put('/:id', upload.single('file'), validate(homepageBannerValidator), updateBanner);

// 6. Delete a banner
router.delete('/:id', deleteBanner);

export default router;
