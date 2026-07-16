import { Request, Response, NextFunction } from "express";
import { ZodType, z } from "zod";

type RequestPart = "body" | "query" | "params";

/**
 * Validates req[part] against a zod schema. On success, replaces req[part]
 * with the parsed (and type-coerced/defaulted) value. On failure, responds
 * 400 with a structured error tree instead of reaching the route handler.
 */
export function validateRequest(schema: ZodType, part: RequestPart = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      res.status(400).json({ error: "Validation failed", details: z.treeifyError(result.error) });
      return;
    }
    (req as unknown as Record<string, unknown>)[part] = result.data;
    next();
  };
}
