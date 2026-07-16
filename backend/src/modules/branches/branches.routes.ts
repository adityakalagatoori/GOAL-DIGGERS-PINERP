import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { listHandler, createHandler, updateHandler, deleteHandler } from "./branches.controller";

export const branchesRouter = Router();
branchesRouter.use(authMiddleware);
branchesRouter.get("/", listHandler);
branchesRouter.post("/", requireAdmin, createHandler);
branchesRouter.patch("/:id", requireAdmin, updateHandler);
branchesRouter.delete("/:id", requireAdmin, deleteHandler);
