import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";
import {
  listUsersHandler, getUserHandler, createUserHandler, updateUserHandler,
  disableUserHandler, enableUserHandler, adminResetPasswordHandler,
  getMeHandler, updateMeHandler, updateMyPhotoHandler,
  changeMyPasswordHandler, generatePasswordHandler,
} from "./users.controller";

// Admin-only: manage all users
export const usersRouter = Router();
usersRouter.use(authMiddleware);
usersRouter.get("/", requireAdmin, listUsersHandler);
usersRouter.get("/generate-password", requireAdmin, generatePasswordHandler);
usersRouter.get("/:id", requireAdmin, getUserHandler);
usersRouter.post("/", requireAdmin, createUserHandler);
usersRouter.patch("/:id", requireAdmin, updateUserHandler);
usersRouter.post("/:id/disable", requireAdmin, disableUserHandler);
usersRouter.post("/:id/enable", requireAdmin, enableUserHandler);
usersRouter.post("/:id/reset-password", requireAdmin, adminResetPasswordHandler);

// Any logged-in user: their own profile
export const meRouter = Router();
meRouter.use(authMiddleware);
meRouter.get("/", getMeHandler);
meRouter.patch("/", updateMeHandler);
meRouter.post("/photo", uploadPhoto, updateMyPhotoHandler);
meRouter.post("/change-password", changeMyPasswordHandler);
