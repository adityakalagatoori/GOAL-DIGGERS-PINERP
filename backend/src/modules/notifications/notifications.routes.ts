import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { listHandler, markReadHandler, markAllReadHandler, deleteHandler } from "./notifications.controller";

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware);
notificationsRouter.get("/", listHandler);
notificationsRouter.patch("/:id/read", markReadHandler);
notificationsRouter.post("/read-all", markAllReadHandler);
notificationsRouter.delete("/:id", deleteHandler);
