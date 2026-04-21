import { Router } from 'express';
import { checkUserStatus, login, changePassword, logoutActivity, logoutAllByVendor, validateSession } from '../../controllers/auth/auth.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/user-status/:user_id', checkUserStatus);
router.post('/change-password', verifyToken, changePassword);
router.post('/logout', verifyToken, logoutActivity);
router.post('/logout-all/vendor/:vendor_id', verifyToken, logoutAllByVendor);
router.get('/session', verifyToken, validateSession);

export default router;
