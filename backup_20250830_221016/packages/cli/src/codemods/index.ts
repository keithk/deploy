import type { Codemod } from "./types";
import { configMigrationCodemod } from "./config-migration";
import { fileStructureMigrationCodemod } from "./file-structure-migration";

export const codemods: Record<string, Codemod> = {
  "config-migration": configMigrationCodemod,
  "file-structure": fileStructureMigrationCodemod
};

export function getCodemod(name: string): Codemod | undefined {
  return codemods[name];
}

export function listCodemods(): Array<{ name: string; description: string; version: string }> {
  return Object.entries(codemods).map(([name, codemod]) => ({
    name,
    description: codemod.description,
    version: codemod.version
  }));
}

export * from "./types";