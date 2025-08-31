import { exec } from "child_process";
import { promisify } from "util";
import { debug, warn } from "./logging";

const execAsync = promisify(exec);

/**
 * Check if a port is currently in use
 * @param port The port number to check
 * @returns Promise<boolean> true if port is in use, false if available
 */
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    // Use lsof to check if port is in use
    const { stdout } = await execAsync(`lsof -i :${port}`);
    return stdout.trim() !== '';
  } catch (err) {
    // lsof returns non-zero exit code when no process is found
    return false;
  }
}

/**
 * Find the next available port starting from a given port
 * @param startPort The port to start checking from
 * @param maxAttempts Maximum number of ports to try (default: 100)
 * @returns Promise<number> The next available port, or -1 if none found
 */
export async function findAvailablePort(
  startPort: number, 
  maxAttempts: number = 100
): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    
    // Skip well-known ports that might cause issues
    if (port < 1024 || port > 65535) {
      continue;
    }
    
    const inUse = await isPortInUse(port);
    if (!inUse) {
      debug(`Found available port: ${port} (checked ${attempt + 1} ports)`);
      return port;
    }
  }
  
  warn(`Could not find available port after checking ${maxAttempts} ports starting from ${startPort}`);
  return -1;
}

/**
 * Find multiple available ports starting from a base port
 * @param basePort The port to start checking from
 * @param count Number of ports needed
 * @param spacing Minimum spacing between ports (default: 1)
 * @returns Promise<number[]> Array of available ports, or empty array if not enough found
 */
export async function findAvailablePorts(
  basePort: number,
  count: number,
  spacing: number = 1
): Promise<number[]> {
  const ports: number[] = [];
  let currentPort = basePort;
  const maxAttempts = 1000; // Allow checking up to 1000 ports
  let attempts = 0;
  
  while (ports.length < count && attempts < maxAttempts) {
    const availablePort = await findAvailablePort(currentPort, 1);
    
    if (availablePort === -1) {
      break;
    }
    
    ports.push(availablePort);
    currentPort = availablePort + spacing;
    attempts++;
  }
  
  if (ports.length < count) {
    warn(`Could only find ${ports.length} available ports out of ${count} requested`);
  }
  
  return ports;
}

/**
 * Get the default port range configuration
 * @returns Object with base port and range settings
 */
export function getPortConfig(): {
  basePort: number;
  range: number;
  spacing: number;
} {
  return {
    basePort: parseInt(process.env.DEV_PORT_BASE || "3001", 10),
    range: parseInt(process.env.DEV_PORT_RANGE || "1000", 10),
    spacing: parseInt(process.env.DEV_PORT_SPACING || "1", 10)
  };
}

/**
 * Validate that a port number is in a reasonable range
 * @param port The port number to validate
 * @returns boolean true if port is valid
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535 && port >= 1024;
}