import { Request, Response } from "express";
import { PermissionModule } from "@prisma/client";
import * as salesService from "./sales.service";
import { filterByFieldPermission } from "../../middleware/rbac.middleware";

export const SALES_FIELD_MAP: Record<string, string> = {
  customerId: "Customer",
  customerAddress: "Customer Address",
  salesPersonId: "Sales Person",
  dueDate: "Due Date",
};

export async function listSalesOrdersHandler(req: Request, res: Response) {
  res.json(await salesService.listSalesOrders(req.query.search as string | undefined, req.query.status as string | undefined));
}

export async function getSalesOrderHandler(req: Request, res: Response) {
  res.json(await salesService.getSalesOrder(Number(req.params.id), req.user?.userId));
}

export async function createSalesOrderHandler(req: Request, res: Response) {
  const data = await filterByFieldPermission(req.user!.userId, req.user!.isAdmin, PermissionModule.sales, "canCreate", req.body, SALES_FIELD_MAP);
  // `lines` isn't in the header field map (it's the order's products), always passed through.
  res.status(201).json(await salesService.createSalesOrder({ ...data, lines: req.body.lines } as any, req.user!.userId));
}

export async function updateSalesOrderHandler(req: Request, res: Response) {
  const data = await filterByFieldPermission(req.user!.userId, req.user!.isAdmin, PermissionModule.sales, "canEdit", req.body, SALES_FIELD_MAP);
  res.json(await salesService.updateSalesOrder(Number(req.params.id), { ...data, lines: req.body.lines } as any, req.user!.userId));
}

export async function deleteSalesOrderHandler(req: Request, res: Response) {
  await salesService.deleteSalesOrder(Number(req.params.id), req.user!.userId);
  res.status(204).send();
}

export async function confirmSalesOrderHandler(req: Request, res: Response) {
  res.json(await salesService.confirmSalesOrder(Number(req.params.id), req.user!.userId, req.body?.actions ?? []));
}

export async function deliverSalesOrderHandler(req: Request, res: Response) {
  res.json(await salesService.deliverSalesOrder(Number(req.params.id), req.body.lines, req.user!.userId));
}

export async function cancelSalesOrderHandler(req: Request, res: Response) {
  res.json(await salesService.cancelSalesOrder(Number(req.params.id), req.user!.userId));
}
