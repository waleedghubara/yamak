# Yamak 1.4.0 — what changed since 1.3.0

One Expo codebase, two apps (`APP_VARIANT=customer` / `captain`). Version in
`app.config.ts` is now **1.4.0**; build numbers stay managed by EAS
(`"appVersionSource": "remote"`).

---

## Read this first (iOS build impact)

1. **New dependencies — run `npm ci` again:**
   `expo-sharing@~57.0.26`, `expo-audio@~57.0.5`, `expo-asset@~57.0.18`.
   `expo-asset` is pinned on purpose: without the pin, npm hoists a newer
   `expo-asset` that `expo-audio` pulls in and the JS bundle fails to build.

2. **New iOS app extension — customer app only.**
   `expo-sharing` adds a Share Extension so a customer can share a WhatsApp
   location straight into the app.

   | | |
   |---|---|
   | Target name | `expo-sharing-extension` |
   | Extension bundle ID | `com.waleedghubara.yamak.customer.expo-sharing-extension` |
   | App Group | `group.com.waleedghubara.yamak.customer` |

   Run the **first** customer build interactively (no `--non-interactive`) and
   sign in to Apple when asked, so EAS registers the App ID and the App Group
   and creates the provisioning profiles. This is the same procedure that
   1.3.0 needed for the Live Activity extension — the customer app now has
   **two** extensions.

3. **Custom notification sound — captain app only.**
   `assets/yamak_ring.wav` is registered with `expo-notifications`
   (`sounds: ['./assets/yamak_ring.wav']`). It is the ride-offer ring: three
   rings, then it stops.

4. **New Info.plist key:** `LSApplicationQueriesSchemes = ["maps",
   "comgooglemaps", "waze"]`, so the captain app can hand a route to Apple
   Maps / Google Maps / Waze.

5. **Dark mode:** `userInterfaceStyle` changed from `light` to `automatic`.
   Both apps now follow the iPhone's appearance setting, and every screen was
   restyled for it.

Bundle identifiers, the Live Activity extension, EAS profiles and the backend
URL are unchanged.

---

## Features

### Khatti — shared lines (both apps)
Scheduled shared rides inside Kirkuk. Customers browse and book published
lines or request one; captains publish lines and receive bookings. Filters by
passenger type (men / women / families / students / mixed). Yamak is an
intermediary only — the fare is agreed between the two parties.

New: `src/app/khatti/index.tsx`, `src/app/khatti/new.tsx`,
`src/app/khatti/bookings.tsx`, `src/lib/khatti.ts`.

### Share a location from WhatsApp (customer)
Two ways in, both land on the booking screen with the destination filled and
the price already calculated:

* tapping the location in WhatsApp and choosing Yamak (`geo:` link), and
* Share → Yamak on the message (Share Extension / `ACTION_SEND`).

New: `src/app/+native-intent.ts`, `src/components/IncomingLocation.tsx`.
Shortened Google Maps links are resolved server-side
(`GET /api/geo/resolve`, allow-listed hosts only).

### Captain home screen, rebuilt
Map-first layout: the map fills the screen, the balance card, rating and menu
float on top, and a fixed bar at the bottom holds the big online/offline
button. While a trip is running the screen switches to a dedicated trip view —
the ride controls are no longer mixed with the request controls. A recenter
button was added on both the home and trip views.

### One ride category
Taxi and private were merged into a single category, so the customer picks a
destination and gets one price.

### Customer home screen
The mini-map was removed, the tiles are smaller, and "Yamak offers" now shows
live promo codes applied with one tap (no copying, no typing).

New: `src/app/discounts.tsx`, `src/lib/home.ts`,
`src/components/AccountCircle.tsx`.

### Captain rewards
Rewards for completed rides, credited to the captain's balance automatically.

New: `src/app/captain/rewards.tsx`.

### Ride-offer ring
A dedicated ring for incoming ride offers: three rings then silence, with a
matching vibration pattern. Previously the sound kept repeating.

New: `assets/yamak_ring.wav`.

### Welcome animation
A short logo animation with a one-line greeting the first time the app opens
in a session.

New: `src/components/Welcome.tsx`.

### Battery optimisation notice (captain, Android only)
A one-time explanation of how to exempt the app from battery optimisation, so
a captain does not stop receiving offers. iOS is unaffected.

New: `src/components/BatteryNotice.tsx`.

### Offline support and update gate
Cached data keeps the app usable on a weak connection, and an update gate
blocks a version the server no longer supports.

New: `src/lib/offline.ts`, `src/components/UpdateGate.tsx`.

---

## Removed

* `src/components/NavHud.tsx` — the in-app navigation HUD; the captain app now
  hands the route to an external navigation app.
* `src/lib/nav.ts` — replaced by `src/lib/navApp.ts`.

---

## Translations

`ar`, `ckb` and `tk` carry the same 798 keys, with no key missing in any
language. Every server error code reachable from the apps has a message.

---

## Verified before handoff

* `npx tsc --noEmit` — 0 errors
* `npx expo config --type public` — evaluates for both variants and returns
  the expected names, version 1.4.0 and bundle identifiers

`expo prebuild -p ios`, `pod install` and the Xcode archive need macOS and
were **not** run here — please verify them on your side.
