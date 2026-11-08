# Yamak — iOS build & App Store upload

One Expo codebase (Expo SDK 57, React Native 0.86, TypeScript) produces **two separate apps**:

| App | `APP_VARIANT` | Display name | Bundle ID | EAS build profile |
|---|---|---|---|---|
| Customer | `customer` | يمك تكسي | `iq.yamak.app` | `customer-production` |
| Captain (driver) | `captain` | يمك كابتن | `iq.yamak.captain` | `captain-production` |

- Version: `1.2.0` (in `app.config.ts`). Build numbers are managed by EAS (`"appVersionSource": "remote"`).
- Backend: `https://api.yamaktaxi.com` (set in `yamak.config.json`; do not change).
- `ios/` and `android/` folders are generated (Continuous Native Generation). Do not edit them by hand.
- Verified before handoff: `npm ci`, `tsc --noEmit` and `expo prebuild -p ios` succeed for both variants.

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
- تطبيقين من نفس الكود: **يمك تكسي** (`iq.yamak.app`) و**يمك كابتن** (`iq.yamak.captain`). يتحدد التطبيق بالمتغير `APP_VARIANT=customer` أو `captain`.
- البناء الأسهل يكون بـ EAS (الأوامر فوق)، أو بـ Xcode على ماك.
- لمراجعة أبل: رقم مراجعة ورمز ثابت يطلبونه من صاحب يمك. تطبيق الكابتن يستخدم الموقع بالخلفية بس وهو متصل أو بالرحلة، وحذف الحساب موجود داخل التطبيق.
