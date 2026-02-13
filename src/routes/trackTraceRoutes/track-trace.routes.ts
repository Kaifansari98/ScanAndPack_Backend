import { Router } from 'express';
import { 

    getAllProjectsTrackTrace,    
} from '../../controllers/trackTraceController/project.controller';

import { 

    getAllMachines,
    getKPIS,
    getRealTimeItemTracking,
    getMachineStatus,
    getHourlyProduction,
    getMachineUtilization,
    getTopPerformer,
    getProjectProgress,
    getBottleNeck    ,
    get_filter_track_trace,
    getCutListMachine,
    assignMachine,
    createQR
} from '../../controllers/trackTraceController/trackTrace.controller';


import { 
    scan_item
} from '../../controllers/trackTraceController/trackTrace.controller';

const router = Router();

router.get('/project/:vendor_id', getAllProjectsTrackTrace);
router.get('/get-filter-track-trace/:vendor_id', get_filter_track_trace);

router.post('/scan/item', scan_item);

router.get('/machines/:vendor_id/:user_id', getAllMachines);

router.get('/kpis/:vendor_id', getKPIS);

router.get('/items/:vendor_id', getRealTimeItemTracking);
router.get('/machine-status/:vendor_id', getMachineStatus);
router.get('/hourly-production/:vendor_id', getHourlyProduction);
router.get('/machine-utilization/:vendor_id', getMachineUtilization);
router.get('/top-performer/:vendor_id', getTopPerformer);
router.get('/project-progress/:vendor_id', getProjectProgress);
router.get('/bottle-neck/:vendor_id', getBottleNeck);


router.get('/cut-list-machine/:vendor_id/:project_id', getCutListMachine);

router.post('/assign-machine', assignMachine);

router.post('/create-qr-code', createQR);






export default router;