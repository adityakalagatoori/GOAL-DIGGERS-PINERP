import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { PrismaClient, User } from "@prisma/client";
import { env } from "../../config/env";
import { AppError } from "../../middleware/errorHandler";
import { IDLE_TIMEOUT_SECONDS, ABSOLUTE_TIMEOUT_MS } from "../../middleware/session";
import { InternalJwtPayload, PortalJwtPayload } from "../../types/auth";
import { sendPasswordResetEmail } from "../../lib/mailer";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const prisma = new PrismaClient();

function signInternalToken(payload: InternalJwtPayload): string {
  return jwt.sign(payload, env.JWT_INTERNAL_SECRET, { expiresIn: IDLE_TIMEOUT_SECONDS });
}

function signPortalToken(payload: PortalJwtPayload): string {
  return jwt.sign(payload, env.JWT_PORTAL_SECRET, { expiresIn: IDLE_TIMEOUT_SECONDS });
}

/**
 * Sliding-expiration refresh, called by auth.middleware on every authenticated
 * request: re-signs with a fresh idle window but the SAME sessionStart, so an
 * active user never gets logged out — unless the absolute cap has elapsed,
 * in which case this returns null and the caller forces a fresh login.
 *
 * `payload` here is what `jwt.verify` handed back, which also carries `iat`/
 * `exp` baked in from the token being refreshed — jwt.sign rejects a payload
 * that already has `exp` together with an `expiresIn` option, so those (and
 * our own fields) are rebuilt into a clean object rather than reused as-is.
 */
export function refreshInternalToken(payload: InternalJwtPayload): string | null {
  if (Date.now() - payload.sessionStart * 1000 > ABSOLUTE_TIMEOUT_MS) return null;
  return signInternalToken({ userId: payload.userId, isAdmin: payload.isAdmin, sessionStart: payload.sessionStart });
}

export function refreshPortalToken(payload: PortalJwtPayload): string | null {
  if (Date.now() - payload.sessionStart * 1000 > ABSOLUTE_TIMEOUT_MS) return null;
  return signPortalToken({ customerId: payload.customerId, sessionStart: payload.sessionStart });
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function buildUserResponse(user: User) {
  const permissions = await prisma.permission.findMany({ where: { userId: user.id } });
  return {
    id: user.id,
    loginId: user.loginId,
    name: user.name,
    email: user.email,
    position: user.position,
    address: user.address,
    mobile: user.mobile,
    photoUrl: user.photoUrl,
    isAdmin: user.isAdmin,
    permissions: permissions.map((p) => ({
      module: p.module,
      field: p.field,
      canCreate: p.canCreate,
      canView: p.canView,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
    })),
  };
}


const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function login(loginId: string, password: string, meta?: { ip?: string; browser?: string }) {
  const user = await prisma.user.findUnique({ where: { loginId } });

  // Record failed attempt for non-existent accounts too (timing-safe: always hash)
  if (!user) {
    await bcrypt.compare(password, "$2b$10$placeholder-hash-to-prevent-timing-attacks-000");
    throw new AppError(401, "Invalid login ID or password");
  }

  // Check if account is disabled (soft-deleted)
  if (user.isActive === false) {
    await prisma.loginHistory.create({ data: { userId: user.id, ip: meta?.ip, browser: meta?.browser, status: "failed" } });
    throw new AppError(403, "Your account has been disabled. Please contact the system administrator.");
  }

  // Check account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await prisma.loginHistory.create({ data: { userId: user.id, ip: meta?.ip, browser: meta?.browser, status: "locked" } });
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(423, `Account is locked. Try again in ${mins} minute(s).`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const newCount = user.failedLoginAttempts + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });
    await prisma.loginHistory.create({ data: { userId: user.id, ip: meta?.ip, browser: meta?.browser, status: "failed" } });
    if (shouldLock) {
      throw new AppError(423, `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`);
    }
    throw new AppError(401, `Invalid login ID or password. ${MAX_FAILED_ATTEMPTS - newCount} attempt(s) remaining.`);
  }

  // Successful login — reset lockout, update timestamps
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastSeenAt: new Date(), onlineStatus: "online" },
  });
  await prisma.loginHistory.create({ data: { userId: user.id, ip: meta?.ip, browser: meta?.browser, status: "success" } });

  const token = signInternalToken({ userId: user.id, isAdmin: user.isAdmin, sessionStart: nowSeconds() });
  return { token, user: await buildUserResponse(user) };
}


export async function signup(loginId: string, email: string, password: string) {
  const existingLoginId = await prisma.user.findUnique({ where: { loginId } });
  if (existingLoginId) throw new AppError(409, "Login ID already taken");

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) throw new AppError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  // Signup only collects Login Id / Email / Password (per the wireframe) —
  // Name defaults to the Login Id until the user edits their own profile
  // via PATCH /api/me. Self-signup accounts are always non-admin.
  const user = await prisma.user.create({
    data: { loginId, email, passwordHash, name: loginId, isAdmin: false },
  });

  const token = signInternalToken({ userId: user.id, isAdmin: false, sessionStart: nowSeconds() });
  return { token, user: await buildUserResponse(user) };
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  // Accepts either Login Id or Email — most users instinctively type the
  // email they signed up with on a "forgot password" screen, and silently
  // requiring the exact Login Id (which the form previously did) meant
  // their reset email just never sent, with no error to explain why.
  const user = await prisma.user.findFirst({ where: { OR: [{ loginId: identifier }, { email: identifier }] } });
  // Always respond the same way whether or not the account exists, so the
  // endpoint can't be used to enumerate valid Login Ids/emails.
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  await sendPasswordResetEmail(user.email, rawToken);
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, "This reset link is invalid or has expired");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

export async function portalLogin(email: string, password: string) {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer || !customer.passwordHash) throw new AppError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, customer.passwordHash);
  if (!valid) throw new AppError(401, "Invalid email or password");

  const portalToken = signPortalToken({ customerId: customer.id, sessionStart: nowSeconds() });
  return { portalToken, customer: { id: customer.id, name: customer.name, email: customer.email } };
}

export async function portalSignup(name: string, email: string, password: string) {
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  const customer = await prisma.customer.create({ data: { name, email, passwordHash } });

  const portalToken = signPortalToken({ customerId: customer.id, sessionStart: nowSeconds() });
  return { portalToken, customer: { id: customer.id, name: customer.name, email: customer.email } };
}
