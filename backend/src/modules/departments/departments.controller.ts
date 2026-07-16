import { Request, Response, NextFunction } from "express";
import * as svc from "./departments.service";

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listDepartments()); } catch (e) { next(e); }
}
export async function createHandler(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await svc.createDepartment(req.body.name)); } catch (e) { next(e); }
}
export async function updateHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.updateDepartment(Number(req.params.id), req.body)); } catch (e) { next(e); }
}
export async function deleteHandler(req: Request, res: Response, next: NextFunction) {
  try { await svc.deleteDepartment(Number(req.params.id)); res.status(204).send(); } catch (e) { next(e); }
}
