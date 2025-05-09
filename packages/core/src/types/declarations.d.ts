// Type declarations for external modules
declare module "@dialup-deploy/server" {
  export function discoverSites(
    sitesDir: string,
    mode?: string
  ): Promise<any[]>;
}
