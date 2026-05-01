// ABOUTME: REST endpoints for inspecting docker-compose files used to create compose-type sites.
// ABOUTME: Parses pasted YAML or fetches from a URL, returns the services list and primary candidates.

import { parse as parseYaml } from "yaml";

const MAX_FETCH_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

interface ComposeService {
  name: string;
  ports: number[];
}

interface ParseResult {
  yaml: string;
  services: ComposeService[];
  candidates: string[];
}

interface ComposeValidationError {
  code: "invalid_yaml" | "no_services" | "no_published_ports" | "forbidden_directive";
  message: string;
}

export class ComposeError extends Error {
  constructor(public code: ComposeValidationError["code"], message: string) {
    super(message);
    this.name = "ComposeError";
  }
}

/**
 * Pull the integer container port out of a compose `ports:` entry.
 *
 * Compose accepts:
 *   "9000"
 *   "9000:9000"
 *   "9000:9000/tcp"
 *   "127.0.0.1:9000:9000"
 *   { target: 9000, published: 9000 }
 */
export function extractContainerPort(entry: unknown): number | null {
  if (typeof entry === "number") return Number.isInteger(entry) ? entry : null;
  if (typeof entry === "string") {
    const cleaned = entry.split("/")[0];
    const parts = cleaned.split(":");
    const last = parts[parts.length - 1];
    const n = Number.parseInt(last, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (entry && typeof entry === "object") {
    const target = (entry as { target?: unknown }).target;
    if (typeof target === "number" && Number.isInteger(target)) return target;
    if (typeof target === "string") {
      const n = Number.parseInt(target, 10);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/**
 * Reject docker-compose features that would break our routing or escalate privilege.
 * Run this both at create time and just before write so we never persist or boot a bad file.
 */
export function assertSafeCompose(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") {
    throw new ComposeError("invalid_yaml", "Compose file must be a YAML mapping");
  }
  const services = (parsed as { services?: unknown }).services;
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    throw new ComposeError("no_services", "Compose file must define a `services:` map");
  }
  for (const [name, raw] of Object.entries(services as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const svc = raw as Record<string, unknown>;
    if (svc.network_mode === "host") {
      throw new ComposeError(
        "forbidden_directive",
        `Service \`${name}\` uses network_mode: host, which bypasses the platform's routing.`
      );
    }
    if (svc.privileged === true) {
      throw new ComposeError(
        "forbidden_directive",
        `Service \`${name}\` is marked privileged: true.`
      );
    }
  }
}

/**
 * Parse a compose YAML string and surface the services + primary-service candidates.
 * Throws ComposeError on validation failures.
 */
export function parseComposeFile(yamlText: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (err) {
    throw new ComposeError(
      "invalid_yaml",
      `YAML parse failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  assertSafeCompose(parsed);

  const services: ComposeService[] = [];
  const rawServices = (parsed as { services: Record<string, unknown> }).services;
  for (const [name, raw] of Object.entries(rawServices)) {
    const ports: number[] = [];
    if (raw && typeof raw === "object") {
      const portsRaw = (raw as { ports?: unknown }).ports;
      if (Array.isArray(portsRaw)) {
        for (const entry of portsRaw) {
          const p = extractContainerPort(entry);
          if (p !== null && !ports.includes(p)) ports.push(p);
        }
      }
      const expose = (raw as { expose?: unknown }).expose;
      if (Array.isArray(expose)) {
        for (const entry of expose) {
          const p = extractContainerPort(entry);
          if (p !== null && !ports.includes(p)) ports.push(p);
        }
      }
    }
    services.push({ name, ports });
  }

  const candidates = services.filter((s) => s.ports.length > 0).map((s) => s.name);
  if (candidates.length === 0) {
    throw new ComposeError(
      "no_published_ports",
      "At least one service must publish a port (in `ports:` or `expose:`) so we know what to route to."
    );
  }

  return { yaml: yamlText, services, candidates };
}

async function fetchComposeFromUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ComposeError("invalid_yaml", "Invalid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ComposeError("invalid_yaml", "URL must use http(s)");
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "text/yaml, text/plain, */*" },
    });
    if (!res.ok) {
      throw new ComposeError("invalid_yaml", `Fetch returned HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_FETCH_BYTES) {
      throw new ComposeError(
        "invalid_yaml",
        `Compose file is too large (${buf.byteLength} bytes; max ${MAX_FETCH_BYTES})`
      );
    }
    return new TextDecoder("utf-8").decode(buf);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Handle POST /api/compose/parse — validate a pasted or fetched compose file
 * and return services + primary candidates.
 */
export async function handleComposeApi(
  request: Request,
  path: string
): Promise<Response | null> {
  if (path !== "/api/compose/parse") return null;
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { yaml?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let yamlText = body.yaml ?? "";
  if (!yamlText && body.url) {
    try {
      yamlText = await fetchComposeFromUrl(body.url);
    } catch (err) {
      const code = err instanceof ComposeError ? err.code : "invalid_yaml";
      const message = err instanceof Error ? err.message : "Unknown fetch error";
      return Response.json({ error: message, code }, { status: 400 });
    }
  }
  if (!yamlText.trim()) {
    return Response.json(
      { error: "Provide either `yaml` or `url`", code: "invalid_yaml" },
      { status: 400 }
    );
  }

  try {
    const result = parseComposeFile(yamlText);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ComposeError) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Parse failed", code: "invalid_yaml" },
      { status: 400 }
    );
  }
}
