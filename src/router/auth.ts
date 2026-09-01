import { Router } from 'express';
import { login, logout, refreshAccess, register, forgotPassword, resetPassword, updateProfile } from '../controllers/auth';
import { validate } from '../middleware/validator';
import { loginValidator, refreshValidator, registerValidation, forgotPasswordValidator, resetPasswordValidator, updateProfileValidator } from '../validators/auth';
import accessControl from '../middleware/access-control';
// import accessAdmin from '../middleware/auth-access';

const router = Router();

router.post('/login', validate(loginValidator), login);

// router.use(accessControl);
// router.use(accessAdmin);
router.post('/register', validate(registerValidation), register);
router.post('/refresh-access', validate(refreshValidator), refreshAccess);
router.post('/logout', logout);

router.post('/forgot-password', validate(forgotPasswordValidator), forgotPassword);
router.post('/reset-password', validate(resetPasswordValidator), resetPassword);

router.put('/profile', accessControl, validate(updateProfileValidator), updateProfile);

export default router;
