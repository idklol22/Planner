# Putting Planner on your iPhone (from Windows)

The iPhone app is built for you by GitHub Actions on a Mac in the cloud. You do not need a Mac. Every successful build produces a file called `Planner.ipa`. AltStore (or SideStore) puts your free Apple ID's signature on that file and installs it on your phone.

## 1. One-time setup on your Windows PC

Using AltStore (the usual way):

1. On your Windows PC, go to [altstore.io](https://altstore.io) and download **AltServer**.
2. Install iTunes from Apple, not the version from the Microsoft Store. AltServer uses it to talk to the iPhone. (iCloud for Windows also works.)
3. Open AltServer. Connect the iPhone with its cable and tap **Trust this computer** on the phone if it asks.
4. Click the AltServer icon in the Windows tray, choose **Install AltStore** and select your iPhone. Sign in with the free Apple ID you want to use. If your Apple ID has two-factor authentication, create an app-specific password at [appleid.apple.com](https://appleid.apple.com) and enter that instead of your usual password.
5. **AltStore** now appears on the iPhone. Keep it installed - you will use it to install and refresh Planner.

If AltServer will not install on your PC, use **SideStore** instead. Follow the SideStore Windows guide; it does the same job with a free Apple ID, and its refreshes do not need AltServer running.

## 2. Download the latest build

1. On GitHub, open the Planner repository and click **Actions**.
2. Open the newest successful run of **iOS build (unsigned IPA for AltStore)**. If there is no successful run yet, click **Run workflow** and wait for it to finish.
3. Under **Artifacts**, download **Planner.ipa**. GitHub downloads a ZIP file; unzip it to get `Planner.ipa`.
4. Get that file onto the phone: AirDrop it, email it to yourself and open the email on the phone, or copy it across with a USB cable.

## 3. Install Planner on the phone

1. Open **AltStore** on the iPhone and go to **My Apps**.
2. Tap the **+** at the top, then choose `Planner.ipa`.
3. AltStore signs the app with your Apple ID and installs it. Wait for the Planner icon to appear on the home screen.
4. If iOS says the developer is not trusted, go to **Settings > General > VPN & Device Management**, choose your Apple ID and tap **Trust**.

With SideStore, open it and use its install option to pick the same `Planner.ipa` instead.

## 4. The 7-day refresh

Apple only lets a free Apple ID sign an app for 7 days. After a week, Planner will refuse to open until it is refreshed:

- Leave AltServer running on the PC and keep the iPhone on the same Wi-Fi. AltStore normally refreshes in the background; you can also open AltStore > **My Apps** and tap **Refresh** (or **Refresh All**).
- If the PC was off or you were away, reconnect to the same Wi-Fi and refresh as soon as you can.
- If the app has already expired, install `Planner.ipa` again from AltStore. Your Planner data stays on the phone.
- SideStore can refresh over the internet after its one-time setup, so the PC does not need to be on or even nearby.

## 5. Free Apple ID limits

- You can have up to **3 sideloaded apps** on the phone at once, and AltStore counts as one of them. Remove an old sideloaded app before adding another if you hit this limit.
- Apple allows **10 new app IDs per 7-day period**. Reinstalling the same app is fine; installing many different apps can reach this cap. If it happens, wait a week or use a different free Apple ID.
- Free signing is for personal use: no App Store listing and no push notifications. The IPA from GitHub is unsigned on purpose; AltStore or SideStore adds your personal signature when you install it.
