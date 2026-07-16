import { Request, Response } from "express";
import * as authService from "./auth.service";
import { setSessionCookie, clearSessionCookie, INTERNAL_SESSION_COOKIE, PORTAL_SESSION_COOKIE } from "../../middleware/session";

// Express 5 auto-forwards rejected promises from async handlers to the
// error handler — no try/catch needed here.

// The signed JWT never reaches the response body — it's only ever set as an
// HttpOnly cookie, so it's unreachable from JS (no XSS-stolen-token risk),
// unlike the old localStorage-token approach.

export async function loginHandler(req: Request, res: Response) {
  const { loginId, password } = req.body;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress;
  const browser = req.headers["user-agent"]?.substring(0, 200);
  const { token, user } = await authService.login(loginId, password, { ip, browser });
  setSessionCookie(res, INTERNAL_SESSION_COOKIE, token);
  res.json({ user });
}


export async function signupHandler(req: Request, res: Response) {
  const { loginId, email, password } = req.body;
  const { token, user } = await authService.signup(loginId, email, password);
  setSessionCookie(res, INTERNAL_SESSION_COOKIE, token);
  res.status(201).json({ user });
}

export async function logoutHandler(req: Request, res: Response) {
  clearSessionCookie(res, INTERNAL_SESSION_COOKIE);
  res.json({ message: "Logged out." });
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { identifier } = req.body;
  await authService.requestPasswordReset(identifier);
  res.json({ message: "If that account exists, a reset link has been sent to its email." });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  res.json({ message: "Password updated successfully." });
}

export async function portalLoginHandler(req: Request, res: Response) {
  const { email, password } = req.body;
  const { portalToken, customer } = await authService.portalLogin(email, password);
  setSessionCookie(res, PORTAL_SESSION_COOKIE, portalToken);
  res.json({ customer });
}

export async function portalSignupHandler(req: Request, res: Response) {
  const { name, email, password } = req.body;
  const { portalToken, customer } = await authService.portalSignup(name, email, password);
  setSessionCookie(res, PORTAL_SESSION_COOKIE, portalToken);
  res.status(201).json({ customer });
}

export async function portalLogoutHandler(req: Request, res: Response) {
  clearSessionCookie(res, PORTAL_SESSION_COOKIE);
  res.json({ message: "Logged out." });
}
