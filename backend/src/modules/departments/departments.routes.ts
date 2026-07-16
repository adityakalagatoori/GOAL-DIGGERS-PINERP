import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { listHandler, createHandler, updateHandler, deleteHandler } from "./departments.controller";

export const departmentsRouter = Router();
departmentsRouter.use(authMiddleware);
departmentsRouter.get("/", listHandler);
departmentsRouter.post("/", requireAdmin, createHandler);
departmentsRouter.patch("/:id", requireAdmin, updateHandler);
departmentsRouter.delete("/:id", requireAdmin, deleteHandler);
