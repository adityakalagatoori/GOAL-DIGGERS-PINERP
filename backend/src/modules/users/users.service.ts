import bcrypt from "bcrypt";
import crypto from "crypto";
import { PrismaClient, PermissionModule } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";

const prisma = new PrismaClient();

const PERMISSION_SELECT = {
  module: true, field: true, canCreate: true, canView: true, canEdit: true, canDelete: true,
} as const;

// Never expose passwordHash to the browser.
const SAFE_USER_SELECT = {
  id: true, loginId: true, name: true, email: true, position: true,
  address: true, mobile: true, photoUrl: true, isAdmin: true,
  permissions: { select: PERMISSION_SELECT },
  // Enterprise fields
  employeeId: true, firstName: true, lastName: true, username: true,
  departmentId: true, roleId: true, managerId: true, branchId: true,
  designation: true, phone: true, joiningDate: true, isActive: true,
  lastLoginAt: true, lastSeenAt: true, onlineStatus: true,
  intelStars: true, createdAt: true,
  department: { select: { id: true, name: true } },
  role: { select: { id: true, name: true, label: true, permissions: true } },
  manager: { select: { id: true, name: true, employeeId: true } },
  branch: { select: { id: true, name: true } },
} as const;

/** Generate next employee ID: find highest existing, increment. */
async function generateEmployeeId(): Promise<string> {
  const last = await prisma.user.findFirst({
    where: { employeeId: { not: null } },
    orderBy: { employeeId: "desc" },
    select: { employeeId: true },
  });
  if (!last?.employeeId) return "EMP-0001";
  const num = parseInt(last.employeeId.replace("EMP-", ""), 10);
  return `EMP-${String(num + 1).padStart(4, "0")}`;
}

export async function listUsers(filters: {
  search?: string;
  roleId?: number;
  departmentId?: number;
  isActive?: boolean;
  branchId?: number;
} = {}) {
  const where: Record<string, any> = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { email: { contains: filters.search } },
      { employeeId: { contains: filters.search } },
      { loginId: { contains: filters.search } },
    ];
  }
  if (filters.roleId !== undefined) where.roleId = filters.roleId;
  if (filters.departmentId !== undefined) where.departmentId = filters.departmentId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.branchId !== undefined) where.branchId = filters.branchId;

  return prisma.user.findMany({
    where,
    select: {
      id: true, loginId: true, name: true, email: true, position: true,
      isAdmin: true, photoUrl: true, employeeId: true, firstName: true,
      lastName: true, username: true, departmentId: true, roleId: true,
      designation: true, phone: true, isActive: true, lastLoginAt: true,
      createdAt: true,
      department: { select: { id: true, name: true } },
      role: { select: { id: true, name: true, label: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Minimal {id, name} list of active users, for populating "assign to"
 * dropdowns (Sales Person, Responsible Person, etc.) that any authenticated
 * user needs to see regardless of their own permission grid — listUsers()
 * above is intentionally admin-only since it exposes full profile data,
 * but that meant non-admins got a 403 just trying to open a Sales/Purchase/
 * Manufacturing order and populate this dropdown, silently leaving it empty.
 */
export async function listUserDirectory() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, position: true },
    orderBy: { name: "asc" },
  });
}

export async function getUserWithPermissions(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
  if (!user) throw new AppError(404, "User not found");
  return user;
}

interface CreateUserInput {
  loginId: string;
  email: string;
  password: string;
  name: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  designation?: string;
  phone?: string;
  joiningDate?: string;
  departmentId?: number;
  roleId?: number;
  managerId?: number;
  branchId?: number;
  isAdmin?: boolean;
  isActive?: boolean;
}

export async function createUser(data: CreateUserInput) {
  // Check for duplicate loginId/email
  const dupLogin = await prisma.user.findUnique({ where: { loginId: data.loginId } });
  if (dupLogin) throw new AppError(409, "Login ID already taken");
  const dupEmail = await prisma.user.findUnique({ where: { email: data.email } });
  if (dupEmail) throw new AppError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const employeeId = await generateEmployeeId();

  return prisma.user.create({
    data: {
      loginId: data.loginId,
      username: data.loginId,
      email: data.email,
      passwordHash,
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      position: data.position ?? data.designation,
      designation: data.designation,
      phone: data.phone,
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
      departmentId: data.departmentId,
      roleId: data.roleId,
      managerId: data.managerId,
      branchId: data.branchId,
      isAdmin: data.isAdmin ?? false,
      isActive: data.isActive ?? true,
      employeeId,
      passwordChangedAt: new Date(),
    },
    select: SAFE_USER_SELECT,
  });
}

interface PermissionRowInput {
  module: PermissionModule; field: string;
  canCreate: boolean; canView: boolean; canEdit: boolean; canDelete: boolean;
}

interface UpdateUserInput {
  name?: string; address?: string; mobile?: string; position?: string;
  designation?: string; phone?: string; joiningDate?: string;
  departmentId?: number; roleId?: number; managerId?: number; branchId?: number;
  isAdmin?: boolean; isActive?: boolean; permissions?: PermissionRowInput[];
}

export async function updateUser(userId: number, data: UpdateUserInput) {
  const { permissions, ...profileFields } = data;
  const updateData: Record<string, any> = { ...profileFields };
  if (profileFields.joiningDate) updateData.joiningDate = new Date(profileFields.joiningDate);

  await prisma.user.update({ where: { id: userId }, data: updateData });

  if (permissions) {
    for (const p of permissions) {
      await prisma.permission.upsert({
        where: { userId_module_field: { userId, module: p.module, field: p.field } },
        update: { canCreate: p.canCreate, canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete },
        create: { userId, module: p.module, field: p.field, canCreate: p.canCreate, canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete },
      });
    }
  }

  return getUserWithPermissions(userId);
}

export async function disableUser(userId: number) {
  await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  // Kill all sessions
  await prisma.activeSession.deleteMany({ where: { userId } });
}

export async function enableUser(userId: number) {
  await prisma.user.update({ where: { id: userId }, data: { isActive: false, failedLoginAttempts: 0, lockedUntil: null } });
}

export async function adminResetPassword(userId: number, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
}

export async function getMe(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
  if (!user) throw new AppError(404, "User not found");
  return user;
}

interface UpdateMeInput { name?: string; address?: string; mobile?: string; phone?: string; }

export async function updateMe(userId: number, data: UpdateMeInput) {
  // Explicit allow-list, not a passthrough spread — req.body must never
  // reach prisma.user.update() directly here, since User also carries
  // isAdmin/roleId/isActive/etc. A non-admin PATCHing their own profile
  // must not be able to smuggle privilege-escalating fields into `data`.
  const { name, address, mobile, phone } = data;
  return prisma.user.update({ where: { id: userId }, data: { name, address, mobile, phone }, select: SAFE_USER_SELECT });
}

export async function updateMyPhoto(userId: number, photoUrl: string) {
  return prisma.user.update({ where: { id: userId }, data: { photoUrl }, select: SAFE_USER_SELECT });
}

export async function changeMyPassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User not found");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError(401, "Current password is incorrect");

  if (newPassword.length < 8) throw new AppError(400, "Password must be at least 8 characters");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
}

export async function updateOnlineStatus(userId: number, status: string) {
  await prisma.user.update({ where: { id: userId }, data: { onlineStatus: status, lastSeenAt: new Date() } });
}

export async function generateRandomPassword(): Promise<string> {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}
