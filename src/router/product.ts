import { Router } from 'express';
import multer from 'multer';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  uploadProductsCSV,
  searchProducts,
} from '@/controllers/product';

const router = Router();

// Configure in-memory multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB file size limit
  },
});

/**
 * Custom middleware to handle bulk product imports with optional images.
 * Uses `upload.any()` to parse both the CSV file (key 'file' or ending in .csv)
 * and all image files in a single request.
 */
const handleBulkImportUpload = (req: any, res: any, next: any) => {
  upload.any()(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: { code: 'ERR_FILE_UPLOAD_FAILED', message: err.message },
      });
    }

    // Identify the CSV file and set it on req.file
    if (req.files && Array.isArray(req.files)) {
      const csvFile = req.files.find(
        (f: any) => f.fieldname === 'file' || f.originalname.toLowerCase().endsWith('.csv')
      );
      if (csvFile) {
        req.file = csvFile;
      }
    }
    next();
  });
};

// 1. Retrieve all products (flat, paginated, searchable, filterable)
router.get('/', getProducts);

// 2. Advanced search with relevance scoring, filters and facets (Algolia/Elastic style)
router.get('/search', searchProducts);

// 3. Bulk import products via CSV
router.post('/import-csv', handleBulkImportUpload, uploadProductsCSV);

// 4. Retrieve a single product's detail
router.get('/:id', getProduct);

// 4. Create a product locally
router.post('/', createProduct);

// 5. Update a product locally
router.put('/:id', updateProduct);

// 6. Delete a product locally
router.delete('/:id', deleteProduct);

// 7. Upload images for a product
router.post('/:id/images', upload.array('images', 20), uploadProductImages);

export default router;
