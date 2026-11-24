# Platepilot — before and after

**Before** · `33f0608` · green/cream pilot palette (`#173f35`, `#f5f1e8`, `#cf6f3c`), Aptos + Iowan Old Style, 1180px shell, rounded cards, soft shadows, one mixed marketing/app stylesheet in `globals.css`.

**After** · Wayfind · cool grey paper, blue-black ink, Chivo Mono, 2px ink rules, cobalt for live states, amber figures, square corners, 1360px shell. The product is composed as a departure board: the pass board in the hero, a ticket-style route, a live floor plate, ruled app chrome.

## What changed

| Surface | Before | After |
| --- | --- | --- |
| System | Four greens, cream, orange; serif display; radii and shadows | Tokenised ink/paper/cobalt/amber; one mono family; square plates and hairline rules |
| Hero | Centred marketing copy; product screenshot beside it | Split stage: copy in columns 1–6, a photographic room plate carrying the live pass board in 7–12 |
| Navigation | Pill dropdowns, soft borders, mixed controls | Signage bar: wordmark, two ruled groups, one cobalt action; app rail in ink |
| Sections | Repeated card grids on a light wash | Route board, stop rows, floor plate, tabbed feature rail, ruled FAQ, language board, numbered security sections |
| Pricing | Three soft cards | One inclusion grid, ruled plan table, oversized `0` monthly-fee stamp |
| Security | Long prose page | Sticky numbered index + ruled policy sections at a 760px reading measure |
| Auth | Floating rounded card | Split ink/paper start screen with a real photographic plate and one form column |
| Storefront | Generic cards | Ruled menu grid, live order rail, campaign strip, ink mast |
| Operator | Mixed card surfaces | Fixed ink rail, sticky crumb bar, one panel language across kitchen, floor, reports, QR and settings |

## Evidence

- After screenshots: `.hallmark/shots/localhost-3000-*` (1280×800, 1440×900, 1920×1080 folds; 1440 and 375 full pages).
- Before screenshots were not recorded as a `--before` snapshot in this run; the before description above is read from `33f0608`'s stylesheet and page markup, not from memory.
- Gate run: **0 FAIL · 3 WARN · 1 NOTE** (58) across 7 stylesheets and the rendered home page. `tsc` 0, `next build` 0, `vitest` 39/39, ESLint 0 errors / 10 warnings.

## Honest reading

The redesign is a system change, not a new content strategy. Every route and interaction is in place, the copy is the owner's, and the lower marketing page now has one deliberate full-bleed language board that separates the global and security arguments. The remaining 58 note is real: at 1440 the modes screen carries 119 words because four service modes sit together; the redesign runs at full depth, where 58 is a note on the owner's words rather than a failure. The three WARNs are deliberate (a danger button, a narrow reading container, and four section gaps).
