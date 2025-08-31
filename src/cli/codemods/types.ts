export interface CodemodOptions {
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
}

export interface CodemodResult {
  success: boolean;
  changes: FileChange[];
  errors: string[];
}

export interface FileChange {
  type: 'move' | 'create' | 'delete' | 'update';
  from?: string;
  to?: string;
  content?: string;
  description: string;
}

export interface Codemod {
  name: string;
  description: string;
  version: string;
  run: (rootDir: string, options: CodemodOptions) => Promise<CodemodResult>;
}