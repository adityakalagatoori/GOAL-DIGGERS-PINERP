import { Request, Response } from "express";
import * as mfgService from "./manufacturing.service";

export async function listManufacturingOrdersHandler(req: Request, res: Response) {
  res.json(await mfgService.listManufacturingOrders(req.query.search as string | undefined, req.query.status as string | undefined));
}

export async function getManufacturingOrderHandler(req: Request, res: Response) {
  res.json(await mfgService.getManufacturingOrder(Number(req.params.id), req.user?.userId));
}

export async function createManufacturingOrderHandler(req: Request, res: Response) {
  res.status(201).json(await mfgService.createManufacturingOrder(req.body, req.user!.userId));
}

export async function updateManufacturingOrderHandler(req: Request, res: Response) {
  res.json(await mfgService.updateManufacturingOrder(Number(req.params.id), req.body, req.user!.userId));
}

export async function deleteManufacturingOrderHandler(req: Request, res: Response) {
  await mfgService.deleteManufacturingOrder(Number(req.params.id), req.user!.userId);
  res.status(204).send();
}

export async function confirmManufacturingOrderHandler(req: Request, res: Response) {
  res.json(await mfgService.confirmManufacturingOrder(Number(req.params.id), req.user!.userId));
}

export async function startManufacturingOrderHandler(req: Request, res: Response) {
  res.json(await mfgService.startManufacturingOrder(Number(req.params.id), req.user!.userId));
}

export async function updateComponentsHandler(req: Request, res: Response) {
  res.json(await mfgService.updateComponentConsumption(Number(req.params.id), req.body.components, req.user!.userId));
}

export async function updateWorkOrdersHandler(req: Request, res: Response) {
  res.json(await mfgService.updateWorkOrderDuration(Number(req.params.id), req.body.workOrders));
}

export async function produceManufacturingOrderHandler(req: Request, res: Response) {
  res.json(await mfgService.produceManufacturingOrder(Number(req.params.id), req.user!.userId));
}

export async function cancelManufacturingOrderHandler(req: Request, res: Response) {
  res.json(await mfgService.cancelManufacturingOrder(Number(req.params.id), req.user!.userId));
}
