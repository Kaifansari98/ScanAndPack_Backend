import { Router } from 'express';
import * as userController from '../../controllers/userControllers/user.controller';

const router = Router();

router.post('/create-user', userController.createUserController);

router.post("/reset-password-admin", userController.masterResetPasswordController);

export default router;