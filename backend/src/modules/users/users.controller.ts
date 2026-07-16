import { Request, Response, NextFunction } from "express";
import * as svc from "./users.service";

export async function listUsersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, roleId, departmentId, isActive, branchId } = req.query;
    res.json(await svc.listUsers({
      search: search as string | undefined,
      roleId: roleId ? Number(roleId) : undefined,
      departmentId: departmentId ? Number(departmentId) : undefined,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
      branchId: branchId ? Number(branchId) : undefined,
    }));
  } catch (e) { next(e); }
}

export async function getUserHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.getUserWithPermissions(Number(req.params.id))); } catch (e) { next(e); }
}

export async function createUserHandler(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await svc.createUser(req.body)); } catch (e) { next(e); }
}

export async function updateUserHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.updateUser(Number(req.params.id), req.body)); } catch (e) { next(e); }
}

export async function disableUserHandler(req: Request, res: Response, next: NextFunction) {
  try { await svc.disableUser(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
}

export async function enableUserHandler(req: Request, res: Response, next: NextFunction) {
  try { await svc.enableUser(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
}

export async function adminResetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { password } = req.body;
    if (!password) { res.status(400).json({ error: "Password is required" }); return; }
    await svc.adminResetPassword(Number(req.params.id), password);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function getMeHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.getMe(req.user!.userId)); } catch (e) { next(e); }
}

export async function updateMeHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.updateMe(req.user!.userId, req.body)); } catch (e) { next(e); }
}

export async function changeMyPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body;
    await svc.changeMyPassword(req.user!.userId, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function updateMyPhotoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    res.json(await svc.updateMyPhoto(req.user!.userId, photoUrl));
  } catch (e) { next(e); }
}

export async function generatePasswordHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json({ password: await svc.generateRandomPassword() }); } catch (e) { next(e); }
}
