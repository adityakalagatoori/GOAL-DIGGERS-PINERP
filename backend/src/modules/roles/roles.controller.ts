import { Request, Response, NextFunction } from "express";
import * as rolesService from "./roles.service";

export async function listRolesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await rolesService.listRoles());
  } catch (e) { next(e); }
}

export async function getRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await rolesService.getRole(Number(req.params.id)));
  } catch (e) { next(e); }
}

export async function createRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await rolesService.createRole(req.body));
  } catch (e) { next(e); }
}

export async function updateRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await rolesService.updateRole(Number(req.params.id), req.body));
  } catch (e) { next(e); }
}

export async function deleteRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await rolesService.deleteRole(Number(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}
