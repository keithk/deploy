/**
 * Helper utilities for site management
 */

/**
 * Check if a site is the default/home site
 */
export function isDefaultSite(siteName: string): boolean {
  return siteName === 'home';
}

/**
 * Generate the correct URL for a site
 */
export function getSiteUrl(siteName: string, baseDomain?: string): string {
  const domain = baseDomain || process.env.PROJECT_DOMAIN || 'dev.deploy';
  
  // Special case for home site - use base domain
  if (isDefaultSite(siteName)) {
    return `https://${domain}`;
  }
  
  // Other sites use subdomain format
  return `https://${siteName}.${domain}`;
}

/**
 * Generate the correct domain for database storage
 */
export function getSiteDomain(siteName: string, baseDomain?: string): string {
  const domain = baseDomain || process.env.PROJECT_DOMAIN || 'dev.deploy';
  
  // Special case for home site - just use base domain
  if (isDefaultSite(siteName)) {
    return domain;
  }
  
  // Other sites use subdomain format
  return `${siteName}.${domain}`;
}

/**
 * Sanitize file paths to prevent directory traversal
 */
export function sanitizePath(path: string): string {
  // Remove any .. or . components
  const parts = path.split('/').filter(part => 
    part && part !== '.' && part !== '..'
  );
  
  return parts.join('/');
}

/**
 * Check if a file should be editable
 */
export function isEditableFile(filename: string): boolean {
  const editableExtensions = [
    '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx',
    '.json', '.md', '.txt', '.yml', '.yaml', '.toml',
    '.env', '.gitignore', '.astro', '.vue', '.svelte',
    '.php', '.py', '.rb', '.go', '.rs', '.java', '.c',
    '.cpp', '.h', '.hpp', '.sh', '.bash', '.zsh'
  ];
  
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return editableExtensions.includes(ext);
}

/**
 * Get file type for syntax highlighting
 */
export function getFileLanguage(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
  
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript', 
    'tsx': 'typescript',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'php': 'php',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'yml': 'yaml',
    'yaml': 'yaml',
    'toml': 'toml',
    'astro': 'html',
    'vue': 'html',
    'svelte': 'html'
  };
  
  return languageMap[ext] || 'text';
}