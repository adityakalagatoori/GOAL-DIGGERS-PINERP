import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

/** Attaches Socket.io to the same HTTP server Express is already using —
 * one port, no separate process, no coupling between the REST layer and
 * the real-time layer beyond sharing a socket. */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    // eslint-disable-next-line no-console
    console.log(`Socket connected: ${socket.id}`);

    // Client sends { userId } right after connect so we can route
    // per-user notifications to the correct socket(s).
    socket.on("join", (data: { userId?: number }) => {
      if (data?.userId) {
        socket.join(`user:${data.userId}`);
      }
    });

    socket.on("disconnect", () => {
      // eslint-disable-next-line no-console
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

/** Services call this AFTER a transaction commits to push a live update.
 * Throws if called before the server has booted — a clear signal of a
 * wiring mistake rather than a silent no-op. */
export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.io server not initialized — call initSocketServer() first");
  return io;
}

/** Push an event directly to a specific user's connected socket(s). */
export function emitToUser(userId: number, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}
