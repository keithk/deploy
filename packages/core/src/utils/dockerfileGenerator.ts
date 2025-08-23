import { join } from "path";
import { readFileSync, existsSync } from "fs";

/**
 * Supported project types for Dockerfile generation
 */
export type ProjectType = "nodejs" | "python" | "static" | "unknown";

/**
 * Docker template configuration
 */
export interface DockerTemplate {
  baseImage: string;
  workdir: string;
  copyInstructions: string[];
  installCommands: string[];
  exposePort: number;
  startCommand: string;
  buildCommands?: string[];
}

/**
 * Detects the project type based on files in the directory
 */
export function detectProjectType(sitePath: string): ProjectType {
  // Check for Node.js
  if (existsSync(join(sitePath, "package.json"))) {
    return "nodejs";
  }

  // Check for Python
  if (
    existsSync(join(sitePath, "requirements.txt")) ||
    existsSync(join(sitePath, "pyproject.toml")) ||
    existsSync(join(sitePath, "Pipfile")) ||
    existsSync(join(sitePath, "setup.py"))
  ) {
    return "python";
  }

  // Check for static files
  if (
    existsSync(join(sitePath, "index.html")) ||
    existsSync(join(sitePath, "index.htm"))
  ) {
    return "static";
  }

  return "unknown";
}

/**
 * Gets the package manager used by a Node.js project
 */
export function detectNodePackageManager(sitePath: string): "npm" | "yarn" | "pnpm" | "bun" {
  if (existsSync(join(sitePath, "bun.lockb")) || existsSync(join(sitePath, "bun.lock"))) {
    return "bun";
  }
  if (existsSync(join(sitePath, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(sitePath, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
}

/**
 * Analyzes a Node.js package.json to determine build and start commands
 */
export function analyzePackageJson(sitePath: string): {
  hasBuildScript: boolean;
  hasStartScript: boolean;
  buildScript?: string;
  startScript?: string;
  nodeVersion?: string;
} {
  const packageJsonPath = join(sitePath, "package.json");
  
  if (!existsSync(packageJsonPath)) {
    return { hasBuildScript: false, hasStartScript: false };
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const scripts = packageJson.scripts || {};
    
    return {
      hasBuildScript: !!scripts.build,
      hasStartScript: !!scripts.start,
      buildScript: scripts.build,
      startScript: scripts.start,
      nodeVersion: packageJson.engines?.node
    };
  } catch (error) {
    console.warn(`Failed to parse package.json in ${sitePath}:`, error);
    return { hasBuildScript: false, hasStartScript: false };
  }
}

/**
 * Gets Docker template for a specific project type
 */
export function getDockerTemplate(sitePath: string, projectType: ProjectType): DockerTemplate {
  switch (projectType) {
    case "nodejs":
      return getNodejsTemplate(sitePath);
    case "python":
      return getPythonTemplate(sitePath);
    case "static":
      return getStaticTemplate();
    default:
      return getDefaultTemplate();
  }
}

/**
 * Generates Node.js Docker template with smart defaults
 */
function getNodejsTemplate(sitePath: string): DockerTemplate {
  const packageManager = detectNodePackageManager(sitePath);
  const analysis = analyzePackageJson(sitePath);
  
  let baseImage = "node:18-alpine";
  let installCommands: string[];
  let copyInstructions: string[];

  // Determine Node version if specified
  if (analysis.nodeVersion) {
    const majorVersion = analysis.nodeVersion.match(/(\d+)/)?.[1];
    if (majorVersion) {
      baseImage = `node:${majorVersion}-alpine`;
    }
  }

  // Configure package manager specific commands
  switch (packageManager) {
    case "bun":
      baseImage = "oven/bun:1-alpine";
      copyInstructions = ["COPY package.json bun.lock* ./"];
      installCommands = ["RUN bun install --frozen-lockfile"];
      break;
    case "pnpm":
      copyInstructions = ["COPY package.json pnpm-lock.yaml* ./"];
      installCommands = [
        "RUN npm install -g pnpm",
        "RUN pnpm install --frozen-lockfile"
      ];
      break;
    case "yarn":
      copyInstructions = ["COPY package.json yarn.lock* ./"];
      installCommands = ["RUN yarn install --frozen-lockfile"];
      break;
    default:
      copyInstructions = ["COPY package.json package-lock.json* ./"];
      installCommands = ["RUN npm ci"];
  }

  let buildCommands: string[] = [];
  let startCommand = "npm start";

  if (analysis.hasBuildScript) {
    buildCommands = [`RUN ${packageManager} run build`];
  }

  if (analysis.hasStartScript) {
    startCommand = `${packageManager} start`;
  } else if (packageManager === "bun") {
    startCommand = "bun run index.js";
  } else {
    startCommand = "node index.js";
  }

  return {
    baseImage,
    workdir: "/app",
    copyInstructions: [
      ...copyInstructions,
      "COPY . ."
    ],
    installCommands,
    buildCommands,
    exposePort: 3000,
    startCommand
  };
}

/**
 * Generates Python Docker template
 */
function getPythonTemplate(sitePath: string): DockerTemplate {
  let copyInstructions = ["COPY . ."];
  let installCommands: string[] = [];

  // Check for different dependency files
  if (existsSync(join(sitePath, "requirements.txt"))) {
    copyInstructions = ["COPY requirements.txt .", "COPY . ."];
    installCommands = ["RUN pip install --no-cache-dir -r requirements.txt"];
  } else if (existsSync(join(sitePath, "pyproject.toml"))) {
    copyInstructions = ["COPY pyproject.toml poetry.lock* ./", "COPY . ."];
    installCommands = [
      "RUN pip install poetry",
      "RUN poetry config virtualenvs.create false",
      "RUN poetry install --no-dev"
    ];
  } else if (existsSync(join(sitePath, "Pipfile"))) {
    copyInstructions = ["COPY Pipfile Pipfile.lock* ./", "COPY . ."];
    installCommands = [
      "RUN pip install pipenv",
      "RUN pipenv install --system --deploy"
    ];
  }

  return {
    baseImage: "python:3.11-alpine",
    workdir: "/app",
    copyInstructions,
    installCommands,
    exposePort: 8000,
    startCommand: "python app.py"
  };
}

/**
 * Generates static site Docker template using nginx
 */
function getStaticTemplate(): DockerTemplate {
  return {
    baseImage: "nginx:alpine",
    workdir: "/usr/share/nginx/html",
    copyInstructions: ["COPY . ."],
    installCommands: [],
    exposePort: 80,
    startCommand: "nginx -g 'daemon off;'"
  };
}

/**
 * Generates default Docker template for unknown project types
 */
function getDefaultTemplate(): DockerTemplate {
  return {
    baseImage: "alpine:latest",
    workdir: "/app",
    copyInstructions: ["COPY . ."],
    installCommands: ["RUN apk add --no-cache curl"],
    exposePort: 8080,
    startCommand: "echo 'Please configure your start command'"
  };
}

/**
 * Generates Dockerfile content from template
 */
export function generateDockerfileContent(template: DockerTemplate): string {
  const lines: string[] = [];
  
  lines.push(`FROM ${template.baseImage}`);
  lines.push("");
  lines.push(`WORKDIR ${template.workdir}`);
  lines.push("");
  
  // Add copy instructions
  for (const instruction of template.copyInstructions) {
    lines.push(instruction);
  }
  lines.push("");
  
  // Add install commands
  for (const command of template.installCommands) {
    lines.push(command);
  }
  
  if (template.installCommands.length > 0) {
    lines.push("");
  }
  
  // Add build commands if present
  if (template.buildCommands && template.buildCommands.length > 0) {
    for (const command of template.buildCommands) {
      lines.push(command);
    }
    lines.push("");
  }
  
  lines.push(`EXPOSE ${template.exposePort}`);
  lines.push("");
  lines.push(`CMD ${template.startCommand}`);
  
  return lines.join("\n");
}

/**
 * Generates a Dockerfile for a site with smart defaults
 */
export function generateDockerfile(sitePath: string): string {
  const projectType = detectProjectType(sitePath);
  const template = getDockerTemplate(sitePath, projectType);
  return generateDockerfileContent(template);
}