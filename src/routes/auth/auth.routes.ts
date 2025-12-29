import { Router } from 'express';
import { checkUserStatus, login } from '../../controllers/auth/auth.controller';

const router = Router();

router.post('/login', login);
router.get('/user-status/:user_id', checkUserStatus);

export default router;
