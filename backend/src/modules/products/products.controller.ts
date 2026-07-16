import { Request, Response } from "express";
import { PermissionModule } from "@prisma/client";
import * as productsService from "./products.service";
import { filterByFieldPermission } from "../../middleware/rbac.middleware";
import { AppError } from "../../middleware/errorHandler";

export const PRODUCT_FIELD_MAP: Record<string, string> = {
  name: "Product",
  salesPrice: "Sales Price",
  costPrice: "Cost Price",
  procureOnDemand: "Procure On Demand",
  procurementMethod: "Procurement Method",
  vendorId: "Vendor",
  bomId: "Bill of Materials",
  // dimensions/specifications/leadTimeDays/movementRate/minOrderQty/
  // lowStockThreshold are intentionally absent — not part of the
  // wireframe's grid, so they're Admin-only by default (see
  // filterByFieldPermission's behavior for unmapped fields).
};

export async function listProductsHandler(req: Request, res: Response) {
  res.json(await productsService.listProducts(req.query.search as string | undefined));
}

export async function getProductHandler(req: Request, res: Response) {
  res.json(await productsService.getProduct(Number(req.params.id)));
}

export async function createProductHandler(req: Request, res: Response) {
  const data = await filterByFieldPermission(
    req.user!.userId,
    req.user!.isAdmin,
    PermissionModule.product,
    "canCreate",
    req.body,
    PRODUCT_FIELD_MAP
  );
  res.status(201).json(
    await productsService.createProduct(data as unknown as Parameters<typeof productsService.createProduct>[0], req.user!.userId)
  );
}

export async function updateProductHandler(req: Request, res: Response) {
  const data = await filterByFieldPermission(
    req.user!.userId,
    req.user!.isAdmin,
    PermissionModule.product,
    "canEdit",
    req.body,
    PRODUCT_FIELD_MAP
  );
  res.json(await productsService.updateProduct(Number(req.params.id), data, req.user!.userId));
}

export async function deleteProductHandler(req: Request, res: Response) {
  await productsService.deleteProduct(Number(req.params.id), req.user!.userId);
  res.status(204).send();
}

export async function updateProductPhotoHandler(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No photo uploaded");
  const photoUrl = `/uploads/photos/${req.file.filename}`;
  res.json(await productsService.updateProductPhoto(Number(req.params.id), photoUrl, req.user!.userId));
}

export async function reconcileStockHandler(req: Request, res: Response) {
  const { newOnHandQty, reason } = req.body;
  res.json(await productsService.reconcileStock(Number(req.params.id), newOnHandQty, reason, req.user!.userId));
}
