import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { getHandler, updateHandler } from "./company.controller";

export const companyRouter = Router();
companyRouter.use(authMiddleware);
companyRouter.get("/", getHandler);         // All authenticated can read company name/logo
companyRouter.patch("/", requireAdmin, updateHandler);
