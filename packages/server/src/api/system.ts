// ABOUTME: REST API endpoint for system-level operations.
// ABOUTME: Handles updates, version info, and rolling restarts.

import { requireAuth } from "../middleware/auth";
import { spawn } from "bun";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

interface UpdateStatus {
  status: "idle" | "updating" | "success" | "error";
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

let updateStatus: UpdateStatus = { status: "idle" };

// A rolling update restarts this very server, so update progress is tracked in
// a shared file the detached deploy job writes and any instance can read —
// in-memory status can't survive the restart. Lives in the git-ignored data/.
const STATUS_FILE = join(process.cwd(), "data", "update-status.json");

// A stuck "updating" (e.g. the box was rebooted mid-deploy) shouldn't block
// updates forever; treat one older than this as stale.
const STALE_UPDATE_MS = 15 * 60 * 1000;

function readUpdateStatusFile(): UpdateStatus | null {
  try {
    if (!existsSync(STATUS_FILE)) return null;
    return JSON.parse(readFileSync(STATUS_FILE, "utf8")) as UpdateStatus;
  } catch {
    return null;
  }
}

function writeUpdateStatusFile(status: UpdateStatus): void {
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(status));
  } catch {
    // Non-fatal: the file is a convenience mirror of updateStatus.
  }
}

function isUpdateInProgress(status: UpdateStatus): boolean {
  if (status.status !== "updating") return false;
  if (!status.startedAt) return true;
  return Date.now() - Date.parse(status.startedAt) < STALE_UPDATE_MS;
}

/**
 * Get current git commit info
 */
async function getVersionInfo(): Promise<{
  commit: string;
  branch: string;
  date: string;
  remote?: string;
}> {
  const cwd = process.cwd();

  try {
    // Get current commit
    const commitProc = spawn(["git", "rev-parse", "--short", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await commitProc.exited;
    const commit = (await new Response(commitProc.stdout).text()).trim();

    // Get current branch
    const branchProc = spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await branchProc.exited;
    const branch = (await new Response(branchProc.stdout).text()).trim();

    // Get commit date
    const dateProc = spawn(
      ["git", "log", "-1", "--format=%ci"],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    await dateProc.exited;
    const date = (await new Response(dateProc.stdout).text()).trim();

    // Check if there are updates available
    const fetchProc = spawn(["git", "fetch", "--dry-run"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await fetchProc.exited;

    // Get remote HEAD
    const remoteProc = spawn(["git", "rev-parse", "--short", "origin/main"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await remoteProc.exited;
    const remote = (await new Response(remoteProc.stdout).text()).trim();

    return { commit, branch, date, remote: remote !== commit ? remote : undefined };
  } catch (error) {
    return { commit: "unknown", branch: "unknown", date: "unknown" };
  }
}

/**
 * Check for available updates
 */
async function checkForUpdates(): Promise<{
  updateAvailable: boolean;
  currentCommit: string;
  latestCommit: string;
  commitsBehind: number;
}> {
  const cwd = process.cwd();

  try {
    // Fetch latest from remote
    const fetchProc = spawn(["git", "fetch", "origin", "main"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await fetchProc.exited;

    // Get current commit
    const currentProc = spawn(["git", "rev-parse", "--short", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await currentProc.exited;
    const currentCommit = (await new Response(currentProc.stdout).text()).trim();

    // Get latest remote commit
    const latestProc = spawn(["git", "rev-parse", "--short", "origin/main"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await latestProc.exited;
    const latestCommit = (await new Response(latestProc.stdout).text()).trim();

    // Count commits behind
    const behindProc = spawn(
      ["git", "rev-list", "--count", "HEAD..origin/main"],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    await behindProc.exited;
    const commitsBehind = parseInt(
      (await new Response(behindProc.stdout).text()).trim(),
      10
    );

    return {
      updateAvailable: commitsBehind > 0,
      currentCommit,
      latestCommit,
      commitsBehind,
    };
  } catch (error) {
    return {
      updateAvailable: false,
      currentCommit: "unknown",
      latestCommit: "unknown",
      commitsBehind: 0,
    };
  }
}

/**
 * Kick off a zero-downtime rolling update.
 *
 * The deploy restarts this very server, so it can't run as a child of this
 * process: with KillMode=control-group, `systemctl restart deploy` would kill
 * the deploy script mid-run. Instead we launch scripts/rolling-deploy.sh as a
 * transient systemd unit (via a narrowly-scoped passwordless sudo rule), which
 * runs outside this service's cgroup and survives the restart. That detached
 * job owns the shared status file from launch onward; the poller reads it.
 *
 * Paths are hardcoded to the standard single-tenant install at /home/deploy/
 * deploy so they match the sudoers grant and the unit's WorkingDirectory.
 */
async function performRollingUpdate(): Promise<void> {
  const DEPLOY_DIR = "/home/deploy/deploy";
  const scriptPath = `${DEPLOY_DIR}/scripts/rolling-deploy.sh`;
  const startedAt = new Date().toISOString();

  const starting: UpdateStatus = {
    status: "updating",
    message: "Starting rolling deploy...",
    startedAt,
  };
  updateStatus = starting;
  writeUpdateStatusFile(starting);

  if (!existsSync(scriptPath)) {
    const failed: UpdateStatus = {
      status: "error",
      message: `Rolling deploy script not found at ${scriptPath}`,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    updateStatus = failed;
    writeUpdateStatusFile(failed);
    return;
  }

  // Launch detached, then return — the launcher runs `systemd-run` (no --wait),
  // which exits as soon as the transient unit starts. We only await the launch
  // to catch start failures (e.g. the unit name is busy because a deploy is
  // already running). The launcher is a fixed root-owned script so the sudo
  // grant is a bare path with no fragile argument matching.
  const proc = spawn(["sudo", "/usr/local/sbin/deploy-rolling-launch"], {
    cwd: DEPLOY_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  if (proc.exitCode !== 0) {
    const stderr = (await new Response(proc.stderr).text()).trim();
    const failed: UpdateStatus = {
      status: "error",
      message: `Failed to start rolling deploy: ${stderr || "unknown error"}`,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    updateStatus = failed;
    writeUpdateStatusFile(failed);
  }
}

/**
 * Handle /api/system/* requests
 */
export async function handleSystemApi(
  request: Request,
  path: string
): Promise<Response | null> {
  if (!path.startsWith("/api/system")) {
    return null;
  }

  const method = request.method;
  const subPath = path.replace("/api/system", "");

  // GET /api/system/version - Get version info (no auth required)
  if (method === "GET" && subPath === "/version") {
    const version = await getVersionInfo();
    return Response.json(version);
  }

  // All other system endpoints require auth
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  // GET /api/system/updates - Check for updates
  if (method === "GET" && subPath === "/updates") {
    const updates = await checkForUpdates();
    return Response.json(updates);
  }

  // GET /api/system/update-status - Get current update status
  if (method === "GET" && subPath === "/update-status") {
    // The shared file is authoritative — the detached job writes it, and it
    // outlives the server restart that in-memory status does not.
    return Response.json(readUpdateStatusFile() ?? updateStatus);
  }

  // POST /api/system/update - Trigger update
  if (method === "POST" && subPath === "/update") {
    const current = readUpdateStatusFile() ?? updateStatus;
    if (isUpdateInProgress(current)) {
      return Response.json(
        { error: "Update already in progress" },
        { status: 409 }
      );
    }

    // Start update in background
    performRollingUpdate();

    return Response.json({
      success: true,
      message: "Update started",
      status: updateStatus,
    });
  }

  return null;
}
