// ABOUTME: Dispatches all sites in a deploy group through a provided deploy function.
// ABOUTME: Starts members concurrently and reports asynchronous failures to the caller.

export function triggerDeployGroup(
  group: { sites: Array<{ id: string; name: string }> },
  deploy: (siteId: string) => Promise<{ success: boolean; error?: string }>,
  reportError: (message: string) => void
): void {
  for (const site of group.sites) {
    deploy(site.id)
      .then((result) => {
        if (!result.success) reportError(`Group deployment failed for ${site.name}: ${result.error}`);
      })
      .catch((err) => reportError(`Group deployment error for ${site.name}: ${err}`));
  }
}
