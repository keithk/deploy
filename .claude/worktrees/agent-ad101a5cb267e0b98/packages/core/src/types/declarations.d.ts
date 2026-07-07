// Type declarations for external modules
declare module "@keithk/deploy-server" {
  export function discoverSites(
    sitesDir: string,
    mode?: string
  ): Promise<any[]>;
}
