# 1.7 - Review Turn 1

## Task Context
- Task id: 1.7
- Task title: Fix privacy policy accuracy (weather fetch, geolocation, localStorage) or remove widget
- Dashboard implementation status: todo (in spec) — verified partially satisfied; two accuracy gaps remain
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 1 item **1.7**
- Files inspected:
  - `paperboy-site/components/WeatherBlurb.tsx` (fetch + geolocation logic)
  - `paperboy-site/components/BackPages.tsx` (privacy policy copy)
  - `paperboy-site/components/UploadButton.tsx` (second localStorage key)
  - `paperboy-site/components/SiteUiContext.tsx`, `app/layout.tsx` (edition localStorage)
  - `paperboy-site/lib/page-metadata.ts` (cookies page description)
- Commands run:
  - `grep -niE "open-meteo|geolocation|navigator\.|fetch\(|localStorage" components/WeatherBlurb.tsx`
  - `grep -rn "WeatherBlurb" app components` → used at `app/page.tsx:58`
  - `grep -rniE "localStorage" app components lib`
  - `grep -niE "open-meteo|weather|geolocation|localstorage|edition|collect|third part" app/privacy/page.tsx app/cookies/page.tsx components/BackPages.tsx`
- Current claim being verified: the privacy policy accurately describes every network call and
  every piece of client-side state the site creates.

## Findings

The team kept the weather widget (still rendered at `app/page.tsx:58`), so the disclosure path
applies (not removal). The policy in `BackPages.tsx` was substantially improved and already
covers opt-in geolocation and the edition `localStorage` key correctly. Two accuracy gaps remain.

### Finding 1: Automatic Open-Meteo contact on page load is not disclosed
- Severity: required
- Location: `components/WeatherBlurb.tsx:271-307` vs `components/BackPages.tsx:22,38`
- Problem: `WeatherBlurb` initializes `mode = "rotating"` (L272) and its rotating-mode effect
  (L288-307) calls `fetchWeather(city.lat, city.lon)` against `https://api.open-meteo.com`
  (L222-231) on every page load, for a randomly chosen city from `ROTATING_CITIES` — with **no
  geolocation involved**. Geolocation (`getLocalPosition`, L255-269) runs *only* when the
  visitor explicitly clicks for local weather (the L255 comment says exactly this).
- Spec mismatch / risk: The privacy copy frames Open-Meteo contact as conditional on consent —
  "the weather blurb ... may request your location once ... if granted, coordinates are sent to
  Open-Meteo" (L22) and "Open-Meteo receives latitude/longitude when you allow the weather
  widget to use your location" (L38). In reality the browser contacts Open-Meteo (a third party)
  automatically on load, which exposes the visitor's IP address to Open-Meteo regardless of any
  location permission. This omission is precisely the kind of inaccuracy 1.7 exists to fix.
- Required fix: disclose the automatic third-party request for the rotating-cities weather,
  separately from the opt-in local-weather geolocation.
- Code sample / exact change:
```tsx
// components/BackPages.tsx — "Site Preferences & Weather" (replace the weather sentence at L22)
The weather blurb on the front page automatically requests a forecast from Open-Meteo
(open-meteo.com) for a rotating set of world cities each time the page loads; this exposes
your IP address to Open-Meteo but sends no personal location. Separately, you can ask the
blurb for <em>local</em> conditions, which requests your device location once and, if granted,
sends those coordinates to Open-Meteo. We store neither request on our servers.

// components/BackPages.tsx — "Third Parties" (replace L38 first sentence)
Open-Meteo receives a city's coordinates (and your IP) on every front-page load for the
rotating weather, and your device coordinates only if you opt in to local weather.
```
- Validation:
```
grep -n "automatically\|every .*load\|IP address" components/BackPages.tsx   # disclosure present
grep -n "mode === \"rotating\"" components/WeatherBlurb.tsx                    # confirms auto fetch path
```

### Finding 2: "Edition preference only" omits a second localStorage key
- Severity: required
- Location: `components/BackPages.tsx:34`, `lib/page-metadata.ts` (cookies `description`), vs
  `components/UploadButton.tsx:9,20,32`
- Problem: The policy says "Edition preference uses `localStorage` only" (L34) and the cookies
  page description reads "...edition preference only." But `UploadButton.tsx` persists a second
  key, `paperboy-convert-output` (`"download" | "clipboard"`), recording the converter's output
  preference. So "only" is false — there are two preference keys.
- Spec mismatch / risk: A privacy/cookies policy that claims a single localStorage key while the
  app writes two is inaccurate.
- Required fix: enumerate both keys (or drop the word "only" and describe both as non-tracking
  UI preferences).
- Code sample / exact change:
```tsx
// components/BackPages.tsx:34 — "Cookies & Local Storage"
No tracking, analytics, or advertising cookies. The site uses localStorage only for two
non-tracking UI preferences: your Morning/Late edition choice and the file converter's
output mode (download vs. copy-to-clipboard).
```
```ts
// lib/page-metadata.ts — cookies.description
description: "Cookie and local storage policy for paperboy.run — UI preferences only (edition and converter output), no tracking.",
```
- Validation:
```
grep -rn "localStorage" components/UploadButton.tsx components/SiteUiContext.tsx app/layout.tsx
# Two distinct keys: "edition" and "paperboy-convert-output" — both must be reflected in the policy.
grep -n "output\|two non-tracking\|converter" components/BackPages.tsx
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: make the privacy/cookies copy accurately reflect (1) the automatic Open-Meteo request
on page load and (2) both localStorage preference keys.

Files to edit:
- `paperboy-site/components/BackPages.tsx` (weather sentence L22, Third Parties L38, Cookies & Local Storage L34)
- `paperboy-site/lib/page-metadata.ts` (cookies `description`)

Files not to edit:
- `components/WeatherBlurb.tsx`, `components/UploadButton.tsx` — behavior is correct; only the
  disclosure copy is wrong. Do not change app behavior to match the policy; change the policy to
  match behavior.

Exact changes: apply the four copy edits in the code samples above (adjust prose to the
newspaper voice; keep it factual; no emoji).

Data shapes / CLI examples: localStorage keys in use today — `edition` (SiteUiContext/layout) and
`paperboy-convert-output` (UploadButton). Network calls: `https://api.open-meteo.com/v1/forecast`
(rotating cities on load; local coords on opt-in).

Tests to add or update: none (content task; no test specified for 1.7).

Commands to run:
- `npx tsc --noEmit`
- the two grep checks in each finding's Validation block

Definition of done:
- Privacy copy discloses the automatic Open-Meteo request + IP exposure on load, distinct from
  opt-in geolocation.
- Privacy/cookies copy no longer claims a single localStorage key; both `edition` and
  `paperboy-convert-output` are described as non-tracking UI preferences.
- `npx tsc --noEmit` passes.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, no blockers; two required findings each have one
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
send_to_builder
