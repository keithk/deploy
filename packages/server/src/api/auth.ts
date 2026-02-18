// ABOUTME: Auth API endpoints for password-based login, logout, and initial setup.
// ABOUTME: Handles session creation/deletion and password management via settings table.

import { sessionModel, settingsModel } from "@keithk/deploy-core";
import {
  getSessionFromRequest,
  validateSession,
  createSessionCookie,
} from "../middleware/auth";

const PASSWORD_HASH_KEY = "password_hash";

/**
 * Handle /api/auth/* requests.
 * These endpoints are unauthenticated (they handle authentication itself).
 */
export async function handleAuthApi(
  request: Request,
  path: string
): Promise<Response | null> {
  const method = request.method;

  // POST /api/auth/login
  if (path === "/api/auth/login" && method === "POST") {
    return handleLogin(request);
  }

  // POST /api/auth/logout
  if (path === "/api/auth/logout" && method === "POST") {
    return handleLogout(request);
  }

  // GET /api/auth/check
  if (path === "/api/auth/check" && method === "GET") {
    return handleCheck(request);
  }

  // POST /api/auth/setup
  if (path === "/api/auth/setup" && method === "POST") {
    return handleSetup(request);
  }

  return null;
}

/**
 * Check if a password has been configured.
 */
export function isPasswordConfigured(): boolean {
  return settingsModel.get(PASSWORD_HASH_KEY) !== null;
}

async function handleLogin(request: Request): Promise<Response> {
  const passwordHash = settingsModel.get(PASSWORD_HASH_KEY);
  if (!passwordHash) {
    return Response.json(
      { error: "No password configured. Use /api/auth/setup first." },
      { status: 400 }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.password) {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }

  const valid = await Bun.password.verify(body.password, passwordHash);
  if (!valid) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  const session = sessionModel.create(7);
  const cookie = createSessionCookie(session.token);

  return Response.json(
    { success: true },
    { headers: { "Set-Cookie": cookie } }
  );
}

async function handleLogout(request: Request): Promise<Response> {
  const token = getSessionFromRequest(request);
  if (token) {
    sessionModel.delete(token);
  }

  // Clear the session cookie
  const clearCookie =
    "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

  return Response.json(
    { success: true },
    { headers: { "Set-Cookie": clearCookie } }
  );
}

async function handleCheck(request: Request): Promise<Response> {
  const token = getSessionFromRequest(request);
  const authenticated = validateSession(token);
  const needsSetup = !isPasswordConfigured();

  return Response.json({ authenticated, needsSetup });
}

async function handleSetup(request: Request): Promise<Response> {
  // Only allow setup if no password exists yet
  if (isPasswordConfigured()) {
    return Response.json(
      { error: "Password already configured. Use the CLI to change it." },
      { status: 403 }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.password || body.password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const hash = await Bun.password.hash(body.password, {
    algorithm: "argon2id",
  });
  settingsModel.set(PASSWORD_HASH_KEY, hash);

  // Create a session so the user is logged in immediately
  const session = sessionModel.create(7);
  const cookie = createSessionCookie(session.token);

  return Response.json(
    { success: true },
    { headers: { "Set-Cookie": cookie } }
  );
}
