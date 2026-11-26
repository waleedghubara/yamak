# Yamak — iOS build & App Store upload

One Expo codebase (Expo SDK 57, React Native 0.86, TypeScript) produces **two separate apps**:

| App | `APP_VARIANT` | Display name | Bundle ID | EAS build profile |
|---|---|---|---|---|
| Customer | `customer` | يمك تكسي | `iq.yamak.app` | `customer-production` |
| Captain (driver) | `captain` | يمك كابتن | `iq.yamak.captain` | `captain-production` |

- Version: `1.4.4` (in `app.config.ts`). Build numbers are managed by EAS (`"appVersionSource": "remote"`).
- Backend: `https://api.yamaktaxi.com` (set in `yamak.config.json`; do not change).
- `ios/` and `android/` folders are generated (Continuous Native Generation). Do not edit them by hand.
- Verified before handoff: `npm ci`, `tsc --noEmit` and `expo prebuild -p ios` succeed for both variants.

## CRITICAL — why 1.4.4 exists (read before building)

**1.4.0 crashed on launch on every device, in BOTH apps** (customer and captain):
splash screen, then the app quits after a fraction of a second. Android was fine.

### Root cause (confirmed from the iOS crash report)

The crash report shows `RCTExceptionsManager reportFatal` on
`com.meta.react.turbomodulemanager.queue`, `EXC_CRASH (SIGABRT)`, **244 ms after
launch** — a fatal JavaScript exception during the very first render, before any
network call. This is not a signing, entitlement or build-configuration problem.

`expo-sharing`'s `useIncomingShare()` hook starts with:

```js
const [sharedPayloads, setSharedPayloads] = useState(getSharedPayloads());
```

`getSharedPayloads()` calls the native module **synchronously during the first
render, with no error handling**. On iOS that call throws whenever the Share
Extension / App Group is not present in the build — and a throw during render is
a fatal error in a Release build.

Our `<IncomingLocation />` component called that hook and is mounted
unconditionally in the root layout of **both** apps, so both crashed. The captain
app was built with `SHARING_EXTENSION: "0"`, which removes the extension — and
that is exactly the condition that makes the native call throw.

`expo-sharing` was added in 1.4.0, which is why 1.2.0 and 1.3.0 were fine.

### The fix (1.4.4)

`src/components/IncomingLocation.tsx` no longer uses `useIncomingShare`. It reads
the shared payload **after** render, inside `try/catch`. If the extension is
missing, that one feature silently does nothing and the app runs normally.

### iOS app extensions are now OFF by default

Both iOS extensions are **disabled by default** in 1.4.4, so the build needs no
extra App IDs, no App Group and no extra provisioning profiles:

```
LIVE_ACTIVITY=1       # opt in to the Live Activity widget extension
SHARING_EXTENSION=1   # opt in to the iOS share extension (needs an App Group)
```

Please build with the plain `customer-production` / `captain-production`
settings and **do not set these variables**. Your existing
`SHARING_EXTENSION: "0"` in the captain workflow stays correct and harmless.

Note: this only affects iOS. **Android sharing is unchanged and still enabled**,
and location links (`geo:` and Google Maps URLs) keep opening the app on both
platforms — neither needs an app extension.

### Verified here
* `tsc --noEmit` — 0 errors
* `npx expo export --platform ios` — the JS bundle builds for **both** variants
* `npx expo config --type public` — both variants resolve, version 1.4.4
* a startup regression check: the shipped 1.4.0 component crashes under a missing
  native module, the 1.4.4 component does not

## Please test on a real device before submitting
Install through **TestFlight on a physical iPhone** and confirm each app opens
past the splash screen. 1.4.0 passed App Review and still crashed for every user,
so review alone does not catch this.

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

### تنبيه مهم بالعربي
نسخة **1.4.0** كانت تنغلق عند الإقلاع على **كل** الأجهزة وبـ**التطبيقين**. سجل الانهيار من الآيفون
أثبت السبب: خطأ جافاسكربت قاتل أثناء أول رسم، بعد ٢٤٤ ملي ثانية من الإقلاع — مو مشكلة توقيع ولا بناء.

الخطّاف `useIncomingShare` من `expo-sharing` ينادي الوحدة الأصلية **أثناء الرسم وبدون حماية**،
وهاي المناداة ترمي استثناء على الآيفون إذا Share Extension مو موجود بالبناء. والمكوّن اللي يناديها
موجود بجذر التطبيقين، فالاثنين ينهاران.

بنسخة **1.4.3** صارت القراءة بعد الرسم وداخل try/catch. الامتدادان رجعا شغالين افتراضياً، وإطفاء
أي واحد منهما صار آمن تماماً — متغيراتكم بـ`codemagic.yaml` تشتغل مثل ما هي، بضمنها
`SHARING_EXTENSION: "0"` بتطبيق الكابتن.

**جرّبوا على آيفون حقيقي عبر TestFlight قبل الرفع.**
