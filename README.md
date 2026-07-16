**Project Title**: PINERP (Procurement Intelligence Network Enterprise Resource PLanning)

PINERP is an explainable, intelligence-first ERP designed for growing manufacturers that cannot afford enterprise consultants but still need enterprise-level visibility.
Traditional ERPs tell businesses what happened. PINERP tells them what is happening, why it is happening, and what they should do next.

**Contributors**
jaya mouthikhan 
preenithi
Vaishnav Adithya  
Balachandar  

**Problem Statement**

To build a Mini ERP System that digitally manages the complete business flow:
● Product Management
● Sales Management
● Purchase Management
● Manufacturing
● Bill of Materials (BoM)
● Inventory & Stock Tracking
● Procurement Automation

**Features**

Module 1 — Product Master
Product Code / Name, Dimensions / Specifications, Lead Time,
Cost Price / Sales Price, Vendor Product Mapping, Movement Rate, Minimum Order Quantity (MOQ)
Procurement Strategy (MTS or MTO), Procurement Type (Purchase or Manufacturing), BoM Link.

Module 2 — Sales + Procurement Intelligence Network (PIN)
Customer management, Sales Order creation, Stock availability check 
Delivery tracking, Automatic reservation, Procurement triggering.
PIN (Market Signals) — before confirming an order, the Sales screen shows any active signals (shortage / price change / delay / availability) reported against the products in the cart, sourced from any authenticated user acting as a field reporter (carpenter, contractor, dealer, supplier, warehouse partner, transporter, employee, procurement partner). This is a real internal mechanism, not a literal external crowdsourcing network — see Section 5 for the exact table.

Module 3 — Inventory & Stock Ledger
On Hand Quantity, Reserved Quantity, Free-to-Use Quantity — `On Hand − Reserved`; this is the number every availability check uses.
Real-time stock visibility, Low-stock alerts, Auto-suggested reorder quantities, Stock reconciliation,
Shortage detectionm, Stock Ledger

Module 4 — Procurement Automation & Intelligence
Procurement Engine, Automatic PO/MO creation, MTS Engine (predicts demand, manufactures/purchases in advance)
MTO Engine, Forecasting Engine ("AI-Enhanced Procurement")
Batch Purchase Optimization, Vendor Performance Intelligence
Profit-Driven Procurement Prioritization (Pareto Engine)

Module 5- Manufacturing

Bill of Materials (BoM), Work Orders
Manufacturing Capacity Visualization — charts work center utilization, throughput, capacity bottlenecks, and delayed queues for proactive production planning.

"Why Is It Late?" Causal Delay Tracer
Causal Delay Tracer — one click on any delayed order traces the dependency chain backward (e.g. SO delayed → MO blocked → screw shortage → PO pending → vendor delayed) and returns a plain-English explanation such as: "SO-145 is delayed because Manufacturing Order MO-87 could not proceed due to insufficient screws. Purchase Order PO-22 remains unfulfilled by Vendor X."
Procurement Link Graph — an auto-generated relationship table storing SO→MO, SO→PO, and MO→PO links, used to construct the dependency chain.
Recursive Trace Engine — uses a recursive SQL query (graph traversal) to walk the link graph backward to the root cause. No machine learning required.
Explanation Generator — converts the structured trace into plain English via deterministic templates, with optional LLM polishing for nicer phrasing.

Cross-Cutting Platform Features
Real-Time Visibility — WebSockets push order status changes, stock updates, delays, procurement events, and audit events to every connected dashboard instantly, with no manual refresh.
Role-Based Access Control — JWT + middleware; users only access the modules permitted by their role (see Roles table above).
Audit Log Module — tracks status changes, quantity updates, price changes, deliveries, procurement events, manufacturing completion, and user actions, for end-to-end traceability.

AI Operations Assistant — not a separate system; it packages outputs from the other deterministic engines into:
Data Integrity Monitoring — detects negative stock, missing stock records, suspicious inventory patterns.
Automated Daily Reports — summaries for inventory, sales, purchases, delays, and forecasting.
Predictions — demand trends, procurement requirements, MTO material needs (reuses the Forecasting Engine).
Strategic Recommendations — fast-moving products, profit drivers, procurement priorities (reuses the Pareto Engine + Vendor Performance Intelligence).
Real-Time Dashboard — home screen aggregating Sales (totals/pending/delayed), Inventory (low-stock/critical shortages), Manufacturing (bottlenecks/utilization), Procurement (pending POs/vendor performance), and Strategy (top profit contributors/forecast insights), all live via WebSocket.
Tier A Customer Portal — isolated external login (separate from internal RBAC) for customers to track orders, view delivery estimates, monitor reserved stock, leave reviews, and view communication history.

**Architecture**

<img width="782" height="528" alt="image" src="https://github.com/user-attachments/assets/87ac508f-1d5c-4197-bf83-b28d9c848517" />


**Tech Stack**

<img width="1235" height="413" alt="image" src="https://github.com/user-attachments/assets/1b873e00-d20b-4caa-aee6-219fe9939799" />


**Setup Instructions**

### Prerequisites

- Node.js 18+ and npm
- MySQL Server 8+ running locally (or a reachable MySQL instance)
- A MySQL user with permission to create databases (e.g. `root`)

### 1. Clone the repository

```bash
git clone https://github.com/jayamouthikhan2006/GOAL-DIGGERS-PINERP.git
cd GOAL-DIGGERS-PINERP
```

### 2. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS pinerp_db;"
```

### 3. Configure backend environment variables

Create `backend/.env` (copy `backend/.env.example` as a starting point) with:

```
DATABASE_URL="mysql://root:<your-mysql-password>@localhost:3306/pinerp_db"
JWT_INTERNAL_SECRET="<any-long-random-string>"
JWT_PORTAL_SECRET="<a-different-long-random-string>"
LLM_NARRATION_ENABLED=false
ANTHROPIC_API_KEY=""
PORT=4000
SMTP_USER=""
SMTP_APP_PASSWORD=""
FRONTEND_URL="http://localhost:5173"
```

**Important:** if your MySQL password contains special characters (`@`, `#`, `%`, etc.), percent-encode them in `DATABASE_URL` — `@` becomes `%40`. Example: a password `Pass@123` becomes `mysql://root:Pass%40123@localhost:3306/pinerp_db`. An un-encoded `@` in the password is parsed as the host separator and the connection will fail.

### 4. Configure frontend environment variables

Create `frontend/.env` with:

```
VITE_API_BASE_URL="http://localhost:4000"
```

### 5. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 6. Set up the database schema

From `backend/`:

```bash
npx prisma generate
npx prisma migrate deploy
```

If you see `Database schema is up to date!` but the app errors with a missing table (schema drift between `schema.prisma` and the committed migrations), reset and sync directly instead:

```bash
npx prisma db push --accept-data-loss
```

(Only run this against a fresh/empty dev database — it can drop and recreate tables.)

### 7. Seed demo data

```bash
npm run seed
```

This creates demo users, products, vendors, sales/purchase/manufacturing history, etc.
**Demo login:** any seeded `loginId` + password `Demo@1234`. Admin account: `admin` / `Demo@1234`.

### 8. Run the app (development)

In two separate terminals:

```bash
# Terminal 1 — backend (http://localhost:4000)
cd backend
npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

### 9. Useful backend scripts

```bash
npm run build          # compile TypeScript
npm start              # run the compiled build
npm run prisma:studio  # visual DB browser at http://localhost:5555
npm run prisma:migrate # create a new migration during development
```

### Deployment

- **Frontend** deploys cleanly to Vercel/Netlify as a static Vite build (`npm run build` → `dist/`). Set `VITE_API_BASE_URL` to your deployed backend's URL as an environment variable on the hosting platform, then rebuild.
- **Backend** needs a platform that runs a persistent Node process (it holds a MySQL connection pool and a Socket.io WebSocket server) — Vercel's serverless functions do not support this. Use Railway, Render, Fly.io, or a VPS instead. Set the same environment variables as `backend/.env` above (with production values, including `NODE_ENV=production`, a real `FRONTEND_URL`, and a managed MySQL database URL), then run `npx prisma migrate deploy` once during deploy before starting the server.
- In production, session cookies switch to `SameSite=None; Secure`, which requires the deployed site to be served over HTTPS.

ADMIN CREDENTIALS - admin 
password - Demo@1234


**Project Structure**

odoo-team-51/  
├── docs/  
│   └── PINERP_SPEC.md  
├── frontend/  
│   ├── src/  
│   │   ├── api/                 # salesApi.ts, inventoryApi.ts, procurementApi.ts, manufacturingApi.ts,  
│   │   │                        # vendorApi.ts, auditApi.ts, portalApi.ts, dashboardApi.ts  
│   │   ├── components/          # Navbar, Sidebar, AppShell, Table, Modal, Badge, ChartWrappers  
│   │   ├── features/            # sales/, inventory/, procurement/, manufacturing/, vendors/,  
│   │   │                        # dashboard/, audit/, portal/  
│   │   ├── hooks/                # useSocket.ts, useAuth.ts, useRole.ts  
│   │   ├── store/                 # Zustand: authStore.ts, cartStore.ts, dashboardStore.ts  
│   │   ├── layouts/                # AppShell.tsx — fixed TopNav + Sidebar, scrollable content panel only  
│   │   ├── routes/  
│   │   ├── types/  
│   │   └── main.tsx  
│   ├── .env.example  
│   ├── package.json  
│   └── vite.config.ts  
├── backend/  
│   ├── src/  
│   │   ├── modules/               # one folder per domain, each with routes.ts / controller.ts / service.ts / validation.ts  
│   │   │   ├── products/  
│   │   │   ├── sales/  
│   │   │   ├── inventory/  
│   │   │   ├── procurement/  
│   │   │   ├── manufacturing/  
│   │   │   ├── vendors/  
│   │   │   ├── signals/           # PIN market signals  
│   │   │   ├── audit/  
│   │   │   ├── portal/            # Tier A customer endpoints  
│   │   │   └── dashboard/  
│   │   ├── engines/                # cross-cutting deterministic engines, called by many modules  
│   │   │   ├── forecastingEngine.ts  
│   │   │   ├── paretoEngine.ts  
│   │   │   ├── vendorPerformanceEngine.ts  
│   │   │   ├── productionHealthEngine.ts  
│   │   │   ├── delayTracerEngine.ts  
│   │   │   ├── batchPurchaseOptimizer.ts  
│   │   │   └── dataIntegrityEngine.ts  
│   │   ├── middleware/  
│   │   │   ├── auth.middleware.ts        # internal JWT verify  
│   │   │   ├── rbac.middleware.ts        # per-route role check  
│   │   │   ├── portalAuth.middleware.ts  # isolated Tier A customer JWT  
│   │   │   ├── errorHandler.ts  
│   │   │   └── validateRequest.ts  
│   │   ├── sockets/  
│   │   │   ├── socket.server.ts  
│   │   │   └── events.ts            # central event-name registry  
│   │   ├── jobs/  
│   │   │   ├── dailyReports.job.ts  # node-cron  
│   │   │   └── lowStockAlert.job.ts  
│   │   ├── llm/  
│   │   │   └── narrate.ts           # optional, feature-flagged narration layer  
│   │   ├── prisma/  
│   │   │   ├── schema.prisma  
│   │   │   ├── migrations/  
│   │   │   └── seed.ts  
│   │   ├── config/  
│   │   │   └── env.ts  
│   │   └── app.ts / server.ts  
│   ├── .env.example  
│   ├── package.json  
│   └── tsconfig.json  
├── .gitignore  
├── package.json   # npm workspaces root + "dev" script running both servers via concurrently  
└── README.md  


API Documentation
Screenshots
