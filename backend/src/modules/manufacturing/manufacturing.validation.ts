import { z } from "zod";
import { futureOrTodayDate } from "../../validation/dateFields";

export const createManufacturingOrderSchema = z.object({
  finishedProductId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  bomId: z.coerce.number().int().positive().optional(),
  scheduleDate: futureOrTodayDate,
  assigneeId: z.coerce.number().int().positive().optional(),
});

export const updateManufacturingOrderSchema = z.object({
  quantity: z.coerce.number().positive().optional(),
  scheduleDate: futureOrTodayDate,
  assigneeId: z.coerce.number().int().positive().optional(),
});

// Manually recording actual consumption — only meaningful once Confirmed.
export const updateComponentsSchema = z.object({
  components: z.array(
    z.object({
      id: z.coerce.number().int().positive(),
      consumedQty: z.coerce.number().nonnegative(),
    })
  ).min(1),
});

// Real Duration entry — only meaningful once Confirmed/In-Progress.
export const updateWorkOrdersSchema = z.object({
  workOrders: z.array(
    z.object({
      id: z.coerce.number().int().positive(),
      realDurationMins: z.coerce.number().int().nonnegative(),
    })
  ).min(1),
});
