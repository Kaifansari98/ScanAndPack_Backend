import { Router } from 'express';
import * as userController from '../../controllers/userControllers/user.controller';

const router = Router();

router.post('/create-user', userController.createUserController);

export default router;