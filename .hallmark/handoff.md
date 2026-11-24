# Platepilot — redesign handoff

**Redesign · full · site** — marketing, auth, operator app, storefront and the shared chrome. Content, links, fields, handlers, routes, ids and tests are kept; the design system and composition changed.

## State

- **Gate** · 0 FAIL · 3 WARN · 1 NOTE (58, the screen budget at 1440: 119 words on the modes screen; full-redesign note on the owner's copy)
- **Checks** · `tsc --noEmit` 0 · `next build` 0 (140 static pages) · `vitest run tests/unit` 39/39 · ESLint 0 errors, 10 pre-existing warnings
- **Compare** · `.hallmark/compare.md` · shots in `.hallmark/shots/`
- **No secrets or new dependencies.**

## System

- Tokens in `src/app/tokens.css`; reset in `base.css`; chrome in `chrome.css`; marketing in `marketing.css`; operator in `operator.css`; storefront in `storefront.css`.
- Chivo Mono 400/800 is self-hosted under `src/app/fonts/` and exposed only through `--font-display` / `--font-mono`.
- Radii are 0 except pills; colour is token-only; motion is stiff `steps()` and never animates width/height/top/left; RTL is supported for Arabic.
- Shared primitives: `.shell`, `.section`, `.button*`, `.field*`, `.form-card*`, `.notice*`, `.status-badge`, `.op-pill*`.

## Stand-ins to replace with the restaurant's own material

1. **Hero room** · `public/images/hero-restaurant.jpg` · hero frame, about 640×470 at desktop / full width on mobile. Replace with the restaurant's own room, landscape, warm light.
2. **Bobotie plate** · `public/images/menu/bobotie.jpg` · 620px full-bleed interlude and route step 01. Replace with the signature dish.
3. **Kitchen pass** · `public/images/kitchen-pass.jpg` · route step 02. Replace with the real pass during service.
4. **Storefront menu** · `public/images/menu/boerewors-roll.jpg`, `bunny-chow.jpg`, `malva-pudding.jpg`. Replace with the published menu photography.
5. **Product samples** · the pass board, floor plate, ticket and kitchen pass rows are built HTML/CSS and labelled `Illustrative view` where they show sample data. Capture the real live floor, table QR, kitchen pass, reports and storefront once a location has data.
6. **Copy** · no new claims, figures, testimonials or logos were invented. Prices, hours and location facts remain the owner's; the security page's policy copy is carried over as found.

## Verify in the owner's environment

- **Auth** · sign-in, registration, onboarding and start screens need the real Supabase project; signed-out operator shells intentionally show the sign-in action and no dead data.
- **Operator** · kitchen ticket polling, floor publish, QR download, reports and settings need a seeded location; the layouts were checked at 1440 and 375 with the signed-out state.
- **Storefront** · the sample slug `/en/r/[slug]` needs a published menu; the current grid reads from the same data path as before.
- **Security page** · policy prose remains hardcoded English (as it was); translate it through the message catalogue if the legal copy should follow the locale.
- **Arabic** · RTL layout is wired, but have a native reader review the Arabic marketing copy and the operator labels before launch.

## Known layout findings (not defects)

- **58 NOTE** · at 1440 the four service modes plus the first route copy share a 900px window (119 words). The copy is the owner's, so this is logged as a note under the full redesign, not cut.
- **F4 WARN** · the hero CTA and the destructive action are both filled primaries, in unrelated contexts. Keep the danger fill for destructive confirmation; every other action is outlined.
- **F15 WARN** · 1360px is the page shell; 900px is the intentional narrow reading container for security and legal copy. Four section gaps are deliberate (40/64/24/120).
- **Feature tabs** · the desktop right panel is a ruled checklist; if more proof is added later, give it a photograph or a second sample screen rather than more copy.
