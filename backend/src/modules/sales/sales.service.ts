import { PrismaClient, SalesOrderStatus } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { generateReference } from "../../utils/generateReference";
import { checkAndTriggerProcurement, type ProcurementOverride } from "../../engines/procurementAutomationEngine";
import { estimateDeliveryDays } from "../../engines/pinEngine";
import { getIO } from "../../sockets/socket.server";
import { SOCKET_EVENTS } from "../../sockets/events";
import { getProduct } from "../products/products.service";
import type { PinAction } from "../pin/pin.validation";

const prisma = new PrismaClient();

// salesPerson is selected explicitly (never `true`) so passwordHash and
// other sensitive User fields can never leak through this endpoint.
const includeAll = {
  lines: { include: { product: true } },
  customer: true,
  salesPerson: { select: { id: true, name: true, email: true, position: true } },
} as const;

const VALID_STATUSES = new Set(Object.values(SalesOrderStatus));

export async function listSalesOrders(search?: string, status?: string) {
  // "late" is a derived filter, not a real status column value — handled
  // separately from the enum check below (see countLateSalesOrders in the
  // dashboard service for the matching definition).
  // Matches the wireframe's "search receptive based on reference & contacts"
  // note — reference is matched directly, "contacts" maps to the customer's
  // name/email, since that's the only contact info attached to an order.
  const searchClause = search
    ? {
        OR: [
          { reference: { contains: search } },
          { customer: { name: { contains: search } } },
          { customer: { email: { contains: search } } },
        ],
      }
    : {};

  if (status === "late") {
    return prisma.salesOrder.findMany({
      where: {
        dueDate: { lt: new Date() },
        status: { notIn: ["fully_delivered", "cancelled"] },
        ...searchClause,
      },
      include: includeAll,
      orderBy: { createdAt: "desc" },
    });
  }

  // An unrecognized status (e.g. a stray "undefined" from a malformed
  // query string) is ignored rather than passed to Prisma, which would
  // throw on an invalid enum value and crash the request with a 500.
  const validStatus = status && VALID_STATUSES.has(status as SalesOrderStatus) ? (status as SalesOrderStatus) : undefined;

  return prisma.salesOrder.findMany({
    where: {
      ...(validStatus ? { status: validStatus } : {}),
      ...searchClause,
    },
    include: includeAll,
    orderBy: { createdAt: "desc" },
  });
}

export async function getSalesOrder(id: number, userId?: number) {
  const so = await prisma.salesOrder.findUnique({ where: { id }, include: includeAll });
  if (!so) throw new AppError(404, "Sales order not found");
  if (userId && so.createdBy !== userId) throw new AppError(403, "You do not have access to this sales order");

  // `includeAll`'s nested `product: true` is a raw Prisma fetch — it has no
  // freeToUseQty (that's only computed by products.service's withComputedQty).
  // Without this, the order form's Availability badge always renders "-"
  // for a saved order, even though the same badge shows a real "Short by X"
  // for an unsaved draft (whose lines are built from listProducts(), which
  // DOES carry the computed field). Re-fetching each line's product through
  // getProduct() here makes both code paths agree.
  const lines = await Promise.all(so.lines.map(async (line) => ({ ...line, product: await getProduct(line.productId) })));
  return { ...so, lines };
}

interface LineInput {
  productId: number;
  orderedQty: number;
  salesUnitPrice?: number;
}
interface CreateInput {
  customerId: number;
  customerAddress?: string;
  salesPersonId?: number;
  dueDate?: Date;
  lines: LineInput[];
}

// The client-supplied unit price is never trusted, even when present — the
// frontend only ever pre-fills it for display before submit (it's rendered
// read-only, never as an editable input), so there's no legitimate flow
// that needs a caller-chosen price. Always deriving it server-side from
// Product.salesPrice closes off crafting an order with a fabricated total
// via a raw request (e.g. Burp Repeater) that a client can't otherwise send.
async function resolveLinePrice(productId: number, _provided?: number): Promise<number> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(400, "Referenced product does not exist");
  return Number(product.salesPrice);
}

export async function createSalesOrder(data: CreateInput, userId?: number) {
  const count = await prisma.salesOrder.count();
  const reference = generateReference("SO", count);

  const lines = await Promise.all(
    data.lines.map(async (l) => ({
      productId: l.productId,
      orderedQty: l.orderedQty,
      salesUnitPrice: await resolveLinePrice(l.productId, l.salesUnitPrice),
    }))
  );

  const so = await prisma.salesOrder.create({
    data: {
      reference,
      customerId: data.customerId,
      customerAddress: data.customerAddress,
      salesPersonId: data.salesPersonId,
      createdBy: userId || 1,
      dueDate: data.dueDate,
      status: "draft",
      lines: { create: lines },
    },
    include: includeAll,
  });

  await prisma.auditLog.create({
    data: { module: "sales", entity: "SalesOrder", recordId: so.id, recordRef: so.reference, action: "created", userId },
  });

  return so;
}

export async function updateSalesOrder(id: number, data: Partial<CreateInput>, userId?: number) {
  const existing = await prisma.salesOrder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Sales order not found");
  if (existing.status !== "draft") {
    throw new AppError(400, "Only a Draft sales order can be edited");
  }
  if (userId && existing.createdBy !== userId) {
    throw new AppError(403, "Only the order creator can edit this sales order");
  }

  return prisma.$transaction(async (tx) => {
    const { lines, ...header } = data;
    await tx.salesOrder.update({ where: { id }, data: header });

    if (lines) {
      await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
      const resolvedLines = await Promise.all(
        lines.map(async (l) => ({
          salesOrderId: id,
          productId: l.productId,
          orderedQty: l.orderedQty,
          salesUnitPrice: await resolveLinePrice(l.productId, l.salesUnitPrice),
        }))
      );
      await tx.salesOrderLine.createMany({ data: resolvedLines });
    }

    await tx.auditLog.create({
      data: { module: "sales", entity: "SalesOrder", recordId: id, recordRef: existing.reference, action: "updated", fieldChanged: "Order Details", userId },
    });

    return tx.salesOrder.findUnique({ where: { id }, include: includeAll });
  });
}

export async function deleteSalesOrder(id: number, userId?: number) {
  const existing = await prisma.salesOrder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Sales order not found");
  if (userId && existing.createdBy !== userId) {
    throw new AppError(403, "Only the order creator can delete this sales order");
  }
  await prisma.salesOrder.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { module: "sales", entity: "SalesOrder", recordId: id, recordRef: existing.reference, action: "deleted", userId },
  });
}

/**
 * Draft -> Confirmed. Reserves stock implicitly (computeReservedQty already
 * counts 'confirmed' orders), writes an audit entry, then checks every line's
 * product for a shortage and triggers procurement automation if configured.
 *
 * `pinActions` are the boxes a user checked in the PIN checkpoint modal
 * before confirming — applied inside THIS SAME transaction, not a separate
 * endpoint, so re-validation, the procurement trigger, and the resulting
 * PO/MO creation stay one atomic unit. An empty/missing array ("Confirm as
 * Normal") behaves exactly like Accept Risk on every line: no overrides, no
 * qty changes, default vendor.
 */
export async function confirmSalesOrder(id: number, userId: number, pinActions: PinAction[] = []) {
  return prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!so) throw new AppError(404, "Sales order not found");
    if (so.status !== "draft") throw new AppError(400, "Only a Draft order can be confirmed");

    // QTY_ADJUST must land before reservation/shortfall is computed, since it
    // changes what "shortfall" even means for this line.
    for (const action of pinActions) {
      if (action.type === "QTY_ADJUST" && action.qty !== undefined) {
        const line = so.lines.find((l) => l.productId === action.productId);
        if (line) await tx.salesOrderLine.update({ where: { id: line.id }, data: { orderedQty: action.qty } });
      }
    }

    const overridesByProduct = new Map<number, ProcurementOverride>();
    for (const action of pinActions) {
      if (action.type === "VENDOR_SWITCH" && action.vendorId) {
        overridesByProduct.set(action.productId, { ...overridesByProduct.get(action.productId), vendorId: action.vendorId });
      }
      if (action.type === "EXPEDITE") {
        const product = await tx.product.findUnique({ where: { id: action.productId } });
        const offer = product?.vendorId
          ? await tx.vendorOffer.findUnique({ where: { vendorId_productId: { vendorId: product.vendorId, productId: action.productId } } })
          : null;
        if (offer?.expediteLeadDays != null) {
          overridesByProduct.set(action.productId, { ...overridesByProduct.get(action.productId), expediteLeadDays: offer.expediteLeadDays });
        }
      }
    }

    for (const action of pinActions) {
      await tx.auditLog.create({
        data: {
          module: "sales", entity: "SalesOrder", recordId: id, recordRef: so.reference, action: "updated",
          fieldChanged: `PIN: ${action.type}`, newValue: action.vendorId ? `vendorId=${action.vendorId}` : action.qty ? `qty=${action.qty}` : "applied", userId,
        },
      });
    }

    await tx.salesOrder.update({ where: { id }, data: { status: "confirmed" } });
    await tx.auditLog.create({
      data: { module: "sales", entity: "SalesOrder", recordId: id, recordRef: so.reference, action: "updated", fieldChanged: "Status", oldValue: "draft", newValue: "confirmed", userId },
    });

    const refreshedLines = await tx.salesOrderLine.findMany({ where: { salesOrderId: id } });
    let maxLeadDays = 0;
    for (const line of refreshedLines) {
      await checkAndTriggerProcurement(tx, line.productId, { triggerType: "sales_order", triggerId: id, userId }, overridesByProduct.get(line.productId));

      const product = await tx.product.findUnique({ where: { id: line.productId } });
      const override = overridesByProduct.get(line.productId);
      const vendorOffer = override?.vendorId
        ? await tx.vendorOffer.findUnique({ where: { vendorId_productId: { vendorId: override.vendorId, productId: line.productId } } })
        : null;
      const baseLeadDays = override?.expediteLeadDays ?? vendorOffer?.leadTimeDays ?? product?.leadTimeDays ?? 0;
      maxLeadDays = Math.max(maxLeadDays, estimateDeliveryDays(baseLeadDays, 0));
    }

    if (maxLeadDays > 0) {
      await tx.salesOrder.update({ where: { id }, data: { estimatedDeliveryAt: new Date(Date.now() + maxLeadDays * 24 * 60 * 60 * 1000) } });
    }

    return tx.salesOrder.findUnique({ where: { id }, include: includeAll });
  }).then((result) => {
    getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "sales_order", orderId: id, newStatus: "confirmed" });
    return result;
  });
}

interface DeliverLineInput {
  lineId: number;
  deliveredQty: number;
}

/**
 * Records delivery for one or more lines. Decrements On Hand Qty by the
 * DELTA delivered this call (not the full deliveredQty), writes a
 * StockLedger row per line, and sets status to Fully or Partially Delivered
 * depending on whether every line is now fully delivered.
 */
export async function deliverSalesOrder(id: number, deliveries: DeliverLineInput[], userId: number) {
  const touchedProductIds = new Set<number>();

  const result = await prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!so) throw new AppError(404, "Sales order not found");
    if (so.status !== "confirmed" && so.status !== "partially_delivered") {
      throw new AppError(400, "Order must be Confirmed or Partially Delivered to record a delivery");
    }

    for (const delivery of deliveries) {
      const line = so.lines.find((l) => l.id === delivery.lineId);
      if (!line) throw new AppError(400, `Line ${delivery.lineId} does not belong to this order`);
      if (delivery.deliveredQty > Number(line.orderedQty)) {
        throw new AppError(400, "Delivered quantity cannot exceed ordered quantity");
      }

      const delta = delivery.deliveredQty - Number(line.deliveredQty);
      if (delta === 0) continue;

      await tx.salesOrderLine.update({ where: { id: line.id }, data: { deliveredQty: delivery.deliveredQty } });
      await tx.product.update({ where: { id: line.productId }, data: { onHandQty: { decrement: delta } } });
      await tx.stockLedger.create({
        data: { productId: line.productId, qtyChange: -delta, refType: "sales_order", refId: id, reason: "Sales delivery", userId },
      });
      touchedProductIds.add(line.productId);
    }

    const updatedLines = await tx.salesOrderLine.findMany({ where: { salesOrderId: id } });
    const fullyDelivered = updatedLines.every((l) => Number(l.deliveredQty) >= Number(l.orderedQty));
    const newStatus = fullyDelivered ? "fully_delivered" : "partially_delivered";

    await tx.salesOrder.update({ where: { id }, data: { status: newStatus } });
    await tx.auditLog.create({
      data: { module: "sales", entity: "SalesOrder", recordId: id, recordRef: so.reference, action: "updated", fieldChanged: "Status", oldValue: so.status, newValue: newStatus, userId },
    });

    return tx.salesOrder.findUnique({ where: { id }, include: includeAll });
  });

  getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "sales_order", orderId: id, newStatus: result!.status });
  for (const productId of touchedProductIds) {
    const p = await getProduct(productId);
    getIO().emit(SOCKET_EVENTS.STOCK_UPDATED, { productId, onHandQty: Number(p.onHandQty), freeToUseQty: p.freeToUseQty });
  }

  return result;
}

export async function cancelSalesOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUnique({ where: { id } });
    if (!so) throw new AppError(404, "Sales order not found");
    if (so.status === "fully_delivered" || so.status === "cancelled") {
      throw new AppError(400, `Cannot cancel an order that is already ${so.status}`);
    }

    await tx.salesOrder.update({ where: { id }, data: { status: "cancelled" } });
    await tx.auditLog.create({
      data: { module: "sales", entity: "SalesOrder", recordId: id, recordRef: so.reference, action: "updated", fieldChanged: "Status", oldValue: so.status, newValue: "cancelled", userId },
    });

    return tx.salesOrder.findUnique({ where: { id }, include: includeAll });
  }).then((result) => {
    getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "sales_order", orderId: id, newStatus: "cancelled" });
    return result;
  });
}
