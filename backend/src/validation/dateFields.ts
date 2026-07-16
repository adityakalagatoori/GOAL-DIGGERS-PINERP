import { z } from "zod";

/**
 * A due/schedule date that, when provided, must not be in the past. Used
 * on Sales/Purchase/Manufacturing order create+update — nothing previously
 * stopped a client from submitting a due date behind "today", which
 * silently produced an order that reads as overdue the instant it's
 * created and skews the delay-tracer/dashboard analytics built on top of
 * these dates. Compares against the start of today (not the exact current
 * time) so "today" itself is always a valid choice regardless of what time
 * of day the request lands.
 */
export const futureOrTodayDate = z.coerce.date().optional().refine(
  (date) => {
    if (!date) return true;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return date >= startOfToday;
  },
  { message: "Date cannot be in the past" }
);
