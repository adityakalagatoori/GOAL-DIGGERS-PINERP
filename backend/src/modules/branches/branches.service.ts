import { PrismaClient } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";

const prisma = new PrismaClient();

export async function listBranches() {
  return prisma.branch.findMany({ orderBy: { name: "asc" } });
}

export async function createBranch(data: { name: string; city?: string }) {
  const existing = await prisma.branch.findUnique({ where: { name: data.name } });
  if (existing) throw new AppError(409, "Branch already exists");
  return prisma.branch.create({ data });
}

export async function updateBranch(id: number, data: { name?: string; city?: string; isActive?: boolean }) {
  const b = await prisma.branch.findUnique({ where: { id } });
  if (!b) throw new AppError(404, "Branch not found");
  return prisma.branch.update({ where: { id }, data });
}

export async function deleteBranch(id: number) {
  const count = await prisma.user.count({ where: { branchId: id } });
  if (count > 0) throw new AppError(409, `Cannot delete — ${count} user(s) in this branch`);
  await prisma.branch.delete({ where: { id } });
}
