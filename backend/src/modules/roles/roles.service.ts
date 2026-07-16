import { PrismaClient } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";

const prisma = new PrismaClient();

export const ALL_MODULES = [
  "dashboard",
  "sales",
  "purchase",
  "manufacturing",
  "bom",
  "products",
  "vendors",
  "signals",
  "intel_hub",
  "insights",
  "production_health",
  "user_management",
  "audit_logs",
] as const;

export type AppModule = (typeof ALL_MODULES)[number];

export const DEFAULT_ROLES = [
  {
    name: "system_administrator",
    label: "System Administrator",
    isSystem: true,
    // Full access to everything
    perms: ALL_MODULES.map((m) => ({
      module: m,
      canView: true, canCreate: true, canEdit: true, canDelete: true,
      canApprove: true, canExport: true, canImport: true,
    })),
  },
  {
    name: "manager",
    label: "Manager",
    isSystem: true,
    perms: ALL_MODULES.map((m) => ({
      module: m,
      canView: true,
      canCreate: m !== "user_management" && m !== "audit_logs",
      canEdit: m !== "user_management" && m !== "audit_logs",
      canDelete: false,
      canApprove: true,
      canExport: true,
      canImport: false,
    })),
  },
  {
    name: "sales_executive",
    label: "Sales Executive",
    isSystem: true,
    perms: [
      { module: "dashboard", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "sales", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: true, canImport: false },
      { module: "products", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "insights", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
    ],
  },
  {
    name: "purchase_executive",
    label: "Purchase Executive",
    isSystem: true,
    perms: [
      { module: "dashboard", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "purchase", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: true, canImport: false },
      { module: "products", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "vendors", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "signals", canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "intel_hub", canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
    ],
  },
  {
    name: "production_manager",
    label: "Production Manager",
    isSystem: true,
    perms: [
      { module: "dashboard", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "manufacturing", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true, canExport: true, canImport: false },
      { module: "bom", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "production_health", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "products", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
    ],
  },
  {
    name: "warehouse_staff",
    label: "Warehouse Staff",
    isSystem: true,
    perms: [
      { module: "dashboard", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "products", canView: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "manufacturing", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "purchase", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
    ],
  },
  {
    name: "finance",
    label: "Finance",
    isSystem: true,
    perms: [
      { module: "dashboard", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "sales", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: true, canExport: true, canImport: false },
      { module: "purchase", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: true, canExport: true, canImport: false },
      { module: "insights", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: true, canImport: false },
    ],
  },
  {
    name: "hr",
    label: "HR",
    isSystem: true,
    perms: [
      { module: "dashboard", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "user_management", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: true, canImport: false },
    ],
  },
  {
    name: "quality_inspector",
    label: "Quality Inspector",
    isSystem: true,
    perms: [
      { module: "dashboard", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "manufacturing", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "products", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "signals", canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
      { module: "production_health", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, canImport: false },
    ],
  },
  {
    name: "read_only",
    label: "Read Only User",
    isSystem: true,
    perms: ALL_MODULES.map((m) => ({
      module: m,
      canView: true, canCreate: false, canEdit: false, canDelete: false,
      canApprove: false, canExport: false, canImport: false,
    })),
  },
];

export async function listRoles() {
  return prisma.role.findMany({
    include: { permissions: true },
    orderBy: { label: "asc" },
  });
}

export async function getRole(id: number) {
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!role) throw new AppError(404, "Role not found");
  return role;
}

interface RoleInput {
  label: string;
  permissions: { module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canApprove: boolean; canExport: boolean; canImport: boolean }[];
}

export async function createRole(data: RoleInput) {
  const name = data.label.toLowerCase().replace(/\s+/g, "_");
  return prisma.role.create({
    data: {
      name,
      label: data.label,
      isSystem: false,
      permissions: { create: data.permissions.map((p) => ({ module: p.module, canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete, canApprove: p.canApprove, canExport: p.canExport, canImport: p.canImport })) },
    },
    include: { permissions: true },
  });
}

export async function updateRole(id: number, data: RoleInput) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new AppError(404, "Role not found");

  // Delete all existing permissions then recreate (simpler than upsert for 13 modules)
  await prisma.rolePermission.deleteMany({ where: { roleId: id } });
  return prisma.role.update({
    where: { id },
    data: {
      label: data.label,
      permissions: { create: data.permissions.map((p) => ({ module: p.module, canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete, canApprove: p.canApprove, canExport: p.canExport, canImport: p.canImport })) },
    },
    include: { permissions: true },
  });
}

export async function deleteRole(id: number) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new AppError(404, "Role not found");
  if (role.isSystem) throw new AppError(403, "System roles cannot be deleted");
  // Check if any users are assigned to this role
  const count = await prisma.user.count({ where: { roleId: id } });
  if (count > 0) throw new AppError(409, `Cannot delete role — ${count} user(s) still assigned to it`);
  await prisma.role.delete({ where: { id } });
}
