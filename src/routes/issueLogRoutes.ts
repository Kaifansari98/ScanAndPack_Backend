/* ------------------------- Issue Type Master Routes ------------------------- */

import { Router } from "express";
import {
  createIssueType,
  getIssueTypes,
  deleteIssueType,
} from "../controllers/leadModuleControllers/issueType.controller";

const issueLogRoutes = Router();

// POST → Create Issue Type
// @route POST /installation/issue-type/create
issueLogRoutes.post("/issue-type/create", createIssueType);

// GET → All Issue Types (Vendor Wise)
// @route GET /installation/issue-type/vendor/:vendor_id
issueLogRoutes.get("/issue-type/vendor/:vendor_id", getIssueTypes);

// DELETE → Delete Issue Type by ID
// @route DELETE /installation/issue-type/:id
issueLogRoutes.delete("/issue-type/:id", deleteIssueType);

export default issueLogRoutes;