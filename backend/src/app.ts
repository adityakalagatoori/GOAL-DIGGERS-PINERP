import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { UPLOAD_ROOT } from "./middleware/upload.middleware";
import { authRouter, portalAuthRouter } from "./modules/auth/auth.routes";
import { usersRouter, meRouter } from "./modules/users/users.routes";
import { productsRouter } from "./modules/products/products.routes";
import { vendorsRouter } from "./modules/vendors/vendors.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { bomRouter } from "./modules/bom/bom.routes";
import { workCentersRouter } from "./modules/workCenters/workCenters.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { purchaseRouter } from "./modules/purchase/purchase.routes";
import { manufacturingRouter } from "./modules/manufacturing/manufacturing.routes";
import { signalsRouter } from "./modules/signals/signals.routes";
import { insightsRouter } from "./modules/insights/insights.routes";
import { productionHealthRouter } from "./modules/productionHealth/productionHealth.routes";
import { delayTraceRouter } from "./modules/delayTrace/delayTrace.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { pinRouter } from "./modules/pin/pin.routes";
import { intelHubRouter } from "./modules/intelHub/intelHub.routes";
import { portalRouter } from "./modules/portal/portal.routes";
// Enterprise modules
import { rolesRouter } from "./modules/roles/roles.routes";
import { departmentsRouter } from "./modules/departments/departments.routes";
import { branchesRouter } from "./modules/branches/branches.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { companyRouter } from "./modules/company/company.routes";
import { sessionsRouter } from "./modules/sessions/sessions.routes";


export function createApp(): Express {
  const app = express();

  // credentials: true + an explicit origin (never "*") are both required for
  // the browser to send/accept the HttpOnly session cookies cross-port.
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use("/uploads", express.static(UPLOAD_ROOT));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/portal/auth", portalAuthRouter);
  app.use("/api/users", usersRouter); // authMiddleware applied inside usersRouter
  app.use("/api/me", meRouter); // authMiddleware applied inside meRouter
  app.use("/api/products", productsRouter); // authMiddleware applied inside productsRouter
  app.use("/api/vendors", vendorsRouter); // authMiddleware applied inside vendorsRouter
  app.use("/api/customers", customersRouter); // authMiddleware applied inside customersRouter
  app.use("/api/bom", bomRouter); // authMiddleware applied inside bomRouter
  app.use("/api/work-centers", workCentersRouter);
  app.use("/api/sales", salesRouter); // authMiddleware applied inside salesRouter
  app.use("/api/purchase", purchaseRouter); // authMiddleware applied inside purchaseRouter
  app.use("/api/manufacturing", manufacturingRouter); // authMiddleware applied inside manufacturingRouter
  app.use("/api/signals", signalsRouter);
  app.use("/api/insights", insightsRouter);
  app.use("/api/production-health", productionHealthRouter);
  app.use("/api/delay-trace", delayTraceRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/pin", pinRouter);
  app.use("/api/intel-hub", intelHubRouter);
  app.use("/api/portal", portalRouter); // uses portalAuthMiddleware internally, not the internal one
  // Enterprise routes
  app.use("/api/roles", rolesRouter);
  app.use("/api/departments", departmentsRouter);
  app.use("/api/branches", branchesRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/company", companyRouter);
  app.use("/api/sessions", sessionsRouter);

  // Must be registered LAST, after every route, so thrown/rejected errors
  // from anywhere above land here.
  app.use(errorHandler);

  return app;
}
