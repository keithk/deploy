// ABOUTME: Tests for the git service.
// ABOUTME: Validates cloning, pulling, and path resolution functions.

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { $ } from "bun";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { settingsModel } from "@keithk/deploy-core";
import { cloneSite, pullSite, getSitePath, getGitAuth, gitErrorMessage } from "../git";
import { applyBuildSources } from "../overlay";

const TEST_REPO_URL = "https://github.com/test/private.git";
const TEST_TOKEN = "test-token-not-a-real-credential";

describe("git service", () => {
  let root: string;
  let source: string;
  let token: string | null;
  let settingsSpy: ReturnType<typeof spyOn>;
  let previousEnv: Record<string, string | undefined>;
  const envKeys = [
    "ROOT_DIR", "GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0",
    "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_KEY_1", "GIT_CONFIG_VALUE_1",
  ];

  beforeEach(async () => {
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    root = mkdtempSync(join(tmpdir(), "deploy-git-test-"));
    source = join(root, "source");
    process.env.ROOT_DIR = join(root, "sites");
    await $`git init --initial-branch=main ${source}`.quiet();
    writeFileSync(join(source, "version.txt"), "first");
    await $`git -C ${source} add version.txt`.quiet();
    await $`git -C ${source} -c user.name=Test -c user.email=test@example.invalid commit -m first`.quiet();

    // Exercise real clone/fetch/reset without network access or real credentials.
    process.env.GIT_CONFIG_COUNT = "1";
    process.env.GIT_CONFIG_KEY_0 = `url.${source}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_0 = TEST_REPO_URL;
    token = TEST_TOKEN;
    settingsSpy = spyOn(settingsModel, "get").mockImplementation((key) =>
      key === "github_token" ? token : null
    );
  });

  afterEach(() => {
    settingsSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  describe("getSitePath", () => {
    test("returns the correct path for a site", () => {
      const path = getSitePath("my-site");
      expect(path).toBe(join(root, "sites", "my-site"));
    });
  });

  describe("GitHub credentials", () => {
    function credentials(url: string) {
      const { env } = getGitAuth(TEST_REPO_URL);
      const result = spawnSync("git", ["credential", "fill"], {
        env, input: `url=${url}\n\n`, encoding: "utf8",
      });
      return { exitCode: result.status, stdout: result.stdout };
    }

    test("supplies the token as a password through Git's credential protocol", () => {
      const result = credentials(TEST_REPO_URL);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("username=x-access-token");
      expect(result.stdout).toContain(`password=${TEST_TOKEN}`);
      expect(getGitAuth(TEST_REPO_URL).url).toBe(TEST_REPO_URL);
    });

    test("still supplies credentials for a redirected GitHub URL", () => {
      const result = credentials("https://github.com/test/private/");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`password=${TEST_TOKEN}`);
    });

    test("uses a rotated token on the next command", () => {
      token = "rotated-test-token";
      const result = credentials(TEST_REPO_URL);
      expect(result.stdout).toContain("password=rotated-test-token");
      expect(result.stdout).not.toContain(TEST_TOKEN);
    });

    test("does not supply GitHub credentials to another host", () => {
      for (const url of [
        "https://example.invalid/private.git",
        "https://github.com.example.invalid/private.git",
        "http://github.com/test/private.git",
      ]) {
        const result = credentials(url);
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).not.toContain(TEST_TOKEN);
      }
    });

    test("leaves non-GitHub URLs and SSH authentication alone", () => {
      for (const url of ["git@github.com:test/private.git", "https://example.invalid/private.git"]) {
        const auth = getGitAuth(url);
        expect(auth.url).toBe(url);
        expect(auth.env.DEPLOY_GITHUB_TOKEN).toBeUndefined();
      }
    });

    test("does not inject credentials when no token is configured", () => {
      token = null;
      const auth = getGitAuth(TEST_REPO_URL);
      expect(auth.url).toBe(TEST_REPO_URL);
      expect(auth.env.DEPLOY_GITHUB_TOKEN).toBeUndefined();
      expect(credentials(TEST_REPO_URL).exitCode).not.toBe(0);
    });

    test("does not persist the token through an inherited credential store", () => {
      const store = join(root, "credentials");
      process.env.GIT_CONFIG_COUNT = "2";
      process.env.GIT_CONFIG_KEY_1 = "credential.helper";
      process.env.GIT_CONFIG_VALUE_1 = `store --file=${JSON.stringify(store)}`;
      const { env } = getGitAuth(TEST_REPO_URL);
      const result = spawnSync("git", ["credential", "approve"], {
        env,
        input: `url=${TEST_REPO_URL}\nusername=x-access-token\npassword=${TEST_TOKEN}\n\n`,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(existsSync(store)).toBe(false);
    });

    test("redacts current tokens and legacy credential URLs from errors", () => {
      const message = gitErrorMessage(new Error(
        `failed https://old-token@github.com/test/private.git: ${TEST_TOKEN}`
      ));
      expect(message).not.toContain(TEST_TOKEN);
      expect(message).not.toContain("old-token");
    });
  });

  describe("cloneSite", () => {
    test("clones a repository without persisting credentials", async () => {
      const sitePath = await cloneSite(TEST_REPO_URL, "test-clone");

      expect(sitePath).toBe(join(root, "sites", "test-clone"));
      expect(existsSync(sitePath)).toBe(true);
      expect(existsSync(join(sitePath, ".git"))).toBe(true);
      const config = readFileSync(join(sitePath, ".git/config"), "utf8");
      expect(config).toContain(TEST_REPO_URL);
      expect(config).not.toContain(TEST_TOKEN);
    });

    test("throws error for invalid git URL", async () => {
      await expect(
        cloneSite(join(root, "nonexistent"), "invalid-site")
      ).rejects.toThrow("Git clone failed");
    });
  });

  describe("pullSite", () => {
    test("refreshes a legacy remote with the current token and resets the checkout", async () => {
      const sitePath = await cloneSite(TEST_REPO_URL, "test-pull");
      await $`git -C ${sitePath} remote set-url origin https://old-token@github.com/test/private.git`.quiet();
      writeFileSync(join(source, "version.txt"), "second");
      await $`git -C ${source} -c user.name=Test -c user.email=test@example.invalid commit -am second`.quiet();
      token = "rotated-test-token";

      await pullSite("test-pull", "main", TEST_REPO_URL);

      expect(readFileSync(join(sitePath, "version.txt"), "utf8")).toBe("second");
      const config = readFileSync(join(sitePath, ".git/config"), "utf8");
      expect(config).toContain(TEST_REPO_URL);
      expect(config).not.toContain("old-token");
      expect(config).not.toContain(token);
    });

    test("cleans a legacy remote even when the caller omits the canonical URL", async () => {
      const sitePath = await cloneSite(TEST_REPO_URL, "test-pull");
      await $`git -C ${sitePath} remote set-url origin https://old-token@github.com/test/private.git`.quiet();
      await pullSite("test-pull");
      expect((await $`git -C ${sitePath} config --get remote.origin.url`.text()).trim()).toBe(TEST_REPO_URL);
    });

    test("throws error when site does not exist", async () => {
      await expect(pullSite("nonexistent-site")).rejects.toThrow(
        "does not exist"
      );
    });
  });

  test("clones a private build source using the same credential handling", async () => {
    const sitePath = join(root, "build");
    await applyBuildSources(sitePath, [{
      type: "git", source: TEST_REPO_URL, dest: "vendor/private",
    }], () => {});
    expect(readFileSync(join(sitePath, "vendor/private/version.txt"), "utf8")).toBe("first");
    expect(existsSync(join(sitePath, "vendor/private/.git"))).toBe(false);
  });
});
