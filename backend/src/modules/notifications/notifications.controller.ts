import { Request, Response, NextFunction } from "express";
import * as svc from "./notifications.service";

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listNotifications(req.user!.userId)); } catch (e) { next(e); }
}

export async function markReadHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.markRead(req.user!.userId, Number(req.params.id))); } catch (e) { next(e); }
}

export async function markAllReadHandler(req: Request, res: Response, next: NextFunction) {
  try { await svc.markAllRead(req.user!.userId); res.json({ ok: true }); } catch (e) { next(e); }
}

export async function deleteHandler(req: Request, res: Response, next: NextFunction) {
  try { await svc.deleteNotification(req.user!.userId, Number(req.params.id)); res.status(204).send(); } catch (e) { next(e); }
}
