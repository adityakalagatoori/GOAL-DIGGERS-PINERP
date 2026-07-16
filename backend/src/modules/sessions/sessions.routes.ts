import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { listActiveSessionsHandler, getLoginHistoryHandler, forceLogoutHandler, forceLogoutUserHandler } from "./sessions.controller";

export const sessionsRouter = Router();
sessionsRouter.use(authMiddleware, requireAdmin);
sessionsRouter.get("/active", listActiveSessionsHandler);
sessionsRouter.get("/history", getLoginHistoryHandler);
sessionsRouter.delete("/:id", forceLogoutHandler);
sessionsRouter.delete("/user/:userId/all", forceLogoutUserHandler);
