import { PrismaClient } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { emitToUser } from "../../sockets/socket.server";

const prisma = new PrismaClient();

export async function listNotifications(userId: number) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function unreadCount(userId: number): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markRead(userId: number, notificationId: number) {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.userId !== userId) throw new AppError(403, "Not allowed");
  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
}

export async function markAllRead(userId: number) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

export async function createNotification(data: {
  userId: number;
  type: string;
  title: string;
  message: string;
  href?: string;
  priority?: string;
}) {
  const notification = await prisma.notification.create({ data: { ...data, priority: data.priority ?? "normal" } });
  // Real-time push to the specific user
  try {
    emitToUser(data.userId, "notification:created", notification);
  } catch { /* socket not connected — notification is still persisted */ }
  return notification;
}

export async function deleteNotification(userId: number, notificationId: number) {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.userId !== userId) throw new AppError(403, "Not allowed");
  await prisma.notification.delete({ where: { id: notificationId } });
}
