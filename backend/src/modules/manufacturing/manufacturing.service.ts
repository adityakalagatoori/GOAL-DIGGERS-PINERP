import { PrismaClient, ManufacturingOrderStatus } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { generateReference } from "../../utils/generateReference";
import { checkAndTriggerProcurement } from "../../engines/procurementAutomationEngine";
import { getIO } from "../../sockets/socket.server";
import { SOCKET_EVENTS } from "../../sockets/events";
import { getProduct } from "../products/products.service";

const prisma = new PrismaClient();

const includeAll = {
  finishedProduct: true,
  bom: true,
  assignee: { select: { id: true, name: true, email: true, position: true } },
  components: { include: { product: true } },
  workOrders: { include: { workCenter: true } },
} as const;

const VALID_STATUSES = new Set(Object.values(ManufacturingOrderStatus));

/** True once every component on the order has been fully consumed. */
export function isReadyToClose(mo: { components: { toConsumeQty: unknown; consumedQty: unknown }[] }): boolean {
  return mo.components.length > 0 && mo.components.every((c) => Number(c.consumedQty) >= Number(c.toConsumeQty));
}

// Matches reference OR the finished product's name — searching "Dining
// Chair" is just as natural here as searching "MO-000152", same as Sales'
// search matching customer name in addition to reference.
function mfgSearchClause(search?: string) {
  return search ? { OR: [{ reference: { contains: search } }, { finishedProduct: { name: { contains: search } } }] } : {};
}

export async function listManufacturingOrders(search?: string, status?: string) {
  // "late" and "to_close" are derived filters, not real status column values
  // — see splitInProgressManufacturingOrders/countLateManufacturingOrders in
  // the dashboard service for the matching definitions.
  if (status === "late") {
    return prisma.manufacturingOrder.findMany({
      where: {
        scheduleDate: { lt: new Date() },
        status: { notIn: ["done", "cancelled"] },
        ...mfgSearchClause(search),
      },
      include: includeAll,
      orderBy: { createdAt: "desc" },
    });
  }

  if (status === "to_close" || status === "in_progress") {
    const rows = await prisma.manufacturingOrder.findMany({
      where: { status: "in_progress", ...mfgSearchClause(search) },
      include: includeAll,
      orderBy: { createdAt: "desc" },
    });
    return rows.filter((mo) => (status === "to_close" ? isReadyToClose(mo) : !isReadyToClose(mo)));
  }

  const validStatus = status && VALID_STATUSES.has(status as ManufacturingOrderStatus) ? (status as ManufacturingOrderStatus) : undefined;

  return prisma.manufacturingOrder.findMany({
    where: {
      ...(validStatus ? { status: validStatus } : {}),
      ...mfgSearchClause(search),
    },
    include: includeAll,
    orderBy: { createdAt: "desc" },
  });
}

export async function getManufacturingOrder(id: number, userId?: number) {
  const mo = await prisma.manufacturingOrder.findUnique({ where: { id }, include: includeAll });
  if (!mo) throw new AppError(404, "Manufacturing order not found");
  if (userId && mo.createdBy !== userId) throw new AppError(403, "You do not have access to this manufacturing order");
  return mo;
}

interface CreateInput {
  finishedProductId: number;
  quantity: number;
  bomId?: number;
  scheduleDate?: Date;
  assigneeId?: number;
}

/**
 * If a BoM is selected, Components and Work Orders are populated
 * immediately, scaled by (MO quantity / BoM's own declared batch quantity)
 * — e.g. a BoM defined for a batch of 10 generating an MO for 25 units
 * scales every component qty and every operation's expected duration by 2.5x.
 */
export async function createManufacturingOrder(data: CreateInput, userId?: number) {
  const count = await prisma.manufacturingOrder.count();
  const reference = generateReference("MO", count);

  let componentsCreate: { productId: number; toConsumeQty: number }[] = [];
  let workOrdersCreate: { operation: string; workCenterId: number; expectedDurationMins: number }[] = [];

  if (data.bomId) {
    const bom = await prisma.bom.findUnique({ where: { id: data.bomId }, include: { components: true, workOrderTemplates: true } });
    if (!bom) throw new AppError(400, "Referenced BoM does not exist");
    const ratio = data.quantity / Number(bom.quantity);
    componentsCreate = bom.components.map((c) => ({ productId: c.componentId, toConsumeQty: Number(c.toConsumeQty) * ratio }));
    workOrdersCreate = bom.workOrderTemplates.map((w) => ({
      operation: w.operation,
      workCenterId: w.workCenterId,
      expectedDurationMins: Math.round(Number(w.expectedDurationMins) * ratio),
    }));
  }

  const mo = await prisma.manufacturingOrder.create({
    data: {
      reference,
      finishedProductId: data.finishedProductId,
      quantity: data.quantity,
      bomId: data.bomId,
      scheduleDate: data.scheduleDate,
      assigneeId: data.assigneeId,
      createdBy: userId || 1,
      status: "draft",
      components: { create: componentsCreate },
      workOrders: { create: workOrdersCreate },
    },
    include: includeAll,
  });

  await prisma.auditLog.create({
    data: { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo.id, recordRef: mo.reference, action: "created", userId },
  });

  return mo;
}

export async function updateManufacturingOrder(id: number, data: Partial<CreateInput>, userId?: number) {
  const existing = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Manufacturing order not found");
  if (existing.status !== "draft") {
    throw new AppError(400, "Only a Draft manufacturing order can be edited");
  }
  if (userId && existing.createdBy !== userId) {
    throw new AppError(403, "Only the order creator can edit this manufacturing order");
  }
  const { bomId, finishedProductId, ...rest } = data as any;
  const mo = await prisma.manufacturingOrder.update({ where: { id }, data: rest, include: includeAll });
  await prisma.auditLog.create({
    data: { module: "manufacturing", entity: "ManufacturingOrder", recordId: id, recordRef: existing.reference, action: "updated", fieldChanged: "Order Details", userId },
  });
  return mo;
}

export async function deleteManufacturingOrder(id: number, userId?: number) {
  const existing = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Manufacturing order not found");
  if (userId && existing.createdBy !== userId) {
    throw new AppError(403, "Only the order creator can delete this manufacturing order");
  }
  await prisma.manufacturingOrder.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { module: "manufacturing", entity: "ManufacturingOrder", recordId: id, recordRef: existing.reference, action: "deleted", userId },
  });
}

/**
 * Draft -> Confirmed. Reserves components implicitly (computeReservedQty
 * already counts 'confirmed'/'in_progress' MOs), then checks every
 * component's product for a shortage and triggers procurement automation —
 * this is what can cascade into an auto-created Purchase Order.
 */
export async function confirmManufacturingOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const mo = await tx.manufacturingOrder.findUnique({ where: { id }, include: { components: true } });
    if (!mo) throw new AppError(404, "Manufacturing order not found");
    if (mo.status !== "draft") throw new AppError(400, "Only a Draft order can be confirmed");

    await tx.manufacturingOrder.update({ where: { id }, data: { status: "confirmed" } });
    await tx.auditLog.create({
      data: { module: "manufacturing", entity: "ManufacturingOrder", recordId: id, recordRef: mo.reference, action: "updated", fieldChanged: "Status", oldValue: "draft", newValue: "confirmed", userId },
    });

    for (const component of mo.components) {
      await checkAndTriggerProcurement(tx, component.productId, { triggerType: "manufacturing_order", triggerId: id, userId });
    }

    return tx.manufacturingOrder.findUnique({ where: { id }, include: includeAll });
  }).then((result) => {
    getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "manufacturing_order", orderId: id, newStatus: "confirmed" });
    return result;
  });
}

export async function startManufacturingOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const mo = await tx.manufacturingOrder.findUnique({ where: { id } });
    if (!mo) throw new AppError(404, "Manufacturing order not found");
    if (mo.status !== "confirmed") throw new AppError(400, "Only a Confirmed order can be started");

    await tx.manufacturingOrder.update({ where: { id }, data: { status: "in_progress" } });
    await tx.auditLog.create({
      data: { module: "manufacturing", entity: "ManufacturingOrder", recordId: id, recordRef: mo.reference, action: "updated", fieldChanged: "Status", oldValue: "confirmed", newValue: "in_progress", userId },
    });

    return tx.manufacturingOrder.findUnique({ where: { id }, include: includeAll });
  }).then((result) => {
    getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "manufacturing_order", orderId: id, newStatus: "in_progress" });
    return result;
  });
}

export async function updateComponentConsumption(id: number, updates: { id: number; consumedQty: number }[], userId: number) {
  const mo = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!mo) throw new AppError(404, "Manufacturing order not found");
  if (mo.status !== "confirmed" && mo.status !== "in_progress") {
    throw new AppError(400, "Consumed quantity can only be recorded while Confirmed or In Progress");
  }
  for (const u of updates) {
    // Scoped by manufacturingOrderId, not just the component's own id — a
    // component id belonging to a DIFFERENT MO must not be reachable through
    // this MO's URL, or a caller could corrupt consumption data on orders
    // they were never authorized to touch.
    await prisma.moComponent.updateMany({
      where: { id: u.id, manufacturingOrderId: id },
      data: { consumedQty: u.consumedQty },
    });
  }
  return prisma.manufacturingOrder.findUnique({ where: { id }, include: includeAll });
}

export async function updateWorkOrderDuration(id: number, updates: { id: number; realDurationMins: number }[]) {
  const mo = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!mo) throw new AppError(404, "Manufacturing order not found");
  if (mo.status !== "confirmed" && mo.status !== "in_progress") {
    throw new AppError(400, "Real duration can only be recorded while Confirmed or In Progress");
  }
  for (const u of updates) {
    // Same ownership scoping as updateComponentConsumption above — a
    // work-order id from a different MO must not be writable via this MO's URL.
    await prisma.moWorkOrder.updateMany({
      where: { id: u.id, manufacturingOrderId: id },
      data: { realDurationMins: u.realDurationMins },
    });
  }
  return prisma.manufacturingOrder.findUnique({ where: { id }, include: includeAll });
}

/**
 * -> Done. Increments the finished product's On Hand Qty by the MO quantity,
 * decrements every component's On Hand Qty by its recorded Consumed Qty
 * (not the originally planned To-Consume Qty), and writes a StockLedger row
 * for every movement.
 */
export async function produceManufacturingOrder(id: number, userId: number) {
  const touchedProductIds = new Set<number>();

  const result = await prisma.$transaction(async (tx) => {
    const mo = await tx.manufacturingOrder.findUnique({ where: { id }, include: { components: true } });
    if (!mo) throw new AppError(404, "Manufacturing order not found");
    if (mo.status !== "in_progress" && mo.status !== "confirmed") {
      throw new AppError(400, "Only a Confirmed or In Progress order can be marked Done");
    }

    await tx.product.update({ where: { id: mo.finishedProductId }, data: { onHandQty: { increment: Number(mo.quantity) } } });
    await tx.stockLedger.create({
      data: { productId: mo.finishedProductId, qtyChange: Number(mo.quantity), refType: "manufacturing_order", refId: id, reason: "Finished goods produced", userId },
    });
    touchedProductIds.add(mo.finishedProductId);

    for (const component of mo.components) {
      const consumed = Number(component.consumedQty) || Number(component.toConsumeQty); // fallback to planned if never manually recorded
      await tx.product.update({ where: { id: component.productId }, data: { onHandQty: { decrement: consumed } } });
      await tx.stockLedger.create({
        data: { productId: component.productId, qtyChange: -consumed, refType: "manufacturing_order", refId: id, reason: "Component consumed", userId },
      });
      touchedProductIds.add(component.productId);
    }

    await tx.manufacturingOrder.update({ where: { id }, data: { status: "done" } });
    await tx.auditLog.create({
      data: { module: "manufacturing", entity: "ManufacturingOrder", recordId: id, recordRef: mo.reference, action: "updated", fieldChanged: "Status", oldValue: mo.status, newValue: "done", userId },
    });

    return tx.manufacturingOrder.findUnique({ where: { id }, include: includeAll });
  });

  getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "manufacturing_order", orderId: id, newStatus: "done" });
  for (const productId of touchedProductIds) {
    const p = await getProduct(productId);
    getIO().emit(SOCKET_EVENTS.STOCK_UPDATED, { productId, onHandQty: Number(p.onHandQty), freeToUseQty: p.freeToUseQty });
  }

  return result;
}

export async function cancelManufacturingOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const mo = await tx.manufacturingOrder.findUnique({ where: { id } });
    if (!mo) throw new AppError(404, "Manufacturing order not found");
    if (mo.status === "done" || mo.status === "cancelled") {
      throw new AppError(400, `Cannot cancel an order that is already ${mo.status}`);
    }

    await tx.manufacturingOrder.update({ where: { id }, data: { status: "cancelled" } });
    await tx.auditLog.create({
      data: { module: "manufacturing", entity: "ManufacturingOrder", recordId: id, recordRef: mo.reference, action: "updated", fieldChanged: "Status", oldValue: mo.status, newValue: "cancelled", userId },
    });

    return tx.manufacturingOrder.findUnique({ where: { id }, include: includeAll });
  }).then((result) => {
    getIO().emit(SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderType: "manufacturing_order", orderId: id, newStatus: "cancelled" });
    return result;
  });
}
