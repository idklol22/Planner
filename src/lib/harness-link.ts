/** Pure status text for the read-only LearnHarness link shown in Settings. */

export interface HarnessLinkState {
  exists: boolean;
  newestUpdatedAt: string | null;
}

export function harnessStatus(configured: boolean, link: HarnessLinkState): string {
  if (!configured) return "Set up cloud sync first";
  if (!link.exists || !link.newestUpdatedAt) return "Not linked yet";
  return `Linked, last synced ${new Date(link.newestUpdatedAt).toLocaleString()}`;
}
