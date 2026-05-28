# CLAUDE.md — Bearcat Estimator workflow rules

## The cardinal rules

1. **Never push without explicit user approval.** Not `git push`, not `git push origin main`, not any equivalent. The user must say "push" or "ship it" — confirm if unclear. Local commits accumulate freely; the push is the gate.
2. **Never work directly on `main`.** Every change starts with `git checkout -b feat/<short-name>`. Use `tools/dev.sh --branch=feat/<name>` to do both at once.
3. **Smoke-test in the browser before merging.** Load the app at `http://localhost:5173`, run one real estimate end-to-end, eyeball the total. Don't trust unit-level math alone — the UI is where customer trust lives.
4. **Don't `git add .` in bulk** — sweeps in unrelated files. Stage by name (`git add server/lib/calculate.js`) or use `git add -p` to review hunks.

## The workflow

```bash
# 1. Start a change
tools/dev.sh --branch=feat/cage-labor-fix
# (Opens server on :4000, Vite on :5173. Refuses to run on main.)

# 2. Edit, save — Vite hot-reloads. Server uses node --watch.

# 3. Smoke test in browser. Iterate. Commit on the branch.
git add server/lib/calculate.js
git commit -m "fix cage labor matrix to match spreadsheet"

# 4. Batch more work on the same branch (or open more branches).

# 5. When ready to ship, merge to main and ask the user before pushing.
git checkout main && git merge feat/cage-labor-fix
# → STOP. Ask user: "Ready to push?"
```

## Deployment context

- **Single-service deploy on Render** (Starter $7/mo + 1GB disk). One Node process serves built React + Express API.
- **Push to `origin/main`** auto-triggers a Render build + deploy (~2 min). No staging environment — main = production.
- **Custom domain:** `estimate.bearcatturf.com` (CNAME → `bearcat-estimator.onrender.com`).
- **Auth:** HTTP Basic Auth via `APP_USER` / `APP_PASS` env vars. `/api/health` is open for Render's healthcheck.

## Data + state

- JSON-as-database under `/data` (estimates, partner-jobs, components, products, cimarron, voice corpus, QB tokens).
- In production this lives on the Render persistent disk at `/var/data` (`DATA_DIR` env var).
- `data/estimates/*.json`, `data/partner-jobs/*.json`, and `data/qb_tokens.json` are gitignored — never commit customer or token data.

## Money-saving tip

Use a **separate Gemini API key for local dev** in `server/.env` so localhost testing doesn't bill against the prod key. Flash's free tier (~1,500 req/day) covers all realistic dev volume for free.

## Rocks / soils / mulches — new product line (May 2026)

Bearcat is selling + installing decorative rock, slabs, and bulk soil/mulch.
Wholesale catalog lives at `data/rocks/clear_fork_materials_2026_05.json`
(Clear Fork Materials — 212 SKUs across Sands/Soils/Mulches, River Rocks/
Cobble/Crushed Stone, Slabs/Pool Coping/Travertine, and Sawn/Chop Stone/Brick).

Pricing model in `components.json` → `rock_install`:
- `markup_multiplier: 1.75` (lower than plants because rock is heavier, less spoilage)
- `spread_labor_per_unit: { ton: 60, yard: 45, piece: 0, bag: 8 }` — auto-added per qty
- `warranty_reserve_pct: 5` — delivery + breakage reserve on marked-up material
- `custom_quote_units: [piece]` — slabs and pool coping pieces flag for manual labor

The catalog was transcribed from photos of the printed binder catalog
(Nov 1 2025 page footer). The JSON has an `_ocr_caveats` array calling out
specific items where the photo was ambiguous — verify those before quoting.
Right-edge cropping affected several Sawn/Chop prices on IMG_1051.

Catalogs are dated and disposable — same convention as Wolfe Nursery: new
month → new file (`clear_fork_materials_2026_06.json`), never overwrite.

## Plants — new product line (May 2026)

Bearcat is starting to sell + install plants. Wholesale catalog lives at
`data/plants/wolfe_nursery_2026_05.json` (Wolfe Nursery Direct, Fort Worth,
6327 Silver Saddle Rd — 969 SKUs across trees, shrubs, grasses, perennials,
cacti/succulents, palms, vines, roses, ferns, and landscape materials).

Pricing in that file is **wholesale at-the-rep**. Retail markup + install
labor are not yet defined. When that policy lands, capture it in
`data/components.json` under a new `plant_install` block (analogous to
`cage_install`).

Catalogs are **dated and disposable** — Wolfe reissues monthly with
"THIS PRICING CANCELS ALL PREVIOUS LISTS." Treat each catalog as a snapshot:
new month → new file (`wolfe_nursery_2026_06.json`, etc.), never overwrite,
so historical estimates can still reference the price they were quoted at.

## Cage labor — source of truth

Internal estimator (`server/lib/calculate.js`) and public configurator (`bearcatturf/src/pages/batting-cages/configurator.astro`) **must stay aligned** with `/Users/colinmburns/Desktop/cage-labor-matrix.xlsx`. Any change to day rate, tier days, concrete adder, or width multipliers needs to land in both places + the matrix.

| Input | Value |
|---|---|
| Day rate | $1,800 |
| Tier days (≤40 / ≤60 / 65+) | 2 / 3 / 4 |
| HD concrete-set adder | +1 day |
| Width mult (single / double-wide / triple+) | 1.0 / 1.6 / 2.2 |
| Margin multiplier | 1.299 (= 23% gross) |
