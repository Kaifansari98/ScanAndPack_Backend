import { Router } from 'express';
import { login } from '../../controllers/auth/auth.controller';

const router = Router();

router.post('/login', login);

export default router;