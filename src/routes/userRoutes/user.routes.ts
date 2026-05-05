import { Router } from 'express';
import * as userController from '../../controllers/userControllers/user.controller';

const router = Router();

router.post('/create-user', userController.createUserController);
router.patch('/update-user/:userId', userController.updateUserController);
router.patch(
  '/update-user/:userId/privileges',
  userController.updateUserPrivilegeMappingsController,
);
router.get("/vendor/:vendorId", userController.getUsersByVendorController);
router.get(
  "/vendor/:vendorId/privilege-masters",
  userController.getPrivilegeMastersByVendorController,
);

router.post("/reset-password-admin", userController.masterResetPasswordController);

export default router;
