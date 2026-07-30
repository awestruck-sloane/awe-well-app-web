# Awe Well · web journal

The subscriber journal at app.awe-well.com. Static, hand-rolled, no build
step, no framework, no third-party requests at runtime beyond Supabase.
Design + decisions: `docs/web-journal.md` in the awe-app repo.

- `index.html` + `assets/app.css` + `assets/app.js` — the whole app.
- `assets/supabase.js` — self-hosted @supabase/supabase-js UMD, v2.111.0
  (from jsdelivr; update deliberately, never hotlink).
- `assets/related.js` — resurfacing scorer, a port of the app repo's
  `mobile/lib/related.ts`. That file is the source of truth; keep in sync.

Rules that must survive any edit:

- User text renders via `textContent` only. Never innerHTML journal content.
- The CSP meta tag stays; scripts stay external.
- Web access is GATED by the core subscription via the `check-entitlement`
  edge function (fails closed). Reading-room only; writing happens in the app.
- The marketing site (awe-well.com) never gains auth; sessions live only here.

Operational chore: the Apple Sign in with Apple WEB client secret (pasted in
Supabase → Auth → Providers → Apple) expires every ~6 months and must be
regenerated from the .p8 key. When it lapses, web sign-in breaks with an
invalid_client error while the iOS app keeps working.

<!-- purge wave 2 -->
