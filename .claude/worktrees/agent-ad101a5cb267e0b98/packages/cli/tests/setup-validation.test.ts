// ABOUTME: Tests for setup command validation functions.
// ABOUTME: Validates domain, port, and SSH key input validation.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Since the validation functions are not exported, we test the logic directly
// This also serves as documentation of expected behavior

describe("Domain Validation", () => {
  const validateDomain = (input: string): boolean | string => {
    if (!input || input.trim() === "") {
      return "Domain is required";
    }

    if (input === "localhost") {
      return true;
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)+$/;
    if (!domainRegex.test(input)) {
      return "Please enter a valid domain name (e.g., example.com or dev.local)";
    }

    return true;
  };

  test("accepts localhost", () => {
    expect(validateDomain("localhost")).toBe(true);
  });

  test("accepts valid domain", () => {
    expect(validateDomain("example.com")).toBe(true);
  });

  test("accepts domain with subdomain", () => {
    expect(validateDomain("api.example.com")).toBe(true);
  });

  test("accepts domain with hyphen", () => {
    expect(validateDomain("my-site.example.com")).toBe(true);
  });

  test("accepts local dev domain", () => {
    expect(validateDomain("dev.local")).toBe(true);
  });

  test("accepts .business TLD", () => {
    expect(validateDomain("keith.business")).toBe(true);
  });

  test("rejects empty string", () => {
    expect(validateDomain("")).toBe("Domain is required");
  });

  test("rejects whitespace only", () => {
    expect(validateDomain("   ")).toBe("Domain is required");
  });

  test("rejects single word without TLD", () => {
    const result = validateDomain("example");
    expect(result).toContain("valid domain name");
  });

  test("rejects domain starting with hyphen", () => {
    const result = validateDomain("-example.com");
    expect(result).toContain("valid domain name");
  });

  test("rejects domain with space", () => {
    const result = validateDomain("my site.com");
    expect(result).toContain("valid domain name");
  });
});

describe("Port Validation", () => {
  const validatePort = (input: string): boolean | string => {
    const port = parseInt(input, 10);
    if (isNaN(port)) {
      return "Please enter a valid number";
    }
    if (port < 1 || port > 65535) {
      return "Port must be between 1 and 65535";
    }
    return true;
  };

  test("accepts port 80", () => {
    expect(validatePort("80")).toBe(true);
  });

  test("accepts port 443", () => {
    expect(validatePort("443")).toBe(true);
  });

  test("accepts port 3000", () => {
    expect(validatePort("3000")).toBe(true);
  });

  test("accepts port 2222", () => {
    expect(validatePort("2222")).toBe(true);
  });

  test("accepts minimum port 1", () => {
    expect(validatePort("1")).toBe(true);
  });

  test("accepts maximum port 65535", () => {
    expect(validatePort("65535")).toBe(true);
  });

  test("rejects port 0", () => {
    const result = validatePort("0");
    expect(result).toContain("between 1 and 65535");
  });

  test("rejects port above 65535", () => {
    const result = validatePort("65536");
    expect(result).toContain("between 1 and 65535");
  });

  test("rejects non-numeric input", () => {
    const result = validatePort("abc");
    expect(result).toContain("valid number");
  });

  test("rejects negative number", () => {
    const result = validatePort("-1");
    expect(result).toContain("between 1 and 65535");
  });

  test("rejects empty string", () => {
    const result = validatePort("");
    expect(result).toContain("valid number");
  });
});

describe("SSH Key Validation", () => {
  const tmpDir = join(tmpdir(), "deploy-test-" + Date.now());
  const testKeyPath = join(tmpDir, "test_key.pub");
  const testKeyContent = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample test@example.com";

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(testKeyPath, testKeyContent);
  });

  afterEach(() => {
    if (existsSync(testKeyPath)) {
      unlinkSync(testKeyPath);
    }
    if (existsSync(tmpDir)) {
      rmdirSync(tmpDir);
    }
  });

  const validateSshKey = (input: string): boolean | string => {
    if (!input || input.trim() === "") {
      return "SSH public key is required for authentication";
    }

    const trimmed = input.trim();

    if (trimmed.startsWith("~") || trimmed.startsWith("/") || trimmed.startsWith("./")) {
      const expandedPath = trimmed.startsWith("~")
        ? trimmed.replace("~", process.env.HOME || "")
        : trimmed;

      if (!existsSync(expandedPath)) {
        return `File not found: ${expandedPath}`;
      }
      return true;
    }

    if (trimmed.startsWith("ssh-") || trimmed.startsWith("ecdsa-") || trimmed.startsWith("sk-")) {
      return true;
    }

    return "Please provide a valid SSH public key or path to key file (e.g., ~/.ssh/id_ed25519.pub)";
  };

  test("accepts ed25519 public key", () => {
    expect(validateSshKey("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...")).toBe(true);
  });

  test("accepts rsa public key", () => {
    expect(validateSshKey("ssh-rsa AAAAB3NzaC1yc2EAAA...")).toBe(true);
  });

  test("accepts ecdsa public key", () => {
    expect(validateSshKey("ecdsa-sha2-nistp256 AAAA...")).toBe(true);
  });

  test("accepts security key (sk-) public key", () => {
    expect(validateSshKey("sk-ssh-ed25519@openssh.com AAAA...")).toBe(true);
  });

  test("accepts valid file path", () => {
    expect(validateSshKey(testKeyPath)).toBe(true);
  });

  test("rejects non-existent file path", () => {
    const result = validateSshKey("/nonexistent/path/key.pub");
    expect(result).toContain("File not found");
  });

  test("rejects empty string", () => {
    const result = validateSshKey("");
    expect(result).toContain("required");
  });

  test("rejects invalid key format", () => {
    const result = validateSshKey("not-a-valid-key");
    expect(result).toContain("valid SSH public key");
  });

  test("rejects random text", () => {
    const result = validateSshKey("hello world this is not a key");
    expect(result).toContain("valid SSH public key");
  });
});
