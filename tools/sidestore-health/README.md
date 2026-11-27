# SideStore with HealthKit

Stock SideStore (0.6.4) never asks Apple to switch on HealthKit for an app, so the HealthKit permission is dropped when
it signs. Apple's capability table lists HealthKit for free accounts:
https://developer.apple.com/help/account/reference/supported-capabilities-ios

`healthkit.patch` adds the capability (`HK421J6T7P`) to SideStore's signing library. The workflow
`.github/workflows/sidestore-health.yml` builds the official, pinned SideStore source with only that change.
The approach comes from https://github.com/scootsy/HIIT/pull/16.

**Status:** not yet proven with a real Apple Account on a real phone. If Apple refuses the capability, SideStore shows
an error when installing the app, or the app still reports the missing entitlement.

SideStore is licensed under the GNU AGPL-3.0; this build is unofficial and for personal use.

## Use (Windows)
1. Install SideStore once with iloader (https://iloader.app), which also places the pairing file; follow
   https://docs.sidestore.io/docs/installation/install. Install LocalDevVPN from the App Store.
2. Replace it with `SideStore-HealthKit.ipa` (same app, so it installs over the official one).
3. In SideStore, with LocalDevVPN connected, install `Planner-health.ipa` and keep its app extension.

## Updating
The patch targets one release. For a newer SideStore, update both commit ids in the workflow and re-check the patch.
