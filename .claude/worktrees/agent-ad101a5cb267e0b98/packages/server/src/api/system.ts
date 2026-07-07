// ABOUTME: REST API endpoint for system-level operations.
// ABOUTME: Handles updates, version info, and rolling restarts.

import { requireAuth } from "../middleware/auth";
import { spawn } from "bun";
import { join } from "path";
import { readFileSync, existsSync } from "fs";

interface UpdateStatus {
  status: "idle" | "updating" | "success" | "error";
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

let updateStatus: UpdateStatus = { status: "idle" };

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
 * Perform rolling update
 */
async function performRollingUpdate(): Promise<void> {
  const cwd = process.cwd();
  const scriptPath = join(cwd, "scripts", "rolling-deploy.sh");

  updateStatus = {
    status: "updating",
    message: "Starting update...",
    startedAt: new Date().toISOString(),
  };

  try {
    // Check if rolling deploy script exists
    if (existsSync(scriptPath)) {
      // Use the rolling deploy script for zero-downtime update
      updateStatus.message = "Running rolling deploy...";

      const proc = spawn(["bash", scriptPath], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      await proc.exited;

      if (proc.exitCode === 0) {
        updateStatus = {
          status: "success",
          message: "Update completed successfully",
          startedAt: updateStatus.startedAt,
          completedAt: new Date().toISOString(),
        };
      } else {
        const stderr = await new Response(proc.stderr).text();
        updateStatus = {
          status: "error",
          message: `Update failed: ${stderr}`,
          startedAt: updateStatus.startedAt,
          completedAt: new Date().toISOString(),
        };
      }
    } else {
      // Fallback: manual update steps
      updateStatus.message = "Pulling latest code...";

      // Git pull
      const pullProc = spawn(["git", "pull", "origin", "main"], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      await pullProc.exited;

      if (pullProc.exitCode !== 0) {
        throw new Error("Git pull failed");
      }

      // Install dependencies
      updateStatus.message = "Installing dependencies...";
      const installProc = spawn(["bun", "install"], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      await installProc.exited;

      if (installProc.exitCode !== 0) {
        throw new Error("Dependency installation failed");
      }

      // Build
      updateStatus.message = "Building...";
      const buildProc = spawn(["bun", "run", "build"], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      await buildProc.exited;

      if (buildProc.exitCode !== 0) {
        throw new Error("Build failed");
      }

      // Restart services
      updateStatus.message = "Restarting services...";

      // Try systemd first (deploy@0 and deploy@1)
      const restart0 = spawn(["systemctl", "restart", "deploy@0"], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      await restart0.exited;

      // Wait for instance 0 to be healthy
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const restart1 = spawn(["systemctl", "restart", "deploy@1"], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      await restart1.exited;

      updateStatus = {
        status: "success",
        message: "Update completed successfully",
        startedAt: updateStatus.startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    updateStatus = {
      status: "error",
      message: error instanceof Error ? error.message : "Update failed",
      startedAt: updateStatus.startedAt,
      completedAt: new Date().toISOString(),
    };
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
    return Response.json(updateStatus);
  }

  // POST /api/system/update - Trigger update
  if (method === "POST" && subPath === "/update") {
    if (updateStatus.status === "updating") {
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
