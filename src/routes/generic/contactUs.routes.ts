import { Router } from "express";
import { ContactUsController } from "../../controllers/generic/contactUs.controller";

const contactUsRoutes = Router();

// POST /api/public/contact
contactUsRoutes.post("/contact", ContactUsController.submitContactUs);

export default contactUsRoutes;
