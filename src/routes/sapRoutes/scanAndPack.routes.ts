import { Router } from 'express';
import { addScanAndPackItem, getScanAndPackItemsByFields } from '../../controllers/sapControllers/scanAndPack.controller';
import { createScanItem } from '../../controllers/sapControllers/scanItem.controller';

const router = Router();

router.post('/', createScanItem);
router.post('/scan-and-pack/add', addScanAndPackItem);
router.post('/by-fields', getScanAndPackItemsByFields);

export default router;