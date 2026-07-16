import { PrismaClient } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";

const prisma = new PrismaClient();

export async function listActiveSessions() {
  return prisma.activeSession.findMany({
    where: { expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, name: true, email: true, employeeId: true } } },
    orderBy: { lastActiveAt: "desc" },
  });
}

export async function getLoginHistory(limit = 50) {
  return prisma.loginHistory.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function forceLogout(sessionId: string) {
  const session = await prisma.activeSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, "Session not found");
  await prisma.activeSession.delete({ where: { id: sessionId } });
}

export async function forceLogoutUser(userId: number) {
  await prisma.activeSession.deleteMany({ where: { userId } });
}
