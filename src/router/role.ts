import { Router } from 'express';
import { createUserRole, getUserRoles, getUserRole, updateUserRole, deleteUserRole, checkRoleExists } from '@/controllers/roles';
// import accessControl from '../middleware/access-control';
// import accessAdmin from '../middleware/auth-access';

const router = Router();

router.post('/create', createUserRole);
router.get("/get-user-roles", getUserRoles);
router.get("/get-user-role", getUserRole);
router.put("/update", updateUserRole);
router.delete("/delete", deleteUserRole);
router.post("/check-role", checkRoleExists);

// router.use(accessControl);
// router.use(accessAdmin);

export default router;