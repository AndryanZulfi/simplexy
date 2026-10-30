# Simplexy landing verification

Local preview: http://127.0.0.1:5175/. Entry: ui/src/bootstrap.ts selects the public root; every non-root URL imports the unchanged board main. No database, API, authentication or dashboard components changed.

## Evidence
- PASS: node scripts/check-simplexy-landing.mjs. Hero and workflow pause/resume/replay, workflow retained after reentry, all three showcase tabs, keyboard Home selection, empty/error/recovery states, reduced motion final states, anchor targets, responsive widths 320/768/1024/1440, zero page errors and zero /api/ requests.
- PASS: pnpm --filter @paperclipai/ui build (Vite emits existing config compatibility and large-chunk warnings).
- PASS: targeted tsc --ignoreConfig --noEmit for Hero, Workflow, Showcase and useDemoSequence with React JSX, bundler resolution and DOM/ES2022 libs.
- PASS: pnpm check:token-gates.
- Dashboard boundary: scripts/check-simplexy-route.mjs confirms /dashboard loads existing main.tsx and removes the landing. Board content was blank on UI-only preview; this is NOT proof of full dashboard operation.

## Antislop delivery gate
- Hard gate PASS for public landing scope: no fabricated customer metrics, testimonials, security claims or real integrations; original supplied logo cropped without redrawing; each demo labeled. Stock example verified against PDF pages 1 and 3. Additional showcase conversations explicitly labeled. Visible controls exercised by browser test; keyboard selection and reduced motion verified. No overflow at tested widths.
- Contrast PASS for principal text pairs: muted/cream 5.19, muted/wash 4.83, olive/wash 4.87, paper/olive 5.60, ink/message 10.37. Workflow inactive nodes retain full text opacity rather than dimming contrast.
- Purpose gate PASS: cream/brown supplied brand, olive workflow state, device and table demonstrate the same stock scenario, shadow only distinguishes device/result. No generic background graphics or invented illustrations.
- Liveliness PASS: ENERGY 2 / RHYTHM 3 / MOTION 2. Hero two-column conversation; horizontal/vertical workflow; interactive scenario selector. Sequence driven by React state, no video, no endless loop.
- Craftsmanship PASS for landing scope: build and browser evidence above. Hero and workflow screenshots reviewed before next slice; showcase reviewed after implementation. Screenshot findings led to larger chat text and result card moved away from answer. Reserve sheet height to avoid layout movement.

## Limits
Full monorepo suite, backend/dashboard end-to-end, screen-reader testing, production deployment and field Core Web Vitals were not run. Source logo is raster, not a vector master. Demo does not validate real WhatsApp/data integration. Public landing has a standalone stylesheet; it does not change dashboard styling. Build warnings from the existing large board bundle remain.
