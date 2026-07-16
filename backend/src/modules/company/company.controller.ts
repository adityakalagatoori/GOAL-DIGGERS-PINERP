import { Request, Response, NextFunction } from "express";
import * as svc from "./company.service";

export async function getHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.getCompanySettings()); } catch (e) { next(e); }
}
export async function updateHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.updateCompanySettings(req.body)); } catch (e) { next(e); }
}
