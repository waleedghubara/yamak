# Yamak — iOS build & App Store upload

One Expo codebase (Expo SDK 57, React Native 0.86, TypeScript) produces **two separate apps**:

| App | `APP_VARIANT` | Display name | iOS bundle ID | Android package | EAS build profile |
|---|---|---|---|---|---|
| Customer | `customer` | يمك تكسي | `com.waleedghubara.yamak.customer` | `iq.yamak.app` | `customer-production` |
| Captain (driver) | `captain` | يمك كابتن | `com.waleedghubara.yamak.captain` | `iq.yamak.captain` | `captain-production` |

The iOS bundle identifiers can be overridden with `IOS_BUNDLE_IDENTIFIER`.

- Version: `1.4.0` (in `app.config.ts`). Build numbers are managed by EAS (`"appVersionSource": "remote"`).
- Backend: `https://api.yamaktaxi.com` (set in `yamak.config.json`; do not change).
- `ios/` and `android/` folders are generated (Continuous Native Generation). Do not edit them by hand.
- Verified before handoff: `tsc --noEmit` passes with 0 errors and `expo config` evaluates for both variants.
  `expo prebuild -p ios`, `pod install` and the Xcode archive need macOS and were not run — please verify them on your side.

## What's new in 1.4.0 (read before building)
Full technical list: **`CHANGES-1.4.0.md`** in this package.

- **New dependencies — run `npm ci` again:** `expo-sharing@~57.0.26`, `expo-audio@~57.0.5`, `expo-asset@~57.0.18`.
  `expo-asset` is pinned deliberately; without the pin npm hoists a newer copy and the JS bundle fails to build.
- **New iOS extension — customer app only.** `expo-sharing` adds a Share Extension so a customer can share a WhatsApp location straight into the app.
  Target `expo-sharing-extension`, bundle ID **`com.waleedghubara.yamak.customer.expo-sharing-extension`**, App Group **`group.com.waleedghubara.yamak.customer`**.
  Run the **first** customer build interactively (no `--non-interactive`) and sign in to Apple when asked, so EAS registers the App ID and the App Group. The customer app now has **two** extensions (this one and Live Activity).
- **Custom notification sound — captain app only:** `assets/yamak_ring.wav` registered through `expo-notifications`. It is the ride-offer ring (three rings, then it stops).
- **New Info.plist key:** `LSApplicationQueriesSchemes = ["maps", "comgooglemaps", "waze"]`, so the captain app can hand the route to Apple Maps / Google Maps / Waze.
- **Dark mode:** `userInterfaceStyle` is now `automatic` (was `light`). Both apps follow the iPhone appearance setting; every screen was restyled for it.
- **Khatti (shared lines)** in both apps, **one ride category** instead of taxi/private, rebuilt captain home screen, promo codes applied with one tap, captain rewards, offline caching and an update gate.
- Unchanged: bundle identifiers, the Live Activity extension, EAS profiles, and the backend URL.

## Requirements
- Node.js 20 or newer, npm
- An Apple Developer account, with two App Store Connect app records using the bundle IDs above
- An Expo (EAS) account for the cloud build, **or** a Mac with Xcode for a local build

## Option A — EAS cloud build (recommended, no Mac needed)
```bash
npm ci
npx eas-cli@latest login

# Using your own Expo account? First clear easProjectIdCustomer / easProjectIdCaptain
# in yamak.config.json, then link each app to your account and paste the printed IDs back:
npx cross-env APP_VARIANT=customer npx eas-cli@latest init
npx cross-env APP_VARIANT=captain  npx eas-cli@latest init

# Build (EAS creates/uses the distribution certificate and provisioning profile)
npx cross-env APP_VARIANT=customer npx eas-cli@latest build -p ios --profile customer-production
npx cross-env APP_VARIANT=captain  npx eas-cli@latest build -p ios --profile captain-production

# Upload to App Store Connect / TestFlight
npx cross-env APP_VARIANT=customer npx eas-cli@latest submit -p ios --profile customer-production
npx cross-env APP_VARIANT=captain  npx eas-cli@latest submit -p ios --profile captain-production
```
`APP_VARIANT` must be set on every command, because it selects the name, icon and bundle ID.

## Option B — Local Xcode build (Mac)
```bash
npm ci
APP_VARIANT=customer npx expo prebuild -p ios --clean
cd ios && pod install && open *.xcworkspace
# Xcode: select your Team -> set Build number -> Product > Archive -> Distribute App -> App Store Connect
```
Repeat with `APP_VARIANT=captain`, always using `--clean` when you switch variants.

## Notes for App Review
- **Login:** phone number + 6-digit code sent on WhatsApp. Ask the Yamak owner for the **review phone number and its fixed code** (configured on the server) and put them in *App Review Information*.
- **Captain app — background location:** used only while the captain is online or on an active trip, so they receive nearby requests and the customer can track arrival. iOS shows the blue location indicator. The customer app uses location only while in use.
- **Account deletion:** available inside both apps (Account → Delete account).
- **Encryption:** `ITSAppUsesNonExemptEncryption = false` is already set.
- **Payments:** cash only, so there are no in-app purchases.
- **Privacy policy / Terms:** use the same links as the Google Play listing.

---

## بالعربي (مختصر)
- تطبيقين من نفس الكود: **يمك تكسي** و**يمك كابتن** (معرّفات آبل: `com.waleedghubara.yamak.customer` و`com.waleedghubara.yamak.captain`). يتحدد التطبيق بالمتغير `APP_VARIANT=customer` أو `captain`.
- البناء الأسهل يكون بـ EAS (الأوامر فوق)، أو بـ Xcode على ماك.
- لمراجعة أبل: رقم مراجعة ورمز ثابت يطلبونه من صاحب يمك. تطبيق الكابتن يستخدم الموقع بالخلفية بس وهو متصل أو بالرحلة، وحذف الحساب موجود داخل التطبيق.

## Store screenshots

`screenshots/` holds the 1.4.0 store images for both variants (6 customer + 6 captain)
plus each variant's 512x512 icon. See `screenshots/README.md` for the screen-by-screen list.
All personal data inside the images is demo data.
