import { Router } from 'express';
import { addScanAndPackItem, getScanAndPackItemsByFields, deleteScanAndPackItem } from '../../controllers/sapControllers/scanAndPack.controller';

const router = Router();

router.post('/scan-and-pack/add', addScanAndPackItem);
router.delete('/scan-and-pack/delete/:id', deleteScanAndPackItem);
router.post('/by-fields', getScanAndPackItemsByFields);

export default router;
