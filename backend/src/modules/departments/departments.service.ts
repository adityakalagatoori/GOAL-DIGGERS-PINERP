import { PrismaClient } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";

const prisma = new PrismaClient();

const DEFAULT_DEPARTMENTS = [
  "Sales", "Purchase", "Manufacturing", "Warehouse", "Inventory",
  "Finance", "HR", "Quality Control", "Engineering", "Management", "IT", "Admin",
];

export async function seedDepartments() {
  for (const name of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

export async function listDepartments() {
  return prisma.department.findMany({ orderBy: { name: "asc" } });
}

export async function createDepartment(name: string) {
  const existing = await prisma.department.findUnique({ where: { name } });
  if (existing) throw new AppError(409, "Department already exists");
  return prisma.department.create({ data: { name } });
}

export async function updateDepartment(id: number, data: { name?: string; isActive?: boolean }) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) throw new AppError(404, "Department not found");
  return prisma.department.update({ where: { id }, data });
}

export async function deleteDepartment(id: number) {
  const count = await prisma.user.count({ where: { departmentId: id } });
  if (count > 0) throw new AppError(409, `Cannot delete — ${count} user(s) in this department`);
  await prisma.department.delete({ where: { id } });
}
