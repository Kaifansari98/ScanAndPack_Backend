import { Router } from 'express';
import { createScanItem } from '../../controllers/boxControllers/scanItem.controller';

const router = Router();

router.post('/', createScanItem);

export default router;