import { Router } from 'express';
import { createBox } from '../../controllers/boxControllers/box.controller';

const router = Router();

router.post('/', createBox);

export default router;