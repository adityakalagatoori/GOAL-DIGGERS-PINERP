import { Request, Response } from "express";
import { PermissionModule } from "@prisma/client";
import * as purchaseService from "./purchase.service";
import { filterByFieldPermission } from "../../middleware/rbac.middleware";

export const PURCHASE_FIELD_MAP: Record<string, string> = {
  vendorId: "Vendor",
  vendorAddress: "Vendor Address",
  responsiblePersonId: "Responsible Person",
  dueDate: "Due Date",
};

export async function listPurchaseOrdersHandler(req: Request, res: Response) {
  res.json(
    await purchaseService.listPurchaseOrders({
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      dueDateFrom: req.query.dueDateFrom as string | undefined,
      dueDateTo: req.query.dueDateTo as string | undefined,
      createdBy: req.query.createdBy ? Number(req.query.createdBy) : undefined,
      userId: req.user!.userId,
      isAdmin: req.user!.isAdmin,
    })
  );
}

export async function getPurchaseOrderHandler(req: Request, res: Response) {
  res.json(await purchaseService.getPurchaseOrder(Number(req.params.id), req.user?.userId, req.user?.isAdmin));
}

export async function createPurchaseOrderHandler(req: Request, res: Response) {
  const data = await filterByFieldPermission(req.user!.userId, req.user!.isAdmin, PermissionModule.purchase, "canCreate", req.body, PURCHASE_FIELD_MAP);
  res.status(201).json(await purchaseService.createPurchaseOrder({ ...data, lines: req.body.lines } as any, req.user!.userId));
}

export async function updatePurchaseOrderHandler(req: Request, res: Response) {
  const data = await filterByFieldPermission(req.user!.userId, req.user!.isAdmin, PermissionModule.purchase, "canEdit", req.body, PURCHASE_FIELD_MAP);
  res.json(await purchaseService.updatePurchaseOrder(Number(req.params.id), { ...data, lines: req.body.lines } as any, req.user!.userId, req.user!.isAdmin));
}

export async function deletePurchaseOrderHandler(req: Request, res: Response) {
  await purchaseService.deletePurchaseOrder(Number(req.params.id), req.user!.userId, req.user!.isAdmin);
  res.status(204).send();
}

export async function confirmPurchaseOrderHandler(req: Request, res: Response) {
  res.json(await purchaseService.confirmPurchaseOrder(Number(req.params.id), req.user!.userId));
}

export async function receivePurchaseOrderHandler(req: Request, res: Response) {
  res.json(await purchaseService.receivePurchaseOrder(Number(req.params.id), req.body.lines, req.user!.userId));
}

export async function cancelPurchaseOrderHandler(req: Request, res: Response) {
  res.json(await purchaseService.cancelPurchaseOrder(Number(req.params.id), req.user!.userId));
}
