# Yamak 1.4.4 — critical fix for the 1.4.0 / 1.4.1 launch crash

**Rebuild both apps from this source.** The binaries currently on the App Store
crash on launch on every device.

## What was wrong

The iOS crash report shows `RCTExceptionsManager reportFatal` on
`com.meta.react.turbomodulemanager.queue`, `EXC_CRASH (SIGABRT)`, **244 ms after
launch** — a fatal JavaScript exception during the first render, before any
network call. It is not a signing, entitlement or build-configuration problem.

`expo-sharing`'s `useIncomingShare()` hook begins with:

```js
const [sharedPayloads, setSharedPayloads] = useState(getSharedPayloads());
```

`getSharedPayloads()` calls the native module **synchronously during render,
with no error handling**. On iOS that throws whenever the Share Extension / App
Group is not present in the build, and a throw during render is fatal in a
Release build.

`<IncomingLocation />` used that hook and is mounted unconditionally in the root
layout of **both** apps, so both crashed:

* **Captain** — built with `SHARING_EXTENSION: "0"`, so the extension is absent.
* **Customer** — the extension is built, but its **App Group** is not registered
  on the Apple account, so the native call cannot read the shared container.

`expo-sharing` arrived in 1.4.0, which is why 1.2.0 and 1.3.0 were fine.

## What changed

1. `src/components/IncomingLocation.tsx` — no longer uses `useIncomingShare`.
   The shared payload is read **after** render, inside `try/catch`. If the
   extension is missing, that one feature does nothing and the app runs normally.

2. **iOS app extensions are now OFF by default.** No extra App IDs, no App Group
   and no extra provisioning profiles are needed. Build with the plain
   `customer-production` / `captain-production` settings and do **not** set these:

   ```
   LIVE_ACTIVITY=1       # opt in to the Live Activity widget extension
   SHARING_EXTENSION=1   # opt in to the iOS share extension (needs an App Group)
   ```

   This affects iOS only. **Android sharing is unchanged and still enabled**, and
   location links (`geo:`, Google Maps URLs) keep opening the app on both
   platforms — neither needs an app extension.

3. Captain app — "My rides" opened the customer UI. It now has its own route, the
   back button stays inside the captain app, and the bottom tab bar respects the
   safe area. (Already in the customer repo as 1.4.1; new for the captain repo.)

Your settings are preserved: iOS bundle IDs `com.waleedghubara.yamak.customer` /
`.captain` (overridable with `IOS_BUNDLE_IDENTIFIER`), remote notifications, and
your Codemagic workflows.

## Verified before sending

* `tsc --noEmit` — 0 errors
* `npx expo export --platform ios` — the JS bundle builds for both variants
* `npx expo config --type public` — both variants resolve, version 1.4.4
* a startup regression check: the shipped component crashes when the native
  module is unavailable; the new one does not

## Please test on a real device before submitting

Install through **TestFlight on a physical iPhone** and confirm each app opens
past the splash screen. 1.4.0 passed App Review and still crashed for every
user, so review alone does not catch this.
