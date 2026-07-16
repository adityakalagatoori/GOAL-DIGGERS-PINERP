import { PrismaClient, PurchaseOrderStatus } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { generateReference } from "../../utils/generateReference";
import { getIO } from "../../sockets/socket.server";
import { SOCKET_EVENTS } from "../../sockets/events";
import { getProduct } from "../products/products.service";

const prisma = new PrismaClient();

const includeAll = {
  lines: { include: { product: true } },
  vendor: true,
  responsiblePerson: { select: { id: true, name: true, email: true, position: true } },
} as const;

const VALID_STATUSES = new Set(Object.values(PurchaseOrderStatus));

// Matches reference OR the vendor's name — searching "Wood Co." is just as
// natural here as searching "PO-000003", same as Sales' search matching
// customer name in addition to reference.
function purchaseSearchClause(search?: string) {
  return search ? { OR: [{ reference: { contains: search } }, { vendor: { name: { contains: search } } }] } : {};
}

export async function listPurchaseOrders(search?: string, status?: string) {
  // "late" is a derived filter, not a real status column value — see
  // countLatePurchaseOrders in the dashboard service for the matching definition.
  if (status === "late") {
    return prisma.purchaseOrder.findMany({
      where: {
        dueDate: { lt: new Date() },
        status: { notIn: ["fully_received", "cancelled"] },
        ...purchaseSearchClause(search),
      },
      include: includeAll,
      orderBy: { createdAt: "desc" },
    });
  }

  const validStatus = status && VALID_STATUSES.has(status as PurchaseOrderStatus) ? (status as PurchaseOrderStatus) : undefined;

  return prisma.purchaseOrder.findMany({
    where: {
      ...(validStatus ? { status: validStatus } : {}),
      ...purchaseSearchClause(search),
    },
    include: includeAll,
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseOrder(id: number, userId?: number) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: includeAll });
  if (!po) throw new AppError(404, "Purchase order not found");
  if (userId && po.createdBy !== userId) throw new AppError(403, "You do not have access to this purchase order");
  return po;
}

interface LineInput {
  productId: number;
  orderedQty: number;
  costUnitPrice?: number;
}
interface CreateInput {
  vendorId: number;
  vendorAddress?: string;
  responsiblePersonId?: number;
  dueDate?: Date;
  lines: LineInput[];
}

// See sales.service.ts resolveLinePrice for why the client-supplied value
// is ignored outright rather than only defaulted: the frontend never lets
// a user edit this, so honoring an override only opens a fabricated-total
// attack surface with no matching legitimate use.
async function resolveLineCost(productId: number, _provided?: number): Promise<number> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(400, "Referenced product does not exist");
  return Number(product.costPrice);
}

export async function createPurchaseOrder(data: CreateInput, userId?: number) {
  const count = await prisma.purchaseOrder.count();
  const reference = generateReference("PO", count);

  const lines = await Promise.all(
    data.lines.map(async (l) => ({
      productId: l.productId,
      orderedQty: l.orderedQty,
      costUnitPrice: await resolveLineCost(l.productId, l.costUnitPrice),
    }))
  );

  const po = await prisma.purchaseOrder.create({
    data: {
      reference,
      vendorId: data.vendorId,
      vendorAddress: data.vendorAddress,
      responsiblePersonId: data.responsiblePersonId,
      createdBy: userId || 1,
      dueDate: data.dueDate,
      status: "draft",
      lines: { create: lines },
    },
    include: includeAll,
  });

  await prisma.auditLog.create({
    data: { module: "purchase", entity: "PurchaseOrder", recordId: po.id, recordRef: po.reference, action: "created", userId },
  });

  return po;
}

export async function updatePurchaseOrder(id: number, data: Partial<CreateInput>, userId?: number) {
  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Purchase order not found");
  if (existing.status !== "draft") {
    throw new AppError(400, "Only a Draft purchase order can be edited");
  }
  if (userId && existing.createdBy !== userId) {
    throw new AppError(403, "Only the order creator can edit this purchase order");
  }

  return prisma.$transaction(async (tx) => {
    const { lines, ...header } = data;
    await tx.purchaseOrder.update({ where: { id }, data: header });

    if (lines) {
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      const resolvedLines = await Promise.all(
        lines.map(async (l) => ({
          purchaseOrderId: id,
          productId: l.productId,
          orderedQty: l.orderedQty,
          costUnitPrice: await resolveLineCost(l.productId, l.costUnitPrice),
        }))
      );
      await tx.purchaseOrderLine.createMany({ data: resolvedLines });
    }

    await tx.auditLog.create({
      data: { module: "purchase", entity: "PurchaseOrder", recordId: id, recordRef: existing.reference, action: "updated", fieldChanged: "Order Details", userId },
    });

    return tx.purchaseOrder.findUnique({ where: { id }, include: includeAll });
  });
}

export async function deletePurchaseOrder(id: number, userId?: number) {
  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Purchase order not found");
  if (userId && existing.createdBy !== userId) {
    throw new AppError(403, "Only the order creator can delete this purchase order");
  }
  await prisma.purchaseOrder.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { module: "purchase", entity: "PurchaseOrder", recordId: id, recordRef: existing.reference, action: "deleted", userId },
  });
}

export async function confirmPurchaseOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new AppError(404, "Purchase order not found");
    if (po.status !== "draft") throw new AppError(400, "Only a Draft order can be confirmed");

    await tx.purchaseOrder.update({ where: { id }, data: { status: "confirmed" } });
    await tx.auditLog.create({
      data: { module: "purchase", entity: "PurchaseOrder", recordId: id, recordRef: po.reference, action: "updated", fieldChanged: "Status", oldValue: "draft", newValue: "confirmed", userId },
    });

    return tx.purchaseOrder.findUnique({ where: { id }, include: includeAll });
  }).then((result) => {
    getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "purchase_order", orderId: id, newStatus: "confirmed" });
    return result;
  });
}

interface ReceiveLineInput {
  lineId: number;
  receivedQty: number;
}

/**
 * Records receipt for one or more lines. Increments On Hand Qty by the
 * DELTA received this call, writes a StockLedger row per line, and sets
 * status to Fully or Partially Received depending on whether every line is
 * now fully received.
 */
export async function receivePurchaseOrder(id: number, receipts: ReceiveLineInput[], userId: number) {
  const touchedProductIds = new Set<number>();

  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!po) throw new AppError(404, "Purchase order not found");
    if (po.status !== "confirmed" && po.status !== "partially_received") {
      throw new AppError(400, "Order must be Confirmed or Partially Received to record a receipt");
    }

    for (const receipt of receipts) {
      const line = po.lines.find((l) => l.id === receipt.lineId);
      if (!line) throw new AppError(400, `Line ${receipt.lineId} does not belong to this order`);
      if (receipt.receivedQty > Number(line.orderedQty)) {
        throw new AppError(400, "Received quantity cannot exceed ordered quantity");
      }

      const delta = receipt.receivedQty - Number(line.receivedQty);
      if (delta === 0) continue;

      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: receipt.receivedQty } });
      await tx.product.update({ where: { id: line.productId }, data: { onHandQty: { increment: delta } } });
      await tx.stockLedger.create({
        data: { productId: line.productId, qtyChange: delta, refType: "purchase_order", refId: id, reason: "Purchase receipt", userId },
      });
      touchedProductIds.add(line.productId);
    }

    const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
    const fullyReceived = updatedLines.every((l) => Number(l.receivedQty) >= Number(l.orderedQty));
    const newStatus = fullyReceived ? "fully_received" : "partially_received";

    await tx.purchaseOrder.update({ where: { id }, data: { status: newStatus } });
    await tx.auditLog.create({
      data: { module: "purchase", entity: "PurchaseOrder", recordId: id, recordRef: po.reference, action: "updated", fieldChanged: "Status", oldValue: po.status, newValue: newStatus, userId },
    });

    return tx.purchaseOrder.findUnique({ where: { id }, include: includeAll });
  });

  getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "purchase_order", orderId: id, newStatus: result!.status });
  for (const productId of touchedProductIds) {
    const p = await getProduct(productId);
    getIO().emit(SOCKET_EVENTS.STOCK_UPDATED, { productId, onHandQty: Number(p.onHandQty), freeToUseQty: p.freeToUseQty });
  }

  return result;
}

export async function cancelPurchaseOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new AppError(404, "Purchase order not found");
    if (po.status === "fully_received" || po.status === "cancelled") {
      throw new AppError(400, `Cannot cancel an order that is already ${po.status}`);
    }

    await tx.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
    await tx.auditLog.create({
      data: { module: "purchase", entity: "PurchaseOrder", recordId: id, recordRef: po.reference, action: "updated", fieldChanged: "Status", oldValue: po.status, newValue: "cancelled", userId },
    });

    return tx.purchaseOrder.findUnique({ where: { id }, include: includeAll });
  }).then((result) => {
    getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "purchase_order", orderId: id, newStatus: "cancelled" });
    return result;
  });
}
