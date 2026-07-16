import { z } from "zod";
import { pinActionSchema } from "../pin/pin.validation";
import { futureOrTodayDate } from "../../validation/dateFields";

const lineSchema = z.object({
  productId: z.coerce.number().int().positive(),
  orderedQty: z.coerce.number().positive(),
  salesUnitPrice: z.coerce.number().positive().optional(), // defaults to Product.salesPrice if omitted
});

export const createSalesOrderSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  customerAddress: z.string().optional(),
  salesPersonId: z.coerce.number().int().positive().optional(),
  dueDate: futureOrTodayDate,
  lines: z.array(lineSchema).min(1, "At least one product line is required"),
});

// Only meaningful while status === draft (enforced in the service layer,
// not here, since validation has no access to the current record's status).
export const updateSalesOrderSchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  customerAddress: z.string().optional(),
  salesPersonId: z.coerce.number().int().positive().optional(),
  dueDate: futureOrTodayDate,
  lines: z.array(lineSchema).optional(),
});

// Empty/omitted `actions` = "Confirm as Normal" (default vendor, no qty
// change, no expedite) — same effect as Accept Risk on every cart line.
export const confirmSalesOrderSchema = z.object({
  actions: z.array(pinActionSchema).optional(),
});

export const deliverSalesOrderSchema = z.object({
  lines: z.array(
    z.object({
      lineId: z.coerce.number().int().positive(),
      deliveredQty: z.coerce.number().nonnegative(),
    })
  ).min(1),
});
