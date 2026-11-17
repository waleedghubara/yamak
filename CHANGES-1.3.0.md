# Yamak 1.3.0 — update for the iOS apps (customer + captain)

This is your repository (waleedghubara/yamak) with the 1.3.0 changes applied on top.
Your own settings are kept: iOS bundle IDs `com.waleedghubara.yamak.customer` / `.captain`,
remote notifications, and your Codemagic workflows.

## Build (Codemagic, same as before)
- `customer-ios` and `captain-ios` workflows. Version is now **1.3.0** (app.config.ts).
- `npm ci` installs one new package: `expo-live-activity@0.4.2`.

### Customer app — new Live Activity extension
The customer app shows the captain's arrival time with a progress bar on the Lock Screen /
Dynamic Island (iOS 16.2+). It adds an app extension:

- Target `LiveActivity`, bundle ID **`com.waleedghubara.yamak.customer.LiveActivity`**
- `codemagic.yaml` now fetches signing files for it too (step "Fetch Live Activity Signing Files",
  `--create` registers the App ID if missing). No extra capabilities or App Groups are needed.
- If the extension ever blocks a build, set `LIVE_ACTIVITY: "0"` in the customer-ios vars:
  the app builds exactly as before, without the Lock Screen feature.

### Captain workflow fix
Expo prebuild names the captain Xcode project **`ymkkabtn`** (not `ymkkbtn`), so the
`captain-ios` workflow would stop at "Verify iOS Configuration". `XCODE_WORKSPACE` /
`XCODE_SCHEME` are corrected to `ymkkabtn`.

## What changed in the apps
- Captain app: fixed captains being logged out after swiping the app away while online.
- Customer app: Live Activity (arrival time + progress bar on the Lock Screen).
- Both apps: admin announcements pop up inside the app + a Notifications screen (bell icon).
- Same price for taxi and private; a pricier or unavailable category shows "unavailable".
- Rotating ad banner; admin can pause/resume customer ride requests (app shows a notice).
- Captain balance shown as green "current balance" / red "due to company".

## Checked before sending
`npm ci`, `tsc --noEmit` and `expo prebuild -p ios` succeed for both variants; the customer
project contains the `LiveActivity` target with the bundle ID above.
