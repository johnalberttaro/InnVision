# HPMS Reservation (Expo)

A simple, functional mobile app for a Hospitality Property Management
System (HPMS) student project. No login or registration required.

## Project structure

Standard Expo layout: a root `App.jsx` plus a `src/` folder, organized by
**feature area** so a bug in one part of the app is easy to isolate.

```
hpms-app/
├── App.jsx                          ← root: loads fonts, owns screen
│                                       routing + the full-screen reservation flow
├── app.json
├── babel.config.js
├── package.json
├── assets/
│   └── logo.png                     ← 🖼️ SWAP THIS to change the app logo
└── src/
    ├── screens/
    │   ├── home/
    │   │   └── HomeScreen.jsx              Nav bar, carousel, About section
    │   ├── reservation/
    │   │   └── ReservationScreen.jsx        Booking form, full-screen, owns its Close button
    │   ├── roomRates/
    │   │   └── RoomSelectionScreen.jsx      "Room & Rates"
    │   └── reviewPay/
    │       └── ReviewPayScreen.jsx          Final review + confirm
    │
    ├── components/
    │   ├── home/
    │   │   ├── ImageCarousel.jsx            Swipeable hero carousel — 📷 EDIT HERO_SLIDES HERE
    │   │   └── HamburgerMenu.jsx            Full-screen menu (mobile)
    │   ├── reservation/
    │   │   ├── DropdownTrigger.jsx          Pill-shaped tappable row
    │   │   ├── RangeCalendar.jsx            2-month range-select calendar
    │   │   └── GuestRoomSelector.jsx        Adults/Children + Add room popup
    │   ├── roomRates/
    │   │   └── RateCard.jsx                 One room-category card
    │   └── shared/
    │       ├── StepIndicator.jsx            Search/Room&Rates/Review&Pay bar
    │       └── StayBar.jsx                  Check-in|Check-out|Pax strip
    │
    └── utils/
        ├── theme.js                  Colors, spacing, AND fonts — one file
        ├── dateHelpers.js            Date formatting + validation
        ├── calendarHelpers.js        Month-grid generation + range math
        └── roomRates.js              Sample Twin/King rate data
```

Any file that returns JSX is `.jsx`; pure logic/data files
(`theme.js`, `dateHelpers.js`, `calendarHelpers.js`, `roomRates.js`) stay
`.js`. Every component's top comment has a `Used by:` line listing which
screen(s) import it.

## App flow

1. **Home** (landing page) — responsive nav bar (logo + app name, Book Now,
   menu), a swipeable hero photo carousel, an About section.
2. **Reservation form** — opens **full-screen** (no homepage visible
   behind it) when **Book Now** is tapped, from anywhere on Home. The
   screen has its own **✕ Close** button built in, top-right. Full Name,
   Contact Number, a date-range dropdown (calendar popup), a room/guest
   dropdown (counters popup), then **Check Rates & Availability**.
3. **Room & Rates** — full screen, room category cards, **Reserve**.
4. **Review & Pay** — full screen, guest recap, chosen room, total,
   **Confirm Reservation**.

## What's easy to customize, and where

### 🖼️ App logo
Replace **`assets/logo.png`** with your own image (any size — it's scaled
to 34×34 automatically). That's the only file you need to touch; the path
is hard-coded once in `HomeScreen.jsx` via `require('../../../assets/logo.png')`.

### 📷 Homepage hero photos
Open **`src/components/home/ImageCarousel.jsx`** and edit the
`HERO_SLIDES` array near the top of the file — it's a clearly marked block
with a banner comment. Each entry is `{ uri, caption }`; change the `uri`
to any `https://` image link, or set `caption: ''` for no caption. Add or
remove slides freely — dots and arrows adjust automatically.

Currently using stable, royalty-free **Lorem Picsum** placeholder photos
(`picsum.photos/id/.../800/900`) since this is a student prototype with no
property photography yet. These are temporary by design — swap them for
real photos any time.

### 🎨 Colors (including the temporary orange theme)
Everything lives in **`src/utils/theme.js`**. The bold orange used on the
reservation screen and the full-screen menu (`colors.heroBackground` /
`heroBackgroundDark` / `heroCta` / `heroIcon`) is explicitly commented as a
**TEMPORARY placeholder theme** — change those four values once your real
brand colors are ready, and both screens update automatically since
nothing else needs to change.

### ✍️ Fonts
Headings, buttons, the app name, and the step indicator all use
**Baloo 2** (bold, rounded, friendly — catchy without being childish).
Body text, field labels, and dense UI text use **Inter** (clean and highly
legible at small sizes, so dates/labels stay easy to read). Both are
Google Fonts, loaded once via `useFonts()` in `App.jsx` and referenced
everywhere through `fonts.*` tokens in `theme.js` — change the imports in
`App.jsx` and the `fonts` object in `theme.js` together if you ever want a
different pairing.

### 🖥️ Responsive nav (laptop/PC vs. phone)
`HomeScreen.jsx` uses `useWindowDimensions()` to check the screen width
against `WIDE_SCREEN_BREAKPOINT` (768px). Above that width — typical for a
laptop or desktop browser — the menu items (About, Rooms, Promos, Gallery,
Contact Us) render as a horizontal row of text links next to Book Now.
Below it (a phone), they stay behind the hamburger icon, which opens
`HamburgerMenu.jsx` full-screen. Adjust `WIDE_SCREEN_BREAKPOINT` to change
where that switch happens.

## Troubleshooting

**"Unable to resolve `@expo-google-fonts/baloo-2/800ExtraBold`" (or similar
for any other weight/Inter)** — this means your installed version of that
font package is too old to have per-weight subfolders (older versions
ship all weights as flat files at the package root instead). Fix:

```bash
rm -rf node_modules package-lock.json
npm install
```

`package.json` is already pinned to `^0.4.2` for both
`@expo-google-fonts/baloo-2` and `@expo-google-fonts/inter`, which is the
first version with the `/100Thin`, `/400Regular`, `/700Bold`-style
subfolders that `App.jsx`'s deep imports rely on. If you ever bump these
versions yourself, make sure the version you pick actually contains a
folder per weight (check `node_modules/@expo-google-fonts/<name>/` after
installing) before assuming the deep-import syntax will work.

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app on your phone, press `w` to
run it in a browser (try resizing the window to see the responsive nav
switch), `a` for an Android emulator, or `i` for an iOS simulator.

## Behavior notes

- Tapping **Book Now** (nav bar, on any screen width) or **Book Your
  Stay** (bottom of Home) opens the reservation form full-screen. Its
  **✕ Close** button (inside the screen itself, top-right) returns to
  Home.
- The hamburger menu (phone) is also full-screen, using the same
  temporary orange as the reservation form, with its own **✕** close
  button.
- The reservation form's calendar and guest popups are still small
  centered modals layered on top of the full-screen form — only the
  outermost reservation screen and the menu are full-bleed.
- **Adults** can't go below 1. **Children** can't go below 0. At least one
  room always remains; Room 1 has no Remove button.
- **Check-out** can't be earlier than or equal to **check-in** — enforced
  both by the calendar's own tap logic and re-checked on search.
- From Room & Rates, **Edit** re-opens the reservation form over Home.
- **Room & Rates** room images are icon placeholders (🛏️), not real
  photos, since this is a student prototype with no property photography.
- **Review & Pay** computes total as nightly rate × number of nights,
  shows a confirmation alert, then resets back to Home.
- A brief blank frame (still themed via the status bar) shows for a
  moment on first launch while Baloo 2 / Inter load — this is normal and
  prevents a flash of the wrong font.

## Debugging tip: where to look first

| Symptom | Look here |
|---|---|
| Wrong colors / spacing / fonts anywhere | `src/utils/theme.js` |
| Logo not showing / wrong image | `assets/logo.png`, `HomeScreen.jsx` |
| Homepage nav, carousel, or About section | `src/screens/home/`, `src/components/home/` |
| Responsive nav not switching at the right width | `HomeScreen.jsx` → `WIDE_SCREEN_BREAKPOINT` |
| Date picker / calendar behaving oddly | `src/components/reservation/RangeCalendar.jsx`, `src/utils/calendarHelpers.js` |
| Room/guest counters or "+ Add room" | `src/components/reservation/GuestRoomSelector.jsx` |
| Reservation form validation or Close button | `src/screens/reservation/ReservationScreen.jsx` |
| Room & Rates cards/pricing | `src/screens/roomRates/RoomSelectionScreen.jsx`, `src/components/roomRates/RateCard.jsx`, `src/utils/roomRates.js` |
| Review & Pay totals or confirm | `src/screens/reviewPay/ReviewPayScreen.jsx` |
| Step progress bar | `src/components/shared/StepIndicator.jsx` |
| Fonts not loading / app stuck blank | `App.jsx` → the `useFonts()` call |
| Full-screen routing (Book Now, screen transitions) | `App.jsx` |
