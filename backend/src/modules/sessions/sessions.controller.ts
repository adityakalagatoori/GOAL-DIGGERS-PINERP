import { Request, Response, NextFunction } from "express";
import * as svc from "./sessions.service";

export async function listActiveSessionsHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listActiveSessions()); } catch (e) { next(e); }
}
export async function getLoginHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.getLoginHistory()); } catch (e) { next(e); }
}
export async function forceLogoutHandler(req: Request, res: Response, next: NextFunction) {
  try { await svc.forceLogout(String(req.params.id)); res.status(204).send(); } catch (e) { next(e); }
}
export async function forceLogoutUserHandler(req: Request, res: Response, next: NextFunction) {
  try { await svc.forceLogoutUser(Number(req.params.userId)); res.status(204).send(); } catch (e) { next(e); }
}
