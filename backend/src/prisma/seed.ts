import {
  PrismaClient,
  PermissionModule,
  SalesOrderStatus,
  PurchaseOrderStatus,
  ManufacturingOrderStatus,
  LinkEntityType,
  AuditAction,
  Severity,
  SignalSourceType,
  SignalType,
  IntelPostType,
  IntelPostStatus,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { DEFAULT_ROLES, ALL_MODULES } from "../modules/roles/roles.service";


const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo@1234";

// Exact field lists from the wireframe's User Management permission grid.
const SALES_FIELDS = [
  "Customer",
  "Customer Address",
  "Sales Person",
  "Product",
  "Ordered Quantity",
  "Delivered Quantity",
  "Sales Price",
  "Status",
  "Total",
  "Creation Date",
];
const PURCHASE_FIELDS = [
  "Vendor",
  "Vendor Address",
  "Responsible Person",
  "Product",
  "Ordered Quantity",
  "Received Quantity",
  "Cost Price",
  "Total",
  "Creation Date",
];
const MANUFACTURING_FIELDS = [
  "Product to Manufacture",
  "Product Quantity",
  "BoM",
  "Responsible Person",
  "Finished Quantity",
  "Creation Date",
];
const PRODUCT_FIELDS = [
  "Product",
  "Sales Price",
  "Cost Price",
  "On Hand Qty",
  "Free To Use Qty",
  "Procure On Demand",
  "Procurement Method",
  "Vendor",
  "Bill of Materials",
];

// Fields that can never be raw-edited/created/deleted regardless of who you are
// (system-computed or auto-populated) — matches the wireframe's "Auto Compute",
// "Recomputed", and "System Computed" annotations exactly.
const ALWAYS_RESTRICTED: Record<string, Record<string, Partial<PermFlags>>> = {
  Sales: {
    Total: { canCreate: false, canEdit: false, canDelete: false },
    "Creation Date": { canCreate: false, canEdit: false, canDelete: false },
  },
  Purchase: {
    Total: { canCreate: false, canEdit: false, canDelete: false },
    "Creation Date": { canCreate: false, canEdit: false, canDelete: false },
  },
  Manufacturing: {
    "Creation Date": { canCreate: false, canEdit: false, canDelete: false },
  },
  Product: {
    "On Hand Qty": { canDelete: false },
    "Free To Use Qty": { canCreate: false, canEdit: false, canDelete: false },
    "Procure On Demand": { canCreate: false },
    "Procurement Method": { canCreate: false },
  },
};

type PermFlags = { canCreate: boolean; canView: boolean; canEdit: boolean; canDelete: boolean };

async function grantAccess(
  userId: number,
  module: PermissionModule,
  moduleLabel: keyof typeof ALWAYS_RESTRICTED,
  fields: string[],
  base: PermFlags
) {
  for (const field of fields) {
    const restriction = ALWAYS_RESTRICTED[moduleLabel]?.[field] ?? {};
    const flags = { ...base, ...restriction };
    await prisma.permission.upsert({
      where: { userId_module_field: { userId, module, field } },
      update: flags,
      create: { userId, module, field, ...flags },
    });
  }
}

const FULL: PermFlags = { canCreate: true, canView: true, canEdit: true, canDelete: true };
const VIEW_ONLY: PermFlags = { canCreate: false, canView: true, canEdit: false, canDelete: false };

async function makeUser(opts: {
  loginId: string;
  email: string;
  name: string;
  position?: string;
  isAdmin?: boolean;
}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { loginId: opts.loginId },
    update: {},
    create: {
      loginId: opts.loginId,
      email: opts.email,
      passwordHash,
      name: opts.name,
      position: opts.position,
      isAdmin: opts.isAdmin ?? false,
    },
  });
}

async function main() {
  // ---------- Enterprise: Roles ----------
  for (const roleDef of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { label: roleDef.label },
      create: { name: roleDef.name, label: roleDef.label, isSystem: roleDef.isSystem },
    });
    for (const perm of roleDef.perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_module: { roleId: role.id, module: perm.module } },
        update: { canView: perm.canView, canCreate: perm.canCreate, canEdit: perm.canEdit, canDelete: perm.canDelete, canApprove: perm.canApprove, canExport: perm.canExport, canImport: perm.canImport },
        create: { roleId: role.id, module: perm.module, canView: perm.canView, canCreate: perm.canCreate, canEdit: perm.canEdit, canDelete: perm.canDelete, canApprove: perm.canApprove, canExport: perm.canExport, canImport: perm.canImport },
      });
    }
  }

  // ---------- Enterprise: Departments ----------
  const departmentNames = [
    "Sales", "Purchase", "Manufacturing", "Warehouse", "Inventory",
    "Finance", "HR", "Quality Control", "Engineering", "Management", "IT", "Admin",
  ];
  for (const name of departmentNames) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ---------- Enterprise: Branch ----------
  await prisma.branch.upsert({ where: { name: "HQ" }, update: {}, create: { name: "HQ", city: "Ahmedabad" } });

  // ---------- Enterprise: Company Settings ----------
  const existingSettings = await prisma.companySettings.findFirst();
  if (!existingSettings) {
    await prisma.companySettings.create({
      data: { companyName: "PINERP Company", currency: "INR", timezone: "Asia/Kolkata", financialYearStart: "04-01", taxPercentage: 18 },
    });
  }

  // Fetch role IDs for user assignment
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const getRoleId = (name: string) => roles.find((r) => r.name === name)?.id;
  const adminRole = getRoleId("system_administrator");
  const managerRole = getRoleId("manager");
  const salesRole = getRoleId("sales_executive");
  const purchaseRole = getRoleId("purchase_executive");
  const productionRole = getRoleId("production_manager");

  const depts = await prisma.department.findMany({ select: { id: true, name: true } });
  const getDeptId = (name: string) => depts.find((d) => d.name === name)?.id;

  // ---------- Users ----------
  const admin = await makeUser({
    loginId: "admin",
    email: "admin@pinerp.com",
    name: "System Administrator",
    isAdmin: true,
  });

  const mahesh = await makeUser({ loginId: "mahesh.gupta", email: "mahesh@pinerp.com", name: "Mahesh Gupta", position: "Sales Manager" });
  const nisarg = await makeUser({ loginId: "nisarg.verma", email: "nisarg@pinerp.com", name: "Nisarg Verma", position: "Purchase Executive" });
  const sweta = await makeUser({ loginId: "sweta.kediya", email: "sweta@pinerp.com", name: "Sweta Kediya", position: "Manufacturing Lead" });
  const dinesh = await makeUser({ loginId: "dinesh.patel", email: "dinesh@pinerp.com", name: "Dinesh Patel", position: "Inventory Manager" });
  const trisha = await makeUser({ loginId: "trisha.k", email: "trisha@pinerp.com", name: "Trisha K.", position: "Sales Executive" });

  // Operational users referenced as salesperson/responsible-person on seeded orders.
  const ravi = await makeUser({ loginId: "ravi.jadeja", email: "ravi@pinerp.com", name: "Ravi Jadeja", position: "Sales Executive" });
  const saloni = await makeUser({ loginId: "saloni.shaikh", email: "saloni@pinerp.com", name: "Saloni Shaikh", position: "Sales Executive" });
  const vijay = await makeUser({ loginId: "vijay.sharma", email: "vijay@pinerp.com", name: "Vijay Sharma", position: "Purchase Executive" });
  const john = await makeUser({ loginId: "john.doe", email: "john@pinerp.com", name: "John Doe", position: "Purchase Executive" });

  // ---------- Permissions (granular per-field grid — demonstrably varied per user) ----------

  // Mahesh Gupta: full grid across all 4 modules (matches the wireframe's own example exactly).
  await grantAccess(mahesh.id, PermissionModule.sales, "Sales", SALES_FIELDS, FULL);
  await grantAccess(mahesh.id, PermissionModule.purchase, "Purchase", PURCHASE_FIELDS, FULL);
  await grantAccess(mahesh.id, PermissionModule.manufacturing, "Manufacturing", MANUFACTURING_FIELDS, FULL);
  await grantAccess(mahesh.id, PermissionModule.product, "Product", PRODUCT_FIELDS, FULL);

  // Nisarg Verma: Purchase owner, product view-only, no Sales/Manufacturing access at all.
  await grantAccess(nisarg.id, PermissionModule.purchase, "Purchase", PURCHASE_FIELDS, FULL);
  await grantAccess(nisarg.id, PermissionModule.product, "Product", PRODUCT_FIELDS, VIEW_ONLY);

  // Sweta Kediya: Manufacturing owner, product view-only.
  await grantAccess(sweta.id, PermissionModule.manufacturing, "Manufacturing", MANUFACTURING_FIELDS, FULL);
  await grantAccess(sweta.id, PermissionModule.product, "Product", PRODUCT_FIELDS, VIEW_ONLY);

  // Dinesh Patel: Product/Inventory owner, view-only everywhere else.
  await grantAccess(dinesh.id, PermissionModule.product, "Product", PRODUCT_FIELDS, FULL);
  await grantAccess(dinesh.id, PermissionModule.sales, "Sales", SALES_FIELDS, VIEW_ONLY);
  await grantAccess(dinesh.id, PermissionModule.purchase, "Purchase", PURCHASE_FIELDS, VIEW_ONLY);
  await grantAccess(dinesh.id, PermissionModule.manufacturing, "Manufacturing", MANUFACTURING_FIELDS, VIEW_ONLY);

  // Trisha K.: Sales owner, product view-only.
  await grantAccess(trisha.id, PermissionModule.sales, "Sales", SALES_FIELDS, FULL);
  await grantAccess(trisha.id, PermissionModule.product, "Product", PRODUCT_FIELDS, VIEW_ONLY);

  // Operational users: just enough to operate their own module.
  await grantAccess(ravi.id, PermissionModule.sales, "Sales", SALES_FIELDS, FULL);
  await grantAccess(saloni.id, PermissionModule.sales, "Sales", SALES_FIELDS, FULL);
  await grantAccess(vijay.id, PermissionModule.purchase, "Purchase", PURCHASE_FIELDS, FULL);
  await grantAccess(john.id, PermissionModule.purchase, "Purchase", PURCHASE_FIELDS, FULL);

  // ---------- Customers ----------
  const suzuki = await prisma.customer.upsert({ where: { email: "accounts@suzukiindia.com" }, update: {}, create: { name: "Suzuki India", email: "accounts@suzukiindia.com" } });
  const mrf = await prisma.customer.upsert({ where: { email: "accounts@mrf.com" }, update: {}, create: { name: "MRF Ltd.", email: "accounts@mrf.com" } });
  const tata = await prisma.customer.upsert({ where: { email: "accounts@tatafurnishings.com" }, update: {}, create: { name: "Tata Furnishings", email: "accounts@tatafurnishings.com" } });

  // ---------- Vendors ----------
  const mayfair = await prisma.vendor.upsert({ where: { reference: "VEND-000001" }, update: {}, create: { reference: "VEND-000001", name: "Mayfair Co.", address: "Pune, MH" } });
  const oma = await prisma.vendor.upsert({ where: { reference: "VEND-000002" }, update: {}, create: { reference: "VEND-000002", name: "OMA Mahek", address: "Surat, GJ" } });
  const woodCo = await prisma.vendor.upsert({ where: { reference: "VEND-000003" }, update: {}, create: { reference: "VEND-000003", name: "Wood Co.", address: "Nagpur, MH" } });

  // ---------- Work Centers ----------
  const assemblyLine = await prisma.workCenter.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: "Assembly Line", shiftCapacityMins: 480 } });
  const paintFloor = await prisma.workCenter.upsert({ where: { id: 2 }, update: {}, create: { id: 2, name: "Paint Floor", shiftCapacityMins: 480 } });
  const packagingUnit = await prisma.workCenter.upsert({ where: { id: 3 }, update: {}, create: { id: 3, name: "Packaging Unit", shiftCapacityMins: 480 } });

  // ---------- Products (raw materials first, finished goods reference BoMs added after) ----------
  const woodenLegs = await prisma.product.upsert({
    where: { reference: "PROD-000003" },
    update: {},
    // Deliberately the tightest-stocked product (drives the PIN/Delay Tracer
    // demo narrative) but not so tight that 1000+ rows of bulk demand turns
    // its Free-to-Use into an absurd number across repeated demo runs.
    create: { reference: "PROD-000003", name: "Wooden Legs", salesPrice: 2, costPrice: 2, onHandQty: 20, leadTimeDays: 7, movementRate: 40, lowStockThreshold: 20, procureOnDemand: true, procurementMethod: "purchase", vendorId: woodCo.id },
  });
  const screws = await prisma.product.upsert({
    where: { reference: "PROD-000004" },
    update: {},
    create: { reference: "PROD-000004", name: "Screws", salesPrice: 0.5, costPrice: 0.5, onHandQty: 500, leadTimeDays: 3, movementRate: 120 },
  });
  const glassPanel = await prisma.product.upsert({
    where: { reference: "PROD-000005" },
    update: {},
    create: { reference: "PROD-000005", name: "Glass Panel", salesPrice: 4, costPrice: 4, onHandQty: 50, leadTimeDays: 5, movementRate: 5, procureOnDemand: true, procurementMethod: "purchase", vendorId: mayfair.id },
  });
  const frameClips = await prisma.product.upsert({
    where: { reference: "PROD-000006" },
    update: {},
    create: { reference: "PROD-000006", name: "Frame Clips", salesPrice: 0.3, costPrice: 0.3, onHandQty: 200, leadTimeDays: 3, movementRate: 20 },
  });

  const doorFrames = await prisma.product.upsert({
    where: { reference: "PROD-000001" },
    update: {},
    create: { reference: "PROD-000001", name: "Door Frames", salesPrice: 10, costPrice: 8, onHandQty: 50, leadTimeDays: 10, movementRate: 10, lowStockThreshold: 10, procureOnDemand: true, procurementMethod: "manufacturing" },
  });
  const lightingFrame = await prisma.product.upsert({
    where: { reference: "PROD-000002" },
    update: {},
    create: { reference: "PROD-000002", name: "Lighting Frame", salesPrice: 5, costPrice: 3, onHandQty: 12, leadTimeDays: 6, movementRate: 5, lowStockThreshold: 5, procureOnDemand: true, procurementMethod: "manufacturing" },
  });
  const diningChair = await prisma.product.upsert({
    where: { reference: "PROD-000007" },
    update: {},
    create: { reference: "PROD-000007", name: "Dining Chair", salesPrice: 15, costPrice: 9, onHandQty: 0, leadTimeDays: 8, movementRate: 5, lowStockThreshold: 5, procureOnDemand: true, procurementMethod: "manufacturing" },
  });

  // ---------- Bills of Materials ----------
  const bomDoorFrames = await prisma.bom.upsert({
    where: { reference: "BOM-000001" },
    update: {},
    create: {
      reference: "BOM-000001",
      productId: doorFrames.id,
      quantity: 10,
      components: { create: [
        { componentId: woodenLegs.id, toConsumeQty: 40 },
        { componentId: screws.id, toConsumeQty: 120 },
      ] },
      workOrderTemplates: { create: [
        { operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 60 },
        { operation: "Painting", workCenterId: paintFloor.id, expectedDurationMins: 30 },
        { operation: "Packing", workCenterId: packagingUnit.id, expectedDurationMins: 20 },
      ] },
    },
  });
  const bomLightingFrame = await prisma.bom.upsert({
    where: { reference: "BOM-000002" },
    update: {},
    create: {
      reference: "BOM-000002",
      productId: lightingFrame.id,
      quantity: 5,
      components: { create: [
        { componentId: glassPanel.id, toConsumeQty: 5 },
        { componentId: frameClips.id, toConsumeQty: 20 },
      ] },
      workOrderTemplates: { create: [
        { operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 30 },
        { operation: "Packing", workCenterId: packagingUnit.id, expectedDurationMins: 15 },
      ] },
    },
  });
  const bomDiningChair = await prisma.bom.upsert({
    where: { reference: "BOM-000003" },
    update: {},
    create: {
      reference: "BOM-000003",
      productId: diningChair.id,
      quantity: 1,
      components: { create: [
        { componentId: woodenLegs.id, toConsumeQty: 4 },
        { componentId: screws.id, toConsumeQty: 8 },
      ] },
      workOrderTemplates: { create: [
        { operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 25 },
      ] },
    },
  });

  await prisma.product.update({ where: { id: doorFrames.id }, data: { bomId: bomDoorFrames.id } });
  await prisma.product.update({ where: { id: lightingFrame.id }, data: { bomId: bomLightingFrame.id } });
  await prisma.product.update({ where: { id: diningChair.id }, data: { bomId: bomDiningChair.id } });

  // ---------- Sales Orders ----------
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  const so1 = await prisma.salesOrder.upsert({
    where: { reference: "SO-000001" },
    update: {},
    create: {
      reference: "SO-000001", customerId: suzuki.id, customerAddress: "Gurgaon, HR", salesPersonId: ravi.id,
      status: SalesOrderStatus.confirmed,
      lines: { create: [{ productId: doorFrames.id, orderedQty: 10, deliveredQty: 0, salesUnitPrice: 10 }] },
    },
  });
  const so2 = await prisma.salesOrder.upsert({
    where: { reference: "SO-000002" },
    update: {},
    create: {
      reference: "SO-000002", customerId: mrf.id, customerAddress: "Chennai, TN", salesPersonId: saloni.id,
      status: SalesOrderStatus.partially_delivered,
      lines: { create: [{ productId: lightingFrame.id, orderedQty: 8, deliveredQty: 3, salesUnitPrice: 5 }] },
    },
  });
  const so3 = await prisma.salesOrder.upsert({
    where: { reference: "SO-000003" },
    update: {},
    create: {
      reference: "SO-000003", customerId: tata.id, customerAddress: "Nashik, MH", salesPersonId: trisha.id,
      status: SalesOrderStatus.confirmed, createdAt: tenDaysAgo,
      lines: { create: [{ productId: diningChair.id, orderedQty: 5, deliveredQty: 0, salesUnitPrice: 15 }] },
    },
  });

  // ---------- Purchase Orders ----------
  const po1 = await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000001" },
    update: {},
    create: {
      reference: "PO-000001", vendorId: mayfair.id, vendorAddress: "Pune, MH", responsiblePersonId: vijay.id,
      status: PurchaseOrderStatus.confirmed,
      lines: { create: [{ productId: glassPanel.id, orderedQty: 30, receivedQty: 0, costUnitPrice: 4 }] },
    },
  });
  const po2 = await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000002" },
    update: {},
    create: {
      reference: "PO-000002", vendorId: oma.id, vendorAddress: "Surat, GJ", responsiblePersonId: john.id,
      status: PurchaseOrderStatus.draft,
      lines: { create: [{ productId: frameClips.id, orderedQty: 100, receivedQty: 0, costUnitPrice: 0.3 }] },
    },
  });
  // The deliberately overdue PO — still Confirmed, not received, backdated, blocking MO-000003.
  const po3 = await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000003" },
    update: {},
    create: {
      reference: "PO-000003", vendorId: woodCo.id, vendorAddress: "Nagpur, MH", responsiblePersonId: nisarg.id,
      status: PurchaseOrderStatus.confirmed, createdAt: tenDaysAgo,
      lines: { create: [{ productId: woodenLegs.id, orderedQty: 15, receivedQty: 0, costUnitPrice: 2 }] },
    },
  });

  // ---------- Manufacturing Orders ----------
  const mo1 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000001" },
    update: {},
    create: {
      reference: "MO-000001", finishedProductId: doorFrames.id, quantity: 10, bomId: bomDoorFrames.id, assigneeId: sweta.id,
      status: ManufacturingOrderStatus.confirmed,
      components: { create: [
        { productId: woodenLegs.id, toConsumeQty: 40, consumedQty: 0 }, // Not Available: stock (5) < needed (40)
        { productId: screws.id, toConsumeQty: 120, consumedQty: 0 },
      ] },
    },
  });
  const mo2 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000002" },
    update: {},
    create: {
      reference: "MO-000002", finishedProductId: lightingFrame.id, quantity: 5, bomId: bomLightingFrame.id, assigneeId: sweta.id,
      status: ManufacturingOrderStatus.draft,
      components: { create: [
        { productId: glassPanel.id, toConsumeQty: 5, consumedQty: 0 }, // Available
        { productId: frameClips.id, toConsumeQty: 20, consumedQty: 0 },
      ] },
    },
  });
  // The blocked MO in the overdue chain.
  const mo3 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000003" },
    update: {},
    create: {
      reference: "MO-000003", finishedProductId: diningChair.id, quantity: 5, bomId: bomDiningChair.id, assigneeId: sweta.id,
      status: ManufacturingOrderStatus.confirmed, createdAt: tenDaysAgo,
      components: { create: [
        { productId: woodenLegs.id, toConsumeQty: 20, consumedQty: 0 }, // Not Available: stock (5) < needed (20)
        { productId: screws.id, toConsumeQty: 8, consumedQty: 0 },
      ] },
    },
  });

  // ---------- Procurement Link graph (powers the Delay Tracer demo) ----------
  // Chain 1 — the deepest/blocked chain: SO-000003 (Dining Chair) is blocked
  // by MO-000003, which is blocked by PO-000003 (root cause, Wooden Legs from
  // Wood Co.). Deliberately the SAME product (Wooden Legs) that already has
  // the two corroborating PIN shortage signals seeded above — opening the
  // tracer here and then the PIN checkpoint on a Wooden Legs order shows both
  // features pointing at the same underlying reality, not two disconnected demos.
  await prisma.procurementLink.createMany({
    data: [
      { parentType: LinkEntityType.manufacturing_order, parentId: mo3.id, childType: LinkEntityType.sales_order, childId: so3.id, reason: "stock_shortage" },
      { parentType: LinkEntityType.purchase_order, parentId: po3.id, childType: LinkEntityType.manufacturing_order, childId: mo3.id, reason: "component_shortage" },
    ],
    skipDuplicates: true,
  });

  // Chain 2 — shallow, two hops, no manufacturing step at all: a Glass Panel
  // order (purchased directly, no BoM) blocked by a single overdue PO. Shows
  // the tracer isn't hardcoded to a fixed chain depth.
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  const so300 = await prisma.salesOrder.upsert({
    where: { reference: "SO-000700" },
    update: {},
    create: {
      reference: "SO-000700", customerId: mrf.id, customerAddress: "Chennai, TN", salesPersonId: saloni.id,
      status: SalesOrderStatus.confirmed, createdAt: twentyDaysAgo,
      lines: { create: [{ productId: glassPanel.id, orderedQty: 80, deliveredQty: 0, salesUnitPrice: 4 }] },
    },
  });
  const po300 = await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000700" },
    update: {},
    create: {
      reference: "PO-000700", vendorId: mayfair.id, vendorAddress: "Pune, MH", responsiblePersonId: vijay.id,
      status: PurchaseOrderStatus.confirmed, createdAt: twentyDaysAgo, dueDate: fifteenDaysAgo,
      lines: { create: [{ productId: glassPanel.id, orderedQty: 30, receivedQty: 0, costUnitPrice: 4 }] },
    },
  });
  await prisma.procurementLink.createMany({
    data: [{ parentType: LinkEntityType.purchase_order, parentId: po300.id, childType: LinkEntityType.sales_order, childId: so300.id, reason: "stock_shortage" }],
    skipDuplicates: true,
  });
  await prisma.auditLog.create({
    data: { module: "purchase", entity: "PurchaseOrder", recordId: po300.id, recordRef: po300.reference, action: AuditAction.created, userId: vijay.id, createdAt: twentyDaysAgo },
  });

  // Chain 3 — fully resolved: SO -> MO -> PO all reached a terminal status, so
  // the tracer can demonstrate what a clean timeline looks like, not only bad news.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const twentyFiveDaysAgo = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
  const twentyTwoDaysAgo = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
  const so301 = await prisma.salesOrder.upsert({
    where: { reference: "SO-000701" },
    update: {},
    create: {
      reference: "SO-000701", customerId: tata.id, customerAddress: "Nashik, MH", salesPersonId: ravi.id,
      status: SalesOrderStatus.fully_delivered, createdAt: thirtyDaysAgo,
      lines: { create: [{ productId: lightingFrame.id, orderedQty: 5, deliveredQty: 5, salesUnitPrice: 5 }] },
    },
  });
  const mo301 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000701" },
    update: {},
    create: {
      reference: "MO-000701", finishedProductId: lightingFrame.id, quantity: 5, bomId: bomLightingFrame.id, assigneeId: sweta.id,
      status: ManufacturingOrderStatus.done, createdAt: twentyEightDaysAgo,
      components: { create: [
        { productId: glassPanel.id, toConsumeQty: 5, consumedQty: 5 },
        { productId: frameClips.id, toConsumeQty: 20, consumedQty: 20 },
      ] },
    },
  });
  const po301 = await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000701" },
    update: {},
    create: {
      reference: "PO-000701", vendorId: mayfair.id, vendorAddress: "Pune, MH", responsiblePersonId: john.id,
      status: PurchaseOrderStatus.fully_received, createdAt: twentyEightDaysAgo, dueDate: twentyFiveDaysAgo,
      lines: { create: [{ productId: glassPanel.id, orderedQty: 5, receivedQty: 5, costUnitPrice: 4 }] },
    },
  });
  await prisma.procurementLink.createMany({
    data: [
      { parentType: LinkEntityType.manufacturing_order, parentId: mo301.id, childType: LinkEntityType.sales_order, childId: so301.id, reason: "stock_shortage" },
      { parentType: LinkEntityType.purchase_order, parentId: po301.id, childType: LinkEntityType.manufacturing_order, childId: mo301.id, reason: "component_shortage" },
    ],
    skipDuplicates: true,
  });
  await prisma.auditLog.createMany({
    data: [
      { module: "purchase", entity: "PurchaseOrder", recordId: po301.id, recordRef: po301.reference, action: AuditAction.created, userId: john.id, createdAt: twentyEightDaysAgo },
      { module: "purchase", entity: "PurchaseOrder", recordId: po301.id, recordRef: po301.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "fully_received", userId: john.id, createdAt: twentyTwoDaysAgo },
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo301.id, recordRef: mo301.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "done", userId: sweta.id, createdAt: twentyTwoDaysAgo },
      { module: "sales", entity: "SalesOrder", recordId: so301.id, recordRef: so301.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "fully_delivered", userId: ravi.id, createdAt: twentyTwoDaysAgo },
    ],
  });

  // ---------- "In Progress" vs "To Close" demo Manufacturing Orders ----------
  // The dashboard's In Progress / To Close split (dashboard.service.ts ->
  // splitInProgressManufacturingOrders) only ever looks at MOs with status
  // "in_progress" — none of the MOs above use that status, so without this
  // block the dashboard's two pills always show 0/0 and there's nothing to
  // demo. isReadyToClose() is computed live from consumedQty vs toConsumeQty
  // on each component — fully consumed = "To Close", partial/zero = "In Progress".
  // Half assigned to admin (so "My" pills aren't empty when logged in as admin
  // during the demo), half to Sweta (so "All" shows a real difference from "My").
  const mo302 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000302" },
    update: {},
    create: {
      reference: "MO-000302", finishedProductId: doorFrames.id, quantity: 10, bomId: bomDoorFrames.id, assigneeId: admin.id,
      status: ManufacturingOrderStatus.in_progress,
      components: { create: [
        { productId: woodenLegs.id, toConsumeQty: 40, consumedQty: 20 }, // half consumed -> In Progress
        { productId: screws.id, toConsumeQty: 120, consumedQty: 60 },
      ] },
      // Production Health only reads MoWorkOrder rows on "in_progress" MOs —
      // without these, every Work Center shows 0% utilization regardless of
      // how busy the floor actually is. Matches BOM-000001's own template
      // durations (qty 10 = the BoM's own baseline, so no scaling needed here).
      workOrders: { create: [
        { operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 60, realDurationMins: 65 },
        { operation: "Painting", workCenterId: paintFloor.id, expectedDurationMins: 30 },
        { operation: "Packing", workCenterId: packagingUnit.id, expectedDurationMins: 20 },
      ] },
    },
  });
  const mo303 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000303" },
    update: {},
    create: {
      reference: "MO-000303", finishedProductId: lightingFrame.id, quantity: 5, bomId: bomLightingFrame.id, assigneeId: admin.id,
      status: ManufacturingOrderStatus.in_progress,
      components: { create: [
        { productId: glassPanel.id, toConsumeQty: 5, consumedQty: 5 }, // fully consumed -> To Close
        { productId: frameClips.id, toConsumeQty: 20, consumedQty: 20 },
      ] },
      workOrders: { create: [
        { operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 30 },
        { operation: "Packing", workCenterId: packagingUnit.id, expectedDurationMins: 15 },
      ] },
    },
  });
  const mo304 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000304" },
    update: {},
    create: {
      reference: "MO-000304", finishedProductId: diningChair.id, quantity: 3, bomId: bomDiningChair.id, assigneeId: sweta.id,
      status: ManufacturingOrderStatus.in_progress,
      components: { create: [
        { productId: woodenLegs.id, toConsumeQty: 12, consumedQty: 4 }, // partial -> In Progress
        { productId: screws.id, toConsumeQty: 24, consumedQty: 10 },
      ] },
      // Dining Chair's BoM is per-unit (qty 1 baseline), so qty 3 scales 25min -> 75min.
      workOrders: { create: [{ operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 75, realDurationMins: 40 }] },
    },
  });
  const mo305 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000305" },
    update: {},
    create: {
      reference: "MO-000305", finishedProductId: doorFrames.id, quantity: 5, bomId: bomDoorFrames.id, assigneeId: sweta.id,
      status: ManufacturingOrderStatus.in_progress,
      components: { create: [
        { productId: woodenLegs.id, toConsumeQty: 20, consumedQty: 20 }, // fully consumed -> To Close
        { productId: screws.id, toConsumeQty: 60, consumedQty: 60 },
      ] },
      // Half of BOM-000001's qty-10 baseline.
      workOrders: { create: [
        { operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 30, realDurationMins: 30 },
        { operation: "Painting", workCenterId: paintFloor.id, expectedDurationMins: 15, realDurationMins: 15 },
        { operation: "Packing", workCenterId: packagingUnit.id, expectedDurationMins: 10, realDurationMins: 10 },
      ] },
    },
  });
  const mo306 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000306" },
    update: {},
    create: {
      reference: "MO-000306", finishedProductId: lightingFrame.id, quantity: 2, bomId: bomLightingFrame.id, assigneeId: sweta.id,
      status: ManufacturingOrderStatus.in_progress,
      components: { create: [
        { productId: glassPanel.id, toConsumeQty: 2, consumedQty: 0 }, // nothing consumed yet -> In Progress
        { productId: frameClips.id, toConsumeQty: 8, consumedQty: 0 },
      ] },
      workOrders: { create: [
        { operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 12 },
        { operation: "Packing", workCenterId: packagingUnit.id, expectedDurationMins: 6 },
      ] },
    },
  });
  const mo307 = await prisma.manufacturingOrder.upsert({
    where: { reference: "MO-000307" },
    update: {},
    create: {
      reference: "MO-000307", finishedProductId: diningChair.id, quantity: 1, bomId: bomDiningChair.id, assigneeId: admin.id,
      status: ManufacturingOrderStatus.in_progress,
      components: { create: [
        { productId: woodenLegs.id, toConsumeQty: 4, consumedQty: 4 }, // fully consumed -> To Close
        { productId: screws.id, toConsumeQty: 8, consumedQty: 8 },
      ] },
      workOrders: { create: [{ operation: "Assembly", workCenterId: assemblyLine.id, expectedDurationMins: 25, realDurationMins: 25 }] },
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo302.id, recordRef: mo302.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "in_progress", userId: admin.id },
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo303.id, recordRef: mo303.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "in_progress", userId: admin.id },
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo304.id, recordRef: mo304.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "in_progress", userId: sweta.id },
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo305.id, recordRef: mo305.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "in_progress", userId: sweta.id },
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo306.id, recordRef: mo306.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "in_progress", userId: sweta.id },
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo307.id, recordRef: mo307.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "confirmed", newValue: "in_progress", userId: admin.id },
    ],
  });

  // ---------- Bulk historical Manufacturing Orders (volume + realism for the Dashboard demo) ----------
  // ~26 more MOs spread across statuses/months/assignees so the Manufacturing
  // card on the Dashboard shows real numbers everywhere (Draft/Confirmed/Done/
  // Cancelled/Late, plus more In Progress vs To Close variety) instead of the
  // thin counts the hand-crafted MOs above produce on their own.
  const moBlueprints = [
    {
      product: doorFrames, bom: bomDoorFrames, perUnit: [{ p: woodenLegs, qty: 4 }, { p: screws, qty: 12 }],
      workOrdersPerUnit: [
        { operation: "Assembly", workCenter: assemblyLine, mins: 6 },
        { operation: "Painting", workCenter: paintFloor, mins: 3 },
        { operation: "Packing", workCenter: packagingUnit, mins: 2 },
      ],
    },
    {
      product: lightingFrame, bom: bomLightingFrame, perUnit: [{ p: glassPanel, qty: 1 }, { p: frameClips, qty: 4 }],
      workOrdersPerUnit: [
        { operation: "Assembly", workCenter: assemblyLine, mins: 6 },
        { operation: "Packing", workCenter: packagingUnit, mins: 3 },
      ],
    },
    {
      product: diningChair, bom: bomDiningChair, perUnit: [{ p: woodenLegs, qty: 4 }, { p: screws, qty: 8 }],
      workOrdersPerUnit: [{ operation: "Assembly", workCenter: assemblyLine, mins: 25 }],
    },
  ];
  const moAssignees = [sweta, sweta, sweta, admin]; // Sweta (Manufacturing Lead) gets most, admin gets some for "My" pill variety
  const MO_BULK_COUNT = 140;
  let moCounter = 308;

  for (let i = 0; i < MO_BULK_COUNT; i++) {
    const blueprint = pick(moBlueprints);
    const qty = randomInt(1, 8);
    const monthsAgo = randomInt(0, 7);
    const createdAt = dayInMonthsAgo(monthsAgo);
    const assignee = pick(moAssignees);

    const roll = Math.random();
    let status: ManufacturingOrderStatus;
    let consumedRatio: number; // fraction of toConsumeQty actually consumed so far

    // Same resolution rule as the Sales Order history: anything older than
    // the current month is treated as already worked through (Done or
    // Cancelled) so component reservations don't keep stacking forever as
    // more months of history get seeded. Only the current month is live,
    // open backlog (Draft/Confirmed/In Progress mix).
    if (monthsAgo > 0) {
      if (roll < 0.85) { status = ManufacturingOrderStatus.done; consumedRatio = 1; }
      else { status = ManufacturingOrderStatus.cancelled; consumedRatio = 0; }
    } else if (roll < 0.15) { status = ManufacturingOrderStatus.draft; consumedRatio = 0; }
    else if (roll < 0.35) { status = ManufacturingOrderStatus.confirmed; consumedRatio = 0; }
    else if (roll < 0.65) { status = ManufacturingOrderStatus.in_progress; consumedRatio = Math.random() < 0.5 ? 1 : Math.random() * 0.8; }
    else if (roll < 0.9) { status = ManufacturingOrderStatus.done; consumedRatio = 1; }
    else { status = ManufacturingOrderStatus.cancelled; consumedRatio = 0; }

    // ~20% of still-open orders get a schedule date already in the past, so the Manufacturing "Late" pill has real data too.
    const isOpen = status === "confirmed" || status === "in_progress";
    const scheduleDate = isOpen && Math.random() < 0.2 ? dayInMonthsAgo(0) : null;

    await prisma.manufacturingOrder.create({
      data: {
        reference: `MO-${String(moCounter++).padStart(6, "0")}`,
        finishedProductId: blueprint.product.id,
        quantity: qty,
        bomId: blueprint.bom.id,
        assigneeId: assignee.id,
        status,
        createdAt,
        scheduleDate,
        components: {
          create: blueprint.perUnit.map((c) => ({
            productId: c.p.id,
            toConsumeQty: c.qty * qty,
            consumedQty: Math.round(c.qty * qty * consumedRatio),
          })),
        },
        // Production Health only reads MoWorkOrder rows on "in_progress"
        // orders, so that's the only status worth spending the extra rows on.
        ...(status === "in_progress" ? {
          workOrders: {
            create: blueprint.workOrdersPerUnit.map((w) => ({
              operation: w.operation,
              workCenterId: w.workCenter.id,
              expectedDurationMins: Math.round(w.mins * qty),
              realDurationMins: Math.random() < 0.4 ? Math.round(w.mins * qty * (0.8 + Math.random() * 0.4)) : null,
            })),
          },
        } : {}),
      },
    });
  }

  // ---------- Opening stock ledger entries ----------
  const openingStock: Array<[number, number]> = [
    [doorFrames.id, 50], [lightingFrame.id, 12], [woodenLegs.id, 5],
    [screws.id, 500], [glassPanel.id, 50], [frameClips.id, 200], [diningChair.id, 0],
  ];
  for (const [productId, qty] of openingStock) {
    await prisma.stockLedger.create({
      data: { productId, qtyChange: qty, refType: "opening_balance", refId: 0, reason: "Initial seed stock", userId: admin.id },
    });
  }

  // ---------- Sample audit log entries (demo non-empty before any real action happens) ----------
  await prisma.auditLog.createMany({
    data: [
      { module: "sales", entity: "SalesOrder", recordId: so1.id, recordRef: so1.reference, action: AuditAction.created, userId: ravi.id },
      { module: "sales", entity: "SalesOrder", recordId: so1.id, recordRef: so1.reference, action: AuditAction.updated, fieldChanged: "Status", oldValue: "draft", newValue: "confirmed", userId: ravi.id },
      { module: "purchase", entity: "PurchaseOrder", recordId: po3.id, recordRef: po3.reference, action: AuditAction.created, userId: nisarg.id },
      { module: "manufacturing", entity: "ManufacturingOrder", recordId: mo3.id, recordRef: mo3.reference, action: AuditAction.created, userId: sweta.id },
      { module: "product", entity: "Product", recordId: woodenLegs.id, recordRef: woodenLegs.reference, action: AuditAction.updated, fieldChanged: "On Hand Qty", oldValue: "45", newValue: "5", userId: dinesh.id },
    ],
  });

  // ---------- PIN: Vendor Offers (real alt-vendor price/lead-time quotes that VENDOR_SWITCH / EXPEDITE compute their numbers from) ----------
  await prisma.vendorOffer.createMany({
    data: [
      // Wooden Legs: current vendor (Wood Co.) can expedite; Mayfair and OMA are real, pricier-but-faster alternates.
      { vendorId: woodCo.id, productId: woodenLegs.id, unitPrice: 2, leadTimeDays: 7, expediteAvailable: true, expediteFee: 50, expediteLeadDays: 3 },
      { vendorId: mayfair.id, productId: woodenLegs.id, unitPrice: 2.3, leadTimeDays: 4 },
      { vendorId: oma.id, productId: woodenLegs.id, unitPrice: 2.6, leadTimeDays: 3 },
      // Glass Panel: current vendor (Mayfair) has NO expedite option on file — EXPEDITE should not appear for it.
      { vendorId: mayfair.id, productId: glassPanel.id, unitPrice: 4, leadTimeDays: 5, expediteAvailable: false },
      { vendorId: woodCo.id, productId: glassPanel.id, unitPrice: 3.6, leadTimeDays: 8 },
    ],
    skipDuplicates: true,
  });

  // ---------- PIN: Market Signals seeded to exercise every branch of the confidence formula and recommendation engine ----------
  const sevenDaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
  await prisma.marketSignal.createMany({
    data: [
      // Wooden Legs: TWO corroborating reporter types (supplier + transporter), both recent
      //   -> 60% base + 25% multi-source bonus = 85% confidence. Drives EXPEDITE + VENDOR_SWITCH
      //      (+ QTY_ADJUST, since existing reservations already exceed on-hand stock).
      { sourceType: SignalSourceType.supplier, productId: woodenLegs.id, signalType: SignalType.shortage, description: "Wood Co. reports a regional timber shortage affecting Wooden Legs supply for the next 2 weeks.", severity: Severity.high, reportedByUserId: nisarg.id },
      { sourceType: SignalSourceType.transporter, productId: woodenLegs.id, signalType: SignalType.shortage, description: "Transporter confirms inbound Wooden Legs shipments from Wood Co. are delayed at the depot.", severity: Severity.high, reportedByUserId: vijay.id },

      // Glass Panel: ONE reporter type only -> 60% confidence exactly (single-source base, no bonus).
      // Drives VENDOR_SWITCH only (no EXPEDITE — current vendor doesn't offer it).
      { sourceType: SignalSourceType.supplier, productId: glassPanel.id, signalType: SignalType.shortage, description: "Mayfair Co. flags reduced Glass Panel output this month due to a furnace maintenance window.", severity: Severity.medium, reportedByUserId: dinesh.id },
      { sourceType: SignalSourceType.warehouse_partner, productId: glassPanel.id, signalType: SignalType.availability, description: "Warehouse partner confirms remaining Glass Panel stock is available for immediate dispatch.", severity: Severity.low, reportedByUserId: dinesh.id },

      // Frame Clips: ONE reporter type, backdated past the 7-day age threshold -> 60% - 10% = 50%.
      // No vendor offers exist for Frame Clips, so recommendations fall back to Accept Risk only.
      { sourceType: SignalSourceType.employee, productId: frameClips.id, signalType: SignalType.shortage, description: "Floor staff flagged Frame Clips running low faster than expected on the assembly line.", severity: Severity.high, reportedByUserId: john.id, reportedAt: sevenDaysAgo },

      // Dining Chair: a price_change signal on a MANUFACTURED (not purchased) product -> no vendor
      // quotes apply at all, so recommendations are Accept Risk only, contrasting with Wooden Legs's richer set.
      { sourceType: SignalSourceType.procurement_partner, productId: diningChair.id, signalType: SignalType.price_change, description: "Procurement partner notes raw material cost pressure likely to raise Dining Chair input costs.", severity: Severity.medium, reportedByUserId: nisarg.id },

      // General/non-product signals (variety for the plain Market Signals list — not part of the PIN checkpoint, since they carry no productId).
      { sourceType: SignalSourceType.carpenter, productId: doorFrames.id, signalType: SignalType.delay, description: "Local carpentry contractor is running 2 weeks behind on Door Frame assembly jobs.", severity: Severity.medium, reportedByUserId: sweta.id },
      { sourceType: SignalSourceType.contractor, category: "Interior Fittings", signalType: SignalType.shortage, description: "Contractor network reports a city-wide shortage of interior fitting hardware.", severity: Severity.medium, reportedByUserId: mahesh.id },
      { sourceType: SignalSourceType.dealer, productId: lightingFrame.id, signalType: SignalType.price_change, description: "Dealer network flags a 12% price increase on Lighting Frame fittings from next quarter.", severity: Severity.low, reportedByUserId: trisha.id },
      { sourceType: SignalSourceType.transporter, category: "Logistics", signalType: SignalType.delay, description: "Transporter reports highway congestion adding 3-4 days to inbound shipments this week.", severity: Severity.medium, reportedByUserId: vijay.id },
      // Screws: deliberately left with ZERO signals — the PIN modal's "checked, found nothing" control case.
    ],
  });

  // ---------- Bulk historical Sales Orders (drives Demand Forecasting + Pareto Analysis) ----------
  // 7 months x 3 finished products x 12 orders/month ≈ 252 orders, so both the
  // 3-month-minimum moving-average forecast and the Pareto profit ranking have
  // real multi-product, multi-month history to compute over instead of a
  // single seed row each.
  const histCustomers = [suzuki, mrf, tata];
  const histSalesPeople = [ravi, saloni, trisha];
  const histProducts = [doorFrames, lightingFrame, diningChair];
  const MONTHS_BACK = 8;
  const ORDERS_PER_PRODUCT_PER_MONTH = 18;

  function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick<T>(arr: T[]): T {
    return arr[randomInt(0, arr.length - 1)];
  }

  function dayInMonthsAgo(monthsAgo: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    d.setDate(randomInt(1, 27));
    d.setHours(randomInt(8, 18), randomInt(0, 59), 0, 0);
    return d;
  }

  type HistOrder = {
    product: typeof doorFrames;
    createdAt: Date;
    orderedQty: number;
    deliveredQty: number;
    status: SalesOrderStatus;
    customer: typeof suzuki;
    salesPerson: typeof ravi;
  };

  const histOrders: HistOrder[] = [];
  for (let monthsAgo = MONTHS_BACK; monthsAgo >= 0; monthsAgo--) {
    for (const product of histProducts) {
      for (let i = 0; i < ORDERS_PER_PRODUCT_PER_MONTH; i++) {
        const orderedQty = randomInt(2, 9);
        const roll = Math.random();
        let deliveredQty: number;
        let status: SalesOrderStatus;

        // Orders older than the current month are treated as already worked
        // through the pipeline — resolved (delivered or cancelled) — so stock
        // reservations don't keep accumulating forever the more months of
        // history we seed. Only the CURRENT month represents live, open
        // backlog (mixed confirmed/partial/draft), which is what should
        // actually still be reserving stock during a demo.
        if (monthsAgo > 0) {
          if (roll < 0.92) { deliveredQty = orderedQty; status = SalesOrderStatus.fully_delivered; }
          else { deliveredQty = 0; status = SalesOrderStatus.cancelled; }
        } else if (roll < 0.55) {
          deliveredQty = orderedQty;
          status = SalesOrderStatus.fully_delivered;
        } else if (roll < 0.75) {
          deliveredQty = randomInt(1, orderedQty - 1 || 1);
          status = SalesOrderStatus.partially_delivered;
        } else if (roll < 0.92) {
          deliveredQty = 0;
          status = SalesOrderStatus.confirmed;
        } else {
          deliveredQty = 0;
          status = SalesOrderStatus.cancelled;
        }

        histOrders.push({
          product,
          createdAt: dayInMonthsAgo(monthsAgo),
          orderedQty,
          deliveredQty,
          status,
          customer: pick(histCustomers),
          salesPerson: pick(histSalesPeople),
        });
      }
    }
  }

  // Pre-credit each product with exactly the stock this synthetic history will
  // consume, via one dated "opening_balance" ledger entry, so onHandQty ends
  // back at its original seeded value once every delivery below has been
  // applied — the demo's low-stock narrative for these products is untouched.
  const totalDeliveredByProduct = new Map<number, number>();
  for (const o of histOrders) {
    totalDeliveredByProduct.set(o.product.id, (totalDeliveredByProduct.get(o.product.id) ?? 0) + o.deliveredQty);
  }
  const historyStart = dayInMonthsAgo(MONTHS_BACK + 1);
  for (const [productId, totalQty] of totalDeliveredByProduct.entries()) {
    if (totalQty <= 0) continue;
    await prisma.stockLedger.create({
      data: { productId, qtyChange: totalQty, refType: "opening_balance", refId: 0, reason: "Historical buffer for seeded sales history", userId: admin.id, createdAt: historyStart },
    });
    await prisma.product.update({ where: { id: productId }, data: { onHandQty: { increment: totalQty } } });
  }

  let soCounter = 4;
  for (const o of histOrders) {
    const reference = `SO-${String(soCounter).padStart(6, "0")}`;
    soCounter++;
    const so = await prisma.salesOrder.create({
      data: {
        reference,
        customerId: o.customer.id,
        customerAddress: o.customer.name,
        salesPersonId: o.salesPerson.id,
        status: o.status,
        createdAt: o.createdAt,
        lines: { create: [{ productId: o.product.id, orderedQty: o.orderedQty, deliveredQty: o.deliveredQty, salesUnitPrice: Number(o.product.salesPrice) }] },
      },
    });

    if (o.deliveredQty > 0) {
      await prisma.stockLedger.create({
        data: { productId: o.product.id, qtyChange: -o.deliveredQty, refType: "sales_order", refId: so.id, reason: "Sales delivery (seed history)", userId: o.salesPerson.id, createdAt: o.createdAt },
      });
      await prisma.product.update({ where: { id: o.product.id }, data: { onHandQty: { decrement: o.deliveredQty } } });
    }
  }

  // ---------- Additional draft Purchase Orders (drives Batch Purchase Optimization) ----------
  // Each vendor gets 2+ Draft POs so the optimizer's "2+ drafts to the same
  // vendor" threshold is actually met for all three vendors, not just one.
  await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000004" },
    update: {},
    create: {
      reference: "PO-000004", vendorId: mayfair.id, vendorAddress: "Pune, MH", responsiblePersonId: vijay.id,
      status: PurchaseOrderStatus.draft,
      lines: { create: [{ productId: glassPanel.id, orderedQty: 20, receivedQty: 0, costUnitPrice: 4 }] },
    },
  });
  await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000005" },
    update: {},
    create: {
      reference: "PO-000005", vendorId: mayfair.id, vendorAddress: "Pune, MH", responsiblePersonId: john.id,
      status: PurchaseOrderStatus.draft,
      lines: { create: [{ productId: glassPanel.id, orderedQty: 15, receivedQty: 0, costUnitPrice: 4 }] },
    },
  });
  await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000006" },
    update: {},
    create: {
      reference: "PO-000006", vendorId: oma.id, vendorAddress: "Surat, GJ", responsiblePersonId: vijay.id,
      status: PurchaseOrderStatus.draft,
      lines: { create: [{ productId: frameClips.id, orderedQty: 50, receivedQty: 0, costUnitPrice: 0.3 }] },
    },
  });
  await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000007" },
    update: {},
    create: {
      reference: "PO-000007", vendorId: woodCo.id, vendorAddress: "Nagpur, MH", responsiblePersonId: nisarg.id,
      status: PurchaseOrderStatus.draft,
      lines: { create: [{ productId: woodenLegs.id, orderedQty: 30, receivedQty: 0, costUnitPrice: 2 }] },
    },
  });
  await prisma.purchaseOrder.upsert({
    where: { reference: "PO-000008" },
    update: {},
    create: {
      reference: "PO-000008", vendorId: woodCo.id, vendorAddress: "Nagpur, MH", responsiblePersonId: john.id,
      status: PurchaseOrderStatus.draft,
      lines: { create: [{ productId: woodenLegs.id, orderedQty: 25, receivedQty: 0, costUnitPrice: 2 }] },
    },
  });

  // ---------- Bulk historical Purchase Orders (volume + realism for Dashboard/Purchase list) ----------
  // Same resolution rule as Sales/Manufacturing bulk history: only the
  // current month is live, open backlog (Draft/Confirmed/Partially Received).
  // Anything older is already resolved (Received or Cancelled), so the
  // raw-material reservations these would otherwise create on the PURCHASE
  // side (which only matters for vendor/cost tracking, not stock reservation
  // — POs don't reserve stock, only receive it) don't pile up either, and the
  // Purchase Orders list has real multi-month volume instead of 9 rows.
  // PO-000004..008 above stay untouched (they're the deliberate "2+ Drafts to
  // the same vendor" Batch Purchase Optimization demo set).
  const poBlueprints = [
    { vendor: woodCo, product: woodenLegs, price: 2 },
    { vendor: mayfair, product: glassPanel, price: 4 },
    { vendor: oma, product: frameClips, price: 0.3 },
    { vendor: woodCo, product: screws, price: 0.5 },
  ];
  const poResponsibles = [nisarg, vijay, john];
  const PO_BULK_COUNT = 220;
  let poCounter = 9; // PO-000001..008 already used above

  for (let i = 0; i < PO_BULK_COUNT; i++) {
    const blueprint = pick(poBlueprints);
    const orderedQty = randomInt(10, 80);
    const monthsAgo = randomInt(0, 7);
    const createdAt = dayInMonthsAgo(monthsAgo);
    const responsible = pick(poResponsibles);

    const roll = Math.random();
    let status: PurchaseOrderStatus;
    let receivedQty: number;
    if (monthsAgo > 0) {
      if (roll < 0.88) { status = PurchaseOrderStatus.fully_received; receivedQty = orderedQty; }
      else { status = PurchaseOrderStatus.cancelled; receivedQty = 0; }
    } else if (roll < 0.2) { status = PurchaseOrderStatus.draft; receivedQty = 0; }
    else if (roll < 0.55) { status = PurchaseOrderStatus.confirmed; receivedQty = 0; }
    else if (roll < 0.75) { status = PurchaseOrderStatus.partially_received; receivedQty = randomInt(1, orderedQty - 1 || 1); }
    else if (roll < 0.92) { status = PurchaseOrderStatus.fully_received; receivedQty = orderedQty; }
    else { status = PurchaseOrderStatus.cancelled; receivedQty = 0; }

    await prisma.purchaseOrder.create({
      data: {
        reference: `PO-${String(poCounter++).padStart(6, "0")}`,
        vendorId: blueprint.vendor.id,
        responsiblePersonId: responsible.id,
        status,
        createdAt,
        lines: { create: [{ productId: blueprint.product.id, orderedQty, receivedQty, costUnitPrice: blueprint.price }] },
      },
    });
  }

  // ---------- IntelHub demo leads ----------
  // Spans every lead type, every status (including a derived "expired" via
  // a backdated expiresAt, and a still-active one with a future expiresAt),
  // and several different authors so the leaderboard has real spread instead
  // of one user holding 100% of the stars.
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const intelPosts: Array<{
    title: string; description: string; postType: IntelPostType; materialName: string; supplierName: string;
    location?: string; price?: number; quantity?: number; contactInfo?: string;
    status: IntelPostStatus; starsAwarded?: number; author: typeof admin; createdAt: Date; expiresAt?: Date;
  }> = [
    { title: "New plywood mill in Ratnagiri — looks solid", description: "Toured their facility last week. Good machinery, can quote in bulk for cabinetry-grade plywood.", postType: IntelPostType.new_supplier, materialName: "Plywood Sheets", supplierName: "Konkan Plywood Mills", location: "Ratnagiri, MH", price: 850, quantity: 200, contactInfo: "+91 98201 11220", status: IntelPostStatus.verified, starsAwarded: 8, author: nisarg, createdAt: daysAgo(20) },
    { title: "20% cheaper Wooden Legs out of Surat", description: "Same spec as Wood Co.'s, sample batch checked out fine on tolerance.", postType: IntelPostType.cheaper_supplier, materialName: "Wooden Legs", supplierName: "Saurashtra Timber Co.", location: "Surat, GJ", price: 1.6, quantity: 500, contactInfo: "+91 98765 43210", status: IntelPostStatus.verified, starsAwarded: 5, author: nisarg, createdAt: daysAgo(18) },
    { title: "Glass Panel supplier with noticeably better finish", description: "Fewer micro-scratches on arrival than our current batches — worth a trial order.", postType: IntelPostType.better_quality, materialName: "Glass Panel", supplierName: "Crystal Clear Glassworks", location: "Vadodara, GJ", price: 4.2, quantity: 100, contactInfo: "crystalclear@example.com", status: IntelPostStatus.verified, starsAwarded: 6, author: dinesh, createdAt: daysAgo(25) },
    { title: "Frame Clips — 2-day dispatch instead of our usual week", description: "Confirmed with 3 separate orders now, consistently fast.", postType: IntelPostType.faster_delivery, materialName: "Frame Clips", supplierName: "QuickFix Hardware", location: "Pune, MH", price: 0.28, quantity: 1000, status: IntelPostStatus.verified, starsAwarded: 4, author: vijay, createdAt: daysAgo(12) },
    { title: "Screws — flat 15% off above 5000 units", description: "Bharat Fasteners is running a standing bulk discount, no minimum contract.", postType: IntelPostType.bulk_discount, materialName: "Screws", supplierName: "Bharat Fasteners", location: "Mumbai, MH", price: 0.4, quantity: 5000, contactInfo: "+91 99001 22334", status: IntelPostStatus.verified, starsAwarded: 7, author: john, createdAt: daysAgo(30) },
    { title: "Local Wooden Legs supplier, 20 min from the warehouse", description: "Cuts our lead time risk a lot for urgent orders even if price is a wash.", postType: IntelPostType.local_supplier, materialName: "Wooden Legs", supplierName: "Nagpur Wood Traders", location: "Nagpur, MH", price: 1.9, quantity: 300, status: IntelPostStatus.verified, starsAwarded: 3, author: nisarg, createdAt: daysAgo(9) },
    { title: "Acrylic sheets as a Glass Panel substitute?", description: "Lighter, shatter-resistant, slightly cheaper — worth evaluating for non-structural panels.", postType: IntelPostType.alternative_material, materialName: "Glass Panel", supplierName: "Astra Polymers", location: "Ahmedabad, GJ", price: 3.5, quantity: 150, status: IntelPostStatus.pending, author: dinesh, createdAt: daysAgo(2) },
    { title: "Mayfair has 40 surplus Door Frames sitting in their yard", description: "They want to clear it — could be a quick win if we have any open demand.", postType: IntelPostType.excess_stock, materialName: "Door Frames", supplierName: "Mayfair Co.", location: "Pune, MH", price: 9.5, quantity: 40, status: IntelPostStatus.verified, starsAwarded: 5, author: mahesh, createdAt: daysAgo(15) },
    { title: "New metalworks shop for Lighting Frame components", description: "Haven't placed a trial order yet, but their sample pieces looked clean.", postType: IntelPostType.new_supplier, materialName: "Lighting Frame Components", supplierName: "Sunrise Metal Works", location: "Rajkot, GJ", status: IntelPostStatus.pending, author: sweta, createdAt: daysAgo(1) },
    { title: "Cheaper Screws from Indore — quality concerns though", description: "Price looked great but two batches had inconsistent thread quality. Flagging, not recommending.", postType: IntelPostType.cheaper_supplier, materialName: "Screws", supplierName: "Delta Hardware", location: "Indore, MP", price: 0.45, quantity: 2000, status: IntelPostStatus.rejected, author: john, createdAt: daysAgo(22) },
    { title: "Wood Co. bulk rate on Wooden Legs above 1000 units", description: "Confirmed directly with their sales desk — applies to standing orders too.", postType: IntelPostType.bulk_discount, materialName: "Wooden Legs", supplierName: "Wood Co.", location: "Nagpur, MH", price: 1.85, quantity: 1000, status: IntelPostStatus.verified, starsAwarded: 6, author: nisarg, createdAt: daysAgo(35) },
    { title: "Mayfair can rush Glass Panel orders same-week", description: "Asked about expedited dispatch — they said yes for orders under 50 units.", postType: IntelPostType.faster_delivery, materialName: "Glass Panel", supplierName: "Mayfair Co.", location: "Pune, MH", status: IntelPostStatus.pending, author: dinesh, createdAt: daysAgo(0) },
    { title: "Local fittings supplier for Dining Chair hardware", description: "Walking distance from the Assembly Line — handy for small urgent top-ups.", postType: IntelPostType.local_supplier, materialName: "Dining Chair Fittings", supplierName: "Pune Hardware Hub", location: "Pune, MH", status: IntelPostStatus.verified, starsAwarded: 2, author: trisha, createdAt: daysAgo(28) },
    { title: "Frame Clips with tighter tolerance from Aurangabad", description: "Noticeably less rattle in the finished Lighting Frame assemblies.", postType: IntelPostType.better_quality, materialName: "Frame Clips", supplierName: "Precision Metal Co.", location: "Aurangabad, MH", price: 0.35, quantity: 500, status: IntelPostStatus.verified, starsAwarded: 4, author: vijay, createdAt: daysAgo(19) },
    { title: "Packaging supplier offer — expired by the time we followed up", description: "Good rate on eco packaging but their promo window closed before procurement acted on it.", postType: IntelPostType.new_supplier, materialName: "Packaging Material", supplierName: "EcoPack Solutions", location: "Mumbai, MH", status: IntelPostStatus.verified, starsAwarded: 2, author: john, createdAt: daysAgo(40), expiresAt: daysAgo(10) },
    { title: "Engineered wood as a Wooden Legs alternative", description: "GreenPly's engineered wood line is cheaper and more dimensionally stable than solid timber for this use.", postType: IntelPostType.alternative_material, materialName: "Wooden Legs", supplierName: "GreenPly Industries", location: "Mumbai, MH", price: 2.1, quantity: 400, status: IntelPostStatus.pending, author: nisarg, createdAt: daysAgo(3) },
    { title: "Bharat Fasteners has 10,000 surplus Screws to clear", description: "Same SKU we already use — basically a bulk discount with extra urgency.", postType: IntelPostType.excess_stock, materialName: "Screws", supplierName: "Bharat Fasteners", location: "Mumbai, MH", price: 0.38, quantity: 10000, status: IntelPostStatus.verified, starsAwarded: 3, author: john, createdAt: daysAgo(14) },
    { title: "OMA Mahek quoting cheaper Frame Clips than their usual rate", description: "20% under their last quote to us — worth confirming if it's a one-off or standing.", postType: IntelPostType.cheaper_supplier, materialName: "Frame Clips", supplierName: "OMA Mahek", location: "Surat, GJ", price: 0.25, quantity: 2000, status: IntelPostStatus.verified, starsAwarded: 5, author: vijay, createdAt: daysAgo(8) },
    { title: "Glass Panel bulk rate above 300 units", description: "Crystal Clear is offering a standing bulk rate, not just a one-time promo.", postType: IntelPostType.bulk_discount, materialName: "Glass Panel", supplierName: "Crystal Clear Glassworks", location: "Vadodara, GJ", price: 3.8, quantity: 300, status: IntelPostStatus.pending, author: dinesh, createdAt: daysAgo(1) },
    { title: "Local Screws supplier near the warehouse", description: "Not the cheapest, but cuts emergency restock time to under an hour.", postType: IntelPostType.local_supplier, materialName: "Screws", supplierName: "Mumbai Fastener Hub", location: "Mumbai, MH", price: 0.42, quantity: 3000, status: IntelPostStatus.verified, starsAwarded: 2, author: john, createdAt: daysAgo(27) },
    { title: "Wood Co. \"faster delivery\" claim didn't hold up", description: "Same lead time as their standard orders in practice — not actually faster, don't rely on this.", postType: IntelPostType.faster_delivery, materialName: "Wooden Legs", supplierName: "Wood Co.", location: "Nagpur, MH", status: IntelPostStatus.rejected, author: nisarg, createdAt: daysAgo(16) },
    { title: "Limited-time bulk rate on upholstery fabric — still open", description: "Good rate for Dining Chair fabric, offer holds for a few more weeks.", postType: IntelPostType.new_supplier, materialName: "Dining Chair Upholstery Fabric", supplierName: "TextureCraft Fabrics", location: "Surat, GJ", price: 120, quantity: 50, contactInfo: "+91 90909 80808", status: IntelPostStatus.verified, starsAwarded: 9, author: trisha, createdAt: daysAgo(6), expiresAt: daysAgo(-20) },
  ];

  for (const p of intelPosts) {
    const post = await prisma.intelPost.create({
      data: {
        title: p.title, description: p.description, postType: p.postType,
        materialName: p.materialName, supplierName: p.supplierName, location: p.location,
        price: p.price, quantity: p.quantity, contactInfo: p.contactInfo,
        status: p.status, starsAwarded: p.starsAwarded ?? 0,
        createdByUserId: p.author.id, createdAt: p.createdAt, expiresAt: p.expiresAt,
        ...(p.status === IntelPostStatus.verified
          ? { verifiedByUserId: admin.id, verifiedAt: new Date(p.createdAt.getTime() + 2 * 24 * 60 * 60 * 1000) }
          : p.status === IntelPostStatus.rejected
          ? { verifiedByUserId: admin.id, verifiedAt: new Date(p.createdAt.getTime() + 1 * 24 * 60 * 60 * 1000) }
          : {}),
      },
    });
    if (p.status === IntelPostStatus.verified && p.starsAwarded) {
      await prisma.user.update({ where: { id: p.author.id }, data: { intelStars: { increment: p.starsAwarded } } });
    }
    void post;
  }

  console.log(`Seeded ${intelPosts.length} IntelHub leads.`);
  console.log(`Seeded ${histOrders.length} historical sales orders, ${MO_BULK_COUNT} manufacturing orders, and ${PO_BULK_COUNT} purchase orders across ${MONTHS_BACK + 1} months.`);
  console.log("Seed complete.");
  console.log(`Demo login (any user): loginId + password "${DEMO_PASSWORD}"`);
  console.log("Admin: admin /", DEMO_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
