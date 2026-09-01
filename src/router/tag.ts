import { Router } from 'express';
import {
  getTags,
  getTag,
  createTag,
  updateTag,
  deleteTag,
} from '@/controllers/tag';
import accessControl from '@/middleware/access-control';
// import accessAdmin from '../middleware/auth-access';

const router = Router();

router.use(accessControl);
// router.use(accessAdmin);

// Retrieve all tags (flat, paginated, searchable)
router.get('/', getTags);

// Retrieve a single tag's details (sync info)
router.get('/:id', getTag);

// Create a new tag locally (logs Lightspeed payload)
router.post('/', createTag);

// Update a tag locally (logs Lightspeed payload)
router.put('/:id', updateTag);

// Delete a tag locally (logs Lightspeed payload)
router.delete('/:id', deleteTag);

export default router;
