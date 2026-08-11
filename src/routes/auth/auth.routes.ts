import { Router } from 'express';
import { checkUserStatus, login, changePassword, createVendorLoginLaunch, exchangeVendorLogin, logoutActivity, logoutAllByVendor, validateSession } from '../../controllers/auth/auth.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/vendor-login-launch/:vendor_id', verifyToken, createVendorLoginLaunch);
router.post('/vendor-login-exchange', exchangeVendorLogin);
router.get('/user-status/:user_id', checkUserStatus);
router.post('/change-password', verifyToken, changePassword);
router.post('/logout', verifyToken, logoutActivity);
router.post('/logout-all/vendor/:vendor_id', verifyToken, logoutAllByVendor);
router.get('/session', verifyToken, validateSession);

export default router;
