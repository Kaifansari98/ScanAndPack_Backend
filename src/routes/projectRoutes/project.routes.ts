import { Router } from 'express';
import { createProject,
    createProjectDetails, 
    createProjectItem, 
    getAllProjects,
    getAllProjectDetails,
    getAllProjectItems,
    getProjectById,
    getProjectDetailsById,
    getProjectItemById, 
    getProjectsByVendorId,
    getProjectItemByFields,
    getProjectItemCounts
} from '../../controllers/projectControllers/project.controller';

const router = Router();

router.post('/', createProject);
router.post('/details', createProjectDetails);
router.post('/items', createProjectItem);

router.get('/', getAllProjects);
router.get('/details', getAllProjectDetails);
router.get('/items', getAllProjectItems);

router.get("/vendor/:vendorId", getProjectsByVendorId);

router.post('/items-by-fields', getProjectItemByFields);

router.get('/item-counts', getProjectItemCounts);

router.get('/:id', getProjectById);
router.get('/details/:id', getProjectDetailsById);
router.get('/items/:id', getProjectItemById);

export default router;