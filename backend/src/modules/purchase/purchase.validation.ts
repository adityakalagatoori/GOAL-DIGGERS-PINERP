import { z } from "zod";
import { futureOrTodayDate } from "../../validation/dateFields";

const lineSchema = z.object({
  productId: z.coerce.number().int().positive(),
  orderedQty: z.coerce.number().positive(),
  costUnitPrice: z.coerce.number().positive().optional(), // defaults to Product.costPrice if omitted
});

export const createPurchaseOrderSchema = z.object({
  vendorId: z.coerce.number().int().positive(),
  vendorAddress: z.string().optional(),
  responsiblePersonId: z.coerce.number().int().positive().optional(),
  dueDate: futureOrTodayDate,
  lines: z.array(lineSchema).min(1, "At least one product line is required"),
});

export const updatePurchaseOrderSchema = z.object({
  vendorId: z.coerce.number().int().positive().optional(),
  vendorAddress: z.string().optional(),
  responsiblePersonId: z.coerce.number().int().positive().optional(),
  dueDate: futureOrTodayDate,
  lines: z.array(lineSchema).optional(),
});

export const receivePurchaseOrderSchema = z.object({
  lines: z.array(
    z.object({
      lineId: z.coerce.number().int().positive(),
      receivedQty: z.coerce.number().nonnegative(),
    })
  ).min(1),
});
