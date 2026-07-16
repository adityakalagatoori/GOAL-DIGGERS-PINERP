import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import {
  listRolesHandler, getRoleHandler, createRoleHandler, updateRoleHandler, deleteRoleHandler,
} from "./roles.controller";

export const rolesRouter = Router();
rolesRouter.use(authMiddleware);
rolesRouter.get("/", listRolesHandler);              // Any authenticated user can read roles (needed to populate dropdowns)
rolesRouter.get("/:id", getRoleHandler);
rolesRouter.post("/", requireAdmin, createRoleHandler);
rolesRouter.patch("/:id", requireAdmin, updateRoleHandler);
rolesRouter.delete("/:id", requireAdmin, deleteRoleHandler);
