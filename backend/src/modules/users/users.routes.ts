import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";
import { validateRequest } from "../../middleware/validateRequest";
import {
  createUserSchema, updateUserSchema, updateMeSchema,
  changeMyPasswordSchema, adminResetPasswordSchema,
} from "./users.validation";
import {
  listUsersHandler, listUserDirectoryHandler, getUserHandler, createUserHandler, updateUserHandler,
  disableUserHandler, enableUserHandler, adminResetPasswordHandler,
  getMeHandler, updateMeHandler, updateMyPhotoHandler,
  changeMyPasswordHandler, generatePasswordHandler,
} from "./users.controller";

// Admin-only: manage all users
export const usersRouter = Router();
usersRouter.use(authMiddleware);
usersRouter.get("/", requireAdmin, listUsersHandler);
// Any authenticated user: minimal id/name list for "assign to" dropdowns
// (Sales Person, Responsible Person, etc.) — must be registered before
// "/:id" or it would be swallowed by that param route.
usersRouter.get("/directory", listUserDirectoryHandler);
usersRouter.get("/generate-password", requireAdmin, generatePasswordHandler);
usersRouter.get("/:id", requireAdmin, getUserHandler);
usersRouter.post("/", requireAdmin, validateRequest(createUserSchema), createUserHandler);
usersRouter.patch("/:id", requireAdmin, validateRequest(updateUserSchema), updateUserHandler);
usersRouter.post("/:id/disable", requireAdmin, disableUserHandler);
usersRouter.post("/:id/enable", requireAdmin, enableUserHandler);
usersRouter.post("/:id/reset-password", requireAdmin, validateRequest(adminResetPasswordSchema), adminResetPasswordHandler);

// Any logged-in user: their own profile
export const meRouter = Router();
meRouter.use(authMiddleware);
meRouter.get("/", getMeHandler);
meRouter.patch("/", validateRequest(updateMeSchema), updateMeHandler);
meRouter.post("/photo", uploadPhoto, updateMyPhotoHandler);
meRouter.post("/change-password", validateRequest(changeMyPasswordSchema), changeMyPasswordHandler);
