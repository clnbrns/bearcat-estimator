# Bearcat Estimator — Codebase Audit

**Date:** 2026-07-15 · **Auditor:** Claude (Senior Staff Engineer review) · **Scope:** full repo (`server/`, `client/`, `data/`, config)
**Method:** every source file read line-by-line; calculation paths traced end-to-end; catalog data cross-checked against the code that consumes it. No files were modified.

---

## 1. Executive Summary

The core architecture is sound — a pure, side-effect-free pricing engine (`server/lib/calculate.js`) driven by JSON config, a thin Express API, and a React wizard — and the money math is mostly right. However, the pricing engine has **zero automated tests**, and the audit found real dollar-impacting defects inside it: the "Other costs %" line silently excludes all equipment/plant/rock/tree lines, the turf roll optimizer never tries the rotated orientation (over-ordering material), and the cage auto-labor heuristic can bolt **$7,200 of phantom assembly labor onto a net-only sale**. The single biggest risk area is **calculation integrity without a safety net**: any of these bugs ships straight to a customer-facing quote, and there is no test to catch the next one. Secondary risks: unvalidated API input (including a path-traversal write via client-supplied IDs) and an estimate-history design that stores multi-MB base64 attachments in the same JSON blobs it returns wholesale to the browser.

---

## 2. Key Findings (Ordered by Severity)

### CRITICAL

---

#### C1. "Other costs %" is computed before half the cost lines exist
- **Component/File & Line:** `server/lib/calculate.js:412-423`
- **The Issue:** The `other_costs` line is pushed with `directCost = lines.reduce(...)` **before** Cimarron equipment (line 426), plants (451), rocks (508), tree removal (557), and custom line items (572) are appended. The percentage therefore only applies to the turf-side lines.
- **The Impact:** On equipment- or landscape-heavy jobs the contingency line (label: *"equipment, dump fees, fuel, contingency"*) under-bills. A cage job with $6,000 of Cimarron hardware and 10% other-costs misses $600 of cost basis → ~$860 of missing sell price at 30% margin. The estimator silently looks "complete" while under-quoting.
- **The Fix:** Move the `other_costs` block to **after** all cost lines are pushed (just before the `totalCost` reduce at line 584). If the intent really is "turf-side only," rename the label to say so — but the settings note ("~10% of direct cost" calibrated from P&L) implies whole-job basis.

---

#### C2. Cage auto-labor fires on *any* "Batting Cage …" catalog item — including replacement nets
- **Component/File & Line:** `server/lib/calculate.js:351-366`
- **The Issue:** The auto-fill matches `/Batting Cage/i.test(product.category)` + `product.length`. The Cimarron catalog has 91 such products across categories including **"Batting Cage Nets Only"** and **"Batting Cage Frames"** (nets carry a `length`). Also, `cageQtyTotal` sums qty across *all* matched items, so 1 combo + 1 spare net = qty 2 → the 1.6× "double-wide" multiplier.
- **The Impact:** A customer buying a single 70' replacement net (a few hundred dollars of hardware) gets 4 days × $1,800 = **$7,200 of auto-added assembly labor**. A combo + spare net gets labor multiplied 1.6× as a phantom "double-wide." Either kills the deal or embarrasses the estimator.
- **The Fix:** Restrict the filter to `product.category === 'Batting Cage Net + Frame Combos'` (the same filter `CageQuickSetup.jsx:20` already uses), and compute `cageQtyTotal` from combo items only.

---

#### C3. Client-supplied `id` is used as a filename — path traversal / arbitrary file write
- **Component/File & Line:** `server/lib/data.js:98,117` (`savePartnerJob`, `saveEstimate`), reachable from `server/index.js:106-113,128-130`
- **The Issue:** `const id = estimate.id || \`est_${Date.now()}\`` then `writeFile(path.join(ESTIMATES_DIR, \`${id}.json\`), ...)`. `POST /api/estimates` and `POST /api/partner-jobs` accept `id` verbatim from the request body. `{"id": "../../server/lib/calculate"}` writes `calculate.json` into `server/lib/`; on Render, `../..` escapes `/var/data`.
- **The Impact:** Anyone with the shared Basic Auth credential (which includes partners — see C6) can write arbitrary `.json` files anywhere the Node process can write, clobber other estimates, or fill the disk. Also, `Date.now()` IDs can collide on concurrent saves (silent overwrite).
- **The Fix:** In `saveEstimate`/`savePartnerJob`, ignore the incoming id unless it matches `/^(est|pj)_[a-z0-9]+$/i`; better, always generate server-side (`est_${Date.now()}_${crypto.randomUUID().slice(0,8)}`) and return it. Add `path.basename()` as belt-and-suspenders.

---

#### C4. `POST /api/estimate` performs no input validation — NaN/negative/absurd values flow into customer math
- **Component/File & Line:** `server/lib/calculate.js:32-72` (destructure defaults are the only "validation"), `server/index.js:119-126`
- **The Issue:** Nothing clamps or type-checks the payload. `total_sf: -500` → `Math.sqrt(-500)` → `NaN` perimeter → NaN bender board → NaN totals. `margin_pct: "abc"` → `clamp(NaN,0,95)` → NaN → `sell_price: null` after `round()`. `turf_overage_pct: -100` → turf ordered at 0 SF. `flex_base_depth_in: 0` (which the client sends when the field is cleared, `EstimateBuilder.jsx:108` → `Number('') = 0`) silently zeroes the sub-base line with no warning.
- **The Impact:** The React client mostly casts correctly, but the API is also called by the partner portal and is one `fetch` away for anyone with credentials. A NaN that reaches a saved estimate poisons History, QB push (`Amount: NaN` → QB API 400), and the printed quote. The zero-depth footgun is reachable from normal UI use today.
- **The Fix:** Add a small `sanitizeEstimateInput()` at the top of `calculateEstimate` (or an Express middleware): coerce every numeric field with `Number.isFinite` fallback to default, clamp `total_sf ≥ 0`, `0 ≤ turf_overage_pct ≤ 100`, `0.5 ≤ flex_base_depth_in ≤ 12` (or treat `0` as "use default"), `margin_pct` finite. Return HTTP 422 with a field list on hard failures.

---

#### C5. The pricing engine has zero tests
- **Component/File & Line:** repo-wide — no test runner, no test files (`server/package.json`, `client/package.json` have no test script)
- **The Issue:** `calculate.js` is 703 lines of revenue-determining arithmetic with 30+ input flags, and every change to it (including all fixes in this audit) is verified only by eyeballing the UI.
- **The Impact:** Regressions in customer-facing dollar amounts are undetectable until a bad quote ships. This is the enabling condition for C1/C2 existing at all — both would be caught by one golden test each.
- **The Fix:** Add `vitest` to `server/`. `calculate.js` is already pure (data in → lines out), so tests need no mocks: snapshot/golden tests for ~8 representative jobs (rect yard w/ dims, irregular, multi-zone, putting green, cage-only via quick setup, supply-only, plants+rocks, tiny job hitting the labor floor), plus unit tests for `flexBaseYards`, `turfOrderSfFromDims`, `seamLengthFromDims`, `perimeterFromSf`, and the MAP-violation warning.

---

#### C6. One shared Basic Auth credential gates everything — partners can read all customer data and edit their own margins
- **Component/File & Line:** `server/index.js:46-59` (global middleware), `client/src/main.jsx:14` (`/partners/:slug` route), `server/index.js:99-104` (`PUT /api/partners`), `client/src/components/PartnerPortal.jsx:84-86`
- **The Issue:** The auth middleware protects every route with the single `APP_USER/APP_PASS` pair. For a partner to use `/partners/:slug` they must be given that credential — which also unlocks `GET /api/estimates` (all customer PII + margins + attachments), `GET /api/partner-jobs` (every other partner's customers), `PUT /api/partners` (a partner can raise/lower any partner's `margin_pct`), and all `/api/qb/*` endpoints. Additionally, the **client** decides the `auto_approved` status (`PartnerPortal.jsx:84`) — the server stores whatever status is posted.
- **The Impact:** The partner portal as deployed either doesn't work for partners (no credential) or hands them the keys to the whole business. Auto-approval is spoofable via curl.
- **The Fix:** (a) Carve out partner-scoped routes from the global auth: allow unauthenticated (or per-partner-token) access to exactly `GET /api/partners/:slug`, `POST /api/partner-jobs`, `POST /api/estimate`, `GET /api/products`, `GET /api/components`, and the `/partners/*` SPA route; keep everything else behind admin auth. (b) Compute `status` server-side in `POST /api/partner-jobs` from the partner record's `auto_approve_under_sf`. (c) Long-term: per-partner token in the URL or a signed slug.

---

#### C7. Estimate records embed base64 attachments and `GET /api/estimates` returns all of them, every time
- **Component/File & Line:** `client/src/components/IntakeForm.jsx:73-99` (base64 capture into `intake.attachments`), `server/lib/data.js:123-132` (`listEstimates` reads every file), `server/index.js:132-134`, `228-238` (QB push loads *all* estimates to find one), `client/src/components/EstimateHistory.jsx:10-13`
- **The Issue:** Uploaded PDFs/photos (up to 20 MB each, 5 per estimate) are base64-encoded into the intake, saved inside the estimate JSON, and then **every** History load and **every** QB push reads every estimate file into memory and (for History) ships the full blobs to the browser.
- **The Impact:** This degrades linearly with usage: 50 saved estimates with photos ≈ hundreds of MB parsed per History click on a $7/mo Render instance (512 MB RAM). It will manifest as multi-second hangs, then OOM restarts, mid-season. It's also why `express.json` needed a 25 MB limit.
- **The Fix:** (a) `listEstimates` should return a slim index — strip `intake.attachments` (map to `{name,type,size}` metadata) and drop `estimate.lines` from the list payload; add `GET /api/estimates/:id` for the full record. (b) QB push should read the single file by id, not `listEstimates().find(...)`. (c) Longer-term: store attachments as separate files under `DATA_DIR/attachments/` referenced by name.

---

### MEDIUM

---

#### M1. Turf roll optimizer never tests the rotated orientation
- **Component/File & Line:** `server/lib/calculate.js:19-22` (`turfOrderSfFromDims`), `26-30` (`seamLengthFromDims`)
- **The Issue:** Strips always run parallel to the long dimension (`strips = ceil(narrow / 15)`). Standard turf layout practice evaluates both orientations and picks the one with less purchased SF (tie-break: fewer/shorter seams). Examples with 15' rolls: a **20'×46'** area orders `ceil(20/15)=2` strips → 2×15×46 = **1,380 SF** as coded, vs. rotated `ceil(46/15)=4` strips → 4×15×20 = **1,200 SF** (and the fill-ratio gate happily accepts both since fill = 1.0). A **16'×20'** area orders 600 SF vs. 480 rotated.
- **The Impact:** Systematic material over-ordering on areas whose narrow dim sits just past a roll-width multiple — 10–30% extra turf cost on affected jobs, passed to the customer (lost bids) or eaten (lost margin). Waste-% labels shown to the estimator are also wrong.
- **The Fix:** Compute both orientations in `turfOrderSfFromDims`, return the min (and the chosen orientation); make `seamLengthFromDims` use the same chosen orientation. Note grain/pile-direction constraints in a comment — if a job must run one way, the estimator can override via `seam_lf` — but default to the cheaper layout and say which one was picked in the line label.

---

#### M2. Perimeter defaults to a square approximation even when real dimensions exist
- **Component/File & Line:** `server/lib/calculate.js:11-14,77`
- **The Issue:** `perimeter = perimeter_lf ?? perimeterFromSf(total_sf)` — `sqrt(SF)×4` — even when `narrow_dim_ft`/`long_dim_ft` were provided. A 15'×100' strip (1,500 SF): actual perimeter 230 LF, computed 155 LF.
- **The Impact:** Bender board (and its stakes) under-billed by ~75 LF ≈ 4 sticks + 38 stakes ≈ $135 cost / ~$190 sell on that job — the crew shows up short on edging.
- **The Fix:** `const perimeter = perimeter_lf ?? (haveDims && useBoundingBox ? 2*(narrow_dim_ft+long_dim_ft) : perimeterFromSf(total_sf));` (move the `haveDims` computation above line 77).

---

#### M3. Quick Cage Setup and `calculate.js` compute cage labor with two different formulas
- **Component/File & Line:** `client/src/components/CageQuickSetup.jsx:61-67` vs `server/lib/calculate.js:355-371`; source of truth: `cage-labor-matrix.xlsx` (per `CLAUDE.md`)
- **The Issue:** Client path: `tier.days × $1,800 + (concrete_set ? flat $1,800 : 0)`, where `concrete_set` is a **manual checkbox** (auto-toggled on HD SKU pick, but freely uncheckable/checkable). Server auto path: `(tier.days + (isHd ? 1 : 0)) × $1,800 × widthMult`, where HD is **derived from the SKU pattern** and a width multiplier (1.0/1.6/2.2) applies. The quick-setup value is passed as `equipment_install_fee`, which short-circuits the server calc — so the same cage can carry different labor depending on entry path: non-HD frame + concrete checkbox = +$1,800 client-side, $0 server-side; two combos = 1.6× server-side, never client-side.
- **The Impact:** Violates the CLAUDE.md alignment rule with the labor matrix; two estimates for the same cage disagree; the width multiplier silently never applies to the primary (quick-setup) flow.
- **The Fix:** Make the server the only calculator: have Quick Cage Setup send `cimarron_items` + a `concrete_set` boolean and *not* pre-compute `_suggested_labor`; extend `calculateEstimate` to accept `cage_concrete_set` overriding SKU-based HD detection; apply the width multiplier in one place. Show the server-computed labor in the quick-setup preview via the existing live `/api/estimate` call.

---

#### M4. Re-opening a saved estimate (or going Back) discards every builder setting
- **Component/File & Line:** `client/src/App.jsx:29-34` (`openSavedEstimate`), `client/src/components/EstimateBuilder.jsx:9-54` (defaults built from `intake` only)
- **The Issue:** `EstimateBuilder` seeds `useState(defaults)` exclusively from `intake` + `components`. A saved record's actual knobs live in `estimate.input` (margin, toggles, cimarron/plant/rock items, overrides). Opening a saved estimate jumps to step 2; pressing **Back** remounts the builder from scratch — margin snaps to default, pickers empty, overrides gone — and the "live" totals no longer match the saved output the user was just looking at. Same loss occurs on any Output→Builder→Intake→Builder round trip.
- **The Impact:** "Tweak an old quote" — the most common real workflow — silently produces a different estimate than the one saved. High trust damage, easy to miss.
- **The Fix:** Pass the saved `estimate.input` into `EstimateBuilder` (e.g. `initialOpts` prop; App keeps `estimate` when navigating back) and seed `useState(initialOpts ?? defaults)`. In App, only clear `estimate` on `+ New`, not on step navigation.

---

#### M5. `custom_line_items` has no UI — but two pickers instruct the user to use it
- **Component/File & Line:** `client/src/components/EstimateBuilder.jsx:45` (always `[]`), `server/lib/calculate.js:572-582` (fully implemented), `RockPicker.jsx:97` and `PlantPicker.jsx:92` (both say "Add a **Custom line item** below")
- **The Issue:** The engine supports custom lines and the slab/coping (`piece` unit) and specimen-plant (100g+/B&B/box) flows *depend* on them for labor ($0 auto-labor by design), but no component ever renders an editor for `custom_line_items`.
- **The Impact:** Every slab, pool-coping, or big-tree job goes out with **zero install labor** unless the user notices and inflates something else by hand. The warning text actively points at a control that doesn't exist.
- **The Fix:** Add a `CustomLineItems` editor to `EstimateBuilder` (rows: label / qty / unit / unit_cost — mirror `TreeRemovalPicker`'s pattern). Also fix the key collision: `key: \`custom_${item.label}\`` duplicates for same-label rows (`calculate.js:574`) — append the index.

---

#### M6. Printed "customer" estimate leaks cost & profit, and its columns don't reconcile
- **Component/File & Line:** `client/src/components/EstimateOutput.jsx:167` (line total), `166` (unit rate), `196-205` (Cost/Profit rows)
- **The Issue:** Three related problems on the printable document: (a) the **Unit** column shows raw internal `unit_cost` while the **Total** column shows the margin-marked-up `cost/(1-m)` — so Qty × Unit ≠ Total on every row; (b) when the card fee is on, the marked-up line totals sum to `sell_price`, not the displayed grand **Total** (`final_price`) — rows don't add up to the total; (c) the footer prints **Cost** and **Profit ($ and %)** on the same artifact the "Print / Save PDF" button produces — one wrong handoff and the customer sees the margin.
- **The Impact:** A customer (or partner) doing arithmetic on the quote finds discrepancies; worst case they see the profit line. Trust is the product here.
- **The Fix:** (a) Display marked-up unit price (`unit_cost/(1-m)`) in the Unit column, or show internal figures consistently and label the section "Internal"; (b) present the card fee as its own visible row so rows sum to Total; (c) move Cost/Profit into a `no-print` block (visible on screen, never in the PDF), since `ClientPresentationMode` already exists for the clean customer view.

---

#### M7. Voice-corpus "Teach This" writes to the repo directory — lost on every Render deploy
- **Component/File & Line:** `server/lib/quickbooksDescription.js:7` (`CORPUS_PATH = ../../data/voice_corpus.json`)
- **The Issue:** Unlike `data.js`, this module doesn't distinguish static vs runtime data: `appendToCorpus` writes into the repo's `data/` dir. On Render the repo filesystem is rebuilt from git on each deploy, so runtime-taught examples vanish; only `/var/data` (`DATA_DIR`) persists.
- **The Impact:** The self-improving description feature silently loses everything the user taught it, on every push to main (~each deploy). The in-memory `cachedCorpus` also masks the loss until restart.
- **The Fix:** Split paths like `data.js` does: seed-read from the static file, but persist to `path.join(DATA_DIR, 'voice_corpus.json')` (copy-on-first-write). Read prefers the DATA_DIR copy when present.

---

#### M8. QuickBooks token refresh has a rotation race
- **Component/File & Line:** `server/lib/quickbooks.js:131-166` (`refreshAccessToken` / `getValidTokens`), `192-203`
- **The Issue:** Intuit rotates the refresh token on every refresh. Two concurrent API calls with an expired access token (e.g. `qbStatus` + `qbCustomers` fired together from `IntakeForm.jsx:48` + `openQbPicker`) both call `refreshAccessToken`; the loser persists/uses a refresh token that Intuit just invalidated.
- **The Impact:** Random "QB disconnected, re-authorize" incidents that look like Intuit flakiness. Given the 100-day refresh window, one bad race can kill the integration until manual reconnect.
- **The Fix:** Module-level single-flight lock: `let refreshing = null; if (!refreshing) refreshing = refreshAccessToken(t).finally(()=>refreshing=null); return refreshing;`. Also treat a refresh failure after a 401 by re-reading tokens from disk before surfacing the error.

---

#### M9. Sub-base volume has a discontinuity at the 3" default
- **Component/File & Line:** `server/lib/calculate.js:4-9` (`flexBaseYards`)
- **The Issue:** At exactly 3" the installer rule (10 yd/1000 SF) applies; at 3.01" the geometric formula gives 9.29 yd/1000 SF — nudging the depth *up* by 0.01" **cuts** the quantity 7%. The two models disagree because 10 yd/1000 SF ≈ 3.24" geometric.
- **The Impact:** Confusing non-monotonic behavior in the builder (raise depth, watch price drop); the same 1,000 SF job carries different base cost depending on whether the user touched the field.
- **The Fix:** Make the rule-of-thumb a calibration factor rather than a branch: `yards = (sf * (depthInches / 12) / 27) * (yardsPer1000Sf / 9.259)` — smooth for all depths and equal to the installer rule at 3". Also reject `depthInches <= 0` (ties into C4).

---

#### M10. Output header shows `intake.total_sf`, but the math used `estimate.input.total_sf`
- **Component/File & Line:** `client/src/components/EstimateOutput.jsx:140,186`; also `ClientPresentationMode.jsx:22`
- **The Issue:** The builder lets the user edit Total SF (`EstimateBuilder.jsx:104`), which changes `estimate.input.total_sf` — but the Output/Presentation pages print `intake.total_sf`, which is frozen at intake time.
- **The Impact:** Printed quote says "1,000 SF" while the price was computed for 1,200 SF; `$ / SF` shown next to it uses the *new* SF, so the two figures visibly disagree on one page.
- **The Fix:** Read `estimate.input.total_sf` (fallback to `intake.total_sf`) everywhere on Output/Present pages. Same for `product_name` (cage-only estimates currently render "0 SF · undefined"-style fragments — guard both).

---

#### M11. Plant catalog tier `material` silently gets $50/unit install labor
- **Component/File & Line:** `server/lib/calculate.js:470` (`laborTable[plant.size_tier] ?? laborTable.unknown`), `data/components.json:164-187`, `data/plants/wolfe_nursery_2026_05.json` (tiers present include `material`)
- **The Issue:** The Wolfe catalog contains `size_tier: "material"` SKUs (landscape materials) that aren't in `install_labor_per_size`, so they fall through to `unknown: 50` — $50/each "dig & plant" labor on bagged goods.
- **The Impact:** Quiet over-billing on any estimate that includes nursery materials; nobody reviews a $50 line per bag.
- **The Fix:** Add `"material": 0` to `install_labor_per_size` (and log/warn when the `unknown` fallback fires so future tier drift is visible — ties into the golden tests in C5).

---

#### M12. Live pricing recalculates on every keystroke, and every calc re-reads 6 catalog files from disk
- **Component/File & Line:** `client/src/components/EstimateBuilder.jsx:58-93` (payload memo + effect, no debounce), `server/index.js:119-126` + `server/lib/data.js:28-75` (no caching; `loadPlants`/`loadRocks` do `readdir` + parse a 969-SKU file per request)
- **The Issue:** Each keystroke in any numeric field fires `POST /api/estimate`; the server then reads and `JSON.parse`s products, components, cimarron, plants (969 SKUs), and rocks (212 SKUs) from disk for every request. Stale-response handling is correct (the `cancelled` flag), so this is pure waste, not a race.
- **The Impact:** Sluggish typing on the Render starter instance and on job-site LTE; needless disk churn. Typing "1500" = 4 full round trips with 6 file reads each.
- **The Fix:** (a) Client: debounce the effect ~250 ms (`setTimeout` in the effect, cleared on cleanup — 3 lines). (b) Server: cache parsed catalogs in `data.js` keyed by `mtime` (or just cache-forever with a `/api/reload` escape hatch, since catalogs change only via deploy).

---

### LOW

---

#### L1. Dead code & duplication cluster
- **Component/File & Line:** `client/src/components/form/Field.jsx` (127-line accessible form-primitives module — **imported by nothing**; six components define their own local `Field`), `IntakeForm.jsx:36` (`SHAPE_OVERAGE` defined, never used — the mapping is re-hardcoded at `EstimateBuilder.jsx:17` and `PartnerPortal.jsx:57`), HD-frame SKU test duplicated (`CageQuickSetup.jsx:35`, `calculate.js:358`), `output/` dir empty.
- **The Impact:** Drift risk — the yard-shape overage now lives in three places; the a11y work in `form/Field.jsx` is silently unused.
- **The Fix:** Either adopt `form/Field.jsx` everywhere or delete it; export one `SHAPE_OVERAGE` from a shared constant (or put it in `components.json` so server + client read the same value); delete `output/`.

#### L2. Turf line: displayed qty is rounded, cost isn't
- **Component/File & Line:** `server/lib/calculate.js:111-114`
- **The Issue:** `qty: round(turfOrderSf, 0)` but `cost: turfOrderSf * cost_per_sf` — on the printed doc Qty × Unit misses the Total by pennies.
- **The Fix:** Round `turfOrderSf` once (up, to whole SF — you can't buy fractional SF) and use the rounded value for both qty and cost.

#### L3. `api.js` GET helpers never check `r.ok`
- **Component/File & Line:** `client/src/lib/api.js:3-21,42-45,53-56,77-80,131-139`
- **The Issue:** A 401 (expired Basic Auth session) or 500 returns HTML; `r.json()` throws `Unexpected token '<'` — the error users actually see.
- **The Fix:** One `async function j(r) { if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || `HTTP ${r.status}`); return r.json(); }` used by every helper.

#### L4. Global error handler returns 400 for everything and echoes internals
- **Component/File & Line:** `server/index.js:260-263`
- **The Issue:** Programming errors (TypeError in calc) surface as 400 with the raw message (file paths, stack hints); genuine server faults are indistinguishable from user errors in logs and clients.
- **The Fix:** `res.status(err.status || 500)`; only pass through messages for a whitelisted error type (e.g. `err.expose = true` on validation errors from C4).

#### L5. Gemini API key rides in the URL query string
- **Component/File & Line:** `server/lib/gemini.js:37`
- **The Issue:** `?key=...` ends up in any intermediary/proxy logs. Google supports the `x-goog-api-key` header.
- **The Fix:** Move the key to the header.

#### L6. Basic-auth comparison is not constant-time; CORS is wide open
- **Component/File & Line:** `server/index.js:36,50-51`
- **The Issue:** `u === APP_USER && p === APP_PASS` is timing-observable (marginal risk); `app.use(cors())` allows any origin — combined with Basic Auth (which browsers happily attach cross-site once cached), an attacker page can read API responses if the victim's browser has the credential cached.
- **The Fix:** Use `crypto.timingSafeEqual` on hashed buffers; restrict CORS to the known origins (`estimate.bearcatturf.com`, `localhost:5173`) or drop the middleware entirely (same-origin serving makes it unnecessary in prod).

#### L7. Per-line QB push: `margin_pct || 30` treats 0% margin as 30%, and per-line mode ignores the card fee
- **Component/File & Line:** `server/lib/quickbooks.js:342-357`
- **The Fix:** Use `Number.isFinite(totals.margin_pct) ? totals.margin_pct : 30`; add the card fee as its own QB line so per-line totals match `final_price`.

#### L8. Project Plan regenerates (paid Gemini call) on every visit
- **Component/File & Line:** `client/src/components/ProjectPlan.jsx:9-16`
- **The Issue:** Navigating Output → Plan → Output → Plan re-calls Gemini each time; nothing caches the plan for a given estimate.
- **The Fix:** Lift the generated plan into `EstimateOutput` state (`const [plan, setPlan]` passed down), keyed by estimate identity.

#### L9. Step nav allows jumping to Output with no estimate (blank screen)
- **Component/File & Line:** `client/src/App.jsx:88-97,140`
- **The Issue:** Step buttons disable only on `!intake`; clicking "3. Output" before generating renders an empty main area.
- **The Fix:** Disable step 2 when `!estimate` (`disabled={(i>0 && !intake) || (i===2 && !estimate)}`).

#### L10. Antimicrobial infill can be billed without its silica baseline
- **Component/File & Line:** `server/lib/calculate.js:211-213,253-255`, `data/components.json:63-67`
- **The Issue:** The $0.11/SF line is an *upcharge over* silica ($0.12/SF), but unchecking silica while leaving antimicrobial on bills only the upcharge — an impossible spec at an impossible price.
- **The Fix:** When `include_antimicrobial_infill && !include_silica_infill`, bill the full Envirofill rate ($0.23/SF) or add a warning.

#### L11. Sequential `await` in directory listing loops
- **Component/File & Line:** `server/lib/data.js:104-113,123-132`
- **The Fix:** `Promise.all(files.map(...))`. (Mostly moot once C7's slim index lands, but free to do.)

---

## 3. Core Logic Reference Table

| File | Primary responsibility | Audit status |
|---|---|---|
| `server/lib/calculate.js` | All pricing math: turf ordering, sub-base, seams, labor, margin, warnings | **Needs Fix** (C1, C2, C4, M1, M2, M3, M5-key, M9, M11, L2, L10) |
| `data/components.json` | Pricing constants, labor tables, tiers, floors | **Needs Fix** (add `material: 0` tier; optionally host shape-overage constant) |
| `data/products.json` | Turf SKUs + cost/SF | Pass |
| `server/lib/data.js` | JSON persistence, catalog loading, DATA_DIR split | **Needs Fix** (C3, C7, M12-cache, L11) |
| `server/index.js` | API routes, auth, static serving | **Needs Fix** (C4-validation, C6-auth scoping, L4, L6) |
| `server/lib/quickbooks.js` | OAuth, token refresh, estimate push | **Needs Fix** (M8, L7) |
| `server/lib/quickbooksDescription.js` | AI description + voice corpus | **Needs Fix** (M7) |
| `server/lib/parseMeasurement.js` | Gemini PDF/photo extraction | Pass (sensible round-up-to-10 policy) |
| `server/lib/parseVoiceIntake.js` / `projectPlan.js` / `gemini.js` | Voice parse, crew plan, Gemini client | Pass / minor (L5, L8) |
| `client/src/components/IntakeForm.jsx` | Intake wizard step 1 | **Needs Optimization** (L1 dead const; otherwise pass) |
| `client/src/components/EstimateBuilder.jsx` | Step 2: live pricing + all knobs | **Needs Fix** (M4, M5, M12-debounce) |
| `client/src/components/EstimateOutput.jsx` | Step 3: printable quote, QB actions | **Needs Fix** (M6, M10) |
| `client/src/components/CageQuickSetup.jsx` | Cage configurator + labor preview | **Needs Fix** (M3) |
| `client/src/components/PartnerPortal.jsx` / `PartnerAdmin.jsx` | Partner quoting + admin | **Needs Fix** (C6) |
| `client/src/components/EstimateHistory.jsx` | Saved-estimate browser | **Needs Fix** (C7 — consumes the fat payload) |
| `client/src/lib/api.js` | Fetch wrappers | **Needs Optimization** (L3) |
| Pickers (`Cimarron/Plant/Rock/TreeRemoval`) | Catalog line items | Pass (pending M5 custom-line editor they reference) |
| `MaterialCrossSection.jsx`, `ClientPresentationMode.jsx`, `Modal.jsx`, `ProjectPlan.jsx` | Presentation/visuals | Pass (M10 touches Present mode; L8) |
| `client/src/components/form/Field.jsx` | A11y form primitives | **Orphan — adopt or delete** (L1) |
| `render.yaml`, `tools/dev.sh`, `vite.config.js` | Deploy + dev tooling | Pass |

**External alignment note:** `CLAUDE.md` requires the public configurator (`bearcatturf/.../configurator.astro`, separate repo) and `cage-labor-matrix.xlsx` to stay in sync with cage-labor changes. Task 3.1 below changes cage-labor behavior — both must be re-checked when it lands.

---

## 4. Step-by-Step Execution Plan

Ordered so each phase leaves the app shippable, earlier phases protect later ones, and each task is a single-file (or single-concern) change a junior dev or execution model can do independently. Per repo rules: **each phase = one `feat/` branch, smoke-test in the browser before merging, never push without approval.**

### Phase 0 — Safety net (do first; everything else is verified against it)
| # | Task | Files | Depends on |
|---|---|---|---|
| 0.1 | Add `vitest` to `server/` (`npm i -D vitest`, `"test": "vitest run"`) | `server/package.json` | — |
| 0.2 | Unit tests for the four pure helpers: `flexBaseYards` (incl. the 3" boundary — encode *current* behavior, marked `.todo` for M9's fix), `perimeterFromSf`, `turfOrderSfFromDims`, `seamLengthFromDims` | `server/lib/calculate.test.js` (new) | 0.1 |
| 0.3 | Golden snapshot tests for `calculateEstimate` across 8 canonical inputs (rect w/ dims, irregular fill<0.85, multi-zone fill>1.05, putting green, cage quick-setup, cage net-only, supply-only, 300 SF labor-floor job, plants+rocks+tree job). Snapshot `lines` keys/qty/cost and `totals`. | `server/lib/calculate.golden.test.js` (new) | 0.1 |

### Phase 1 — Money math (each task updates its golden snapshots deliberately)
| # | Task | Files | Depends on |
|---|---|---|---|
| 1.1 | **C1:** Move the `other_costs` block below custom_line_items (just above the `totalCost` reduce). Update goldens. | `server/lib/calculate.js` | 0.3 |
| 1.2 | **C2:** Restrict cage auto-labor to `category === 'Batting Cage Net + Frame Combos'`; compute `cageQtyTotal` from combos only. The net-only golden from 0.3 flips from $7,200 labor → warning-only. | `server/lib/calculate.js` | 0.3 |
| 1.3 | **M1:** Two-orientation roll optimizer — `turfOrderSfFromDims` returns `{orderedSf, strips, rotated}` min of both layouts; `seamLengthFromDims` follows the chosen orientation; turf line label states orientation. | `server/lib/calculate.js` | 0.2 |
| 1.4 | **M2:** Perimeter from real dims when available (`2×(n+l)` when `useBoundingBox`), else square approx. | `server/lib/calculate.js` | 0.2 |
| 1.5 | **M9:** Smooth `flexBaseYards` (calibrated geometric formula, no 3" branch); guard `depth <= 0` → default depth + warning. | `server/lib/calculate.js` | 0.2 |
| 1.6 | **M11:** Add `"material": 0` to `install_labor_per_size`; push a warning when the `unknown` labor fallback fires. | `data/components.json`, `server/lib/calculate.js` | — |
| 1.7 | **L2 + L10:** Round turf order SF once for qty *and* cost; bill full Envirofill rate (or warn) when antimicrobial is on without silica. | `server/lib/calculate.js` | 0.3 |

### Phase 2 — Input validation & security
| # | Task | Files | Depends on |
|---|---|---|---|
| 2.1 | **C4:** `sanitizeEstimateInput()` — coerce/clamp every numeric field (`Number.isFinite` fallbacks; `total_sf ≥ 0`; `0 ≤ turf_overage_pct ≤ 100`; margin finite). Called at top of `calculateEstimate`. Add validation tests. | `server/lib/calculate.js`, tests | 0.3 |
| 2.2 | **C3:** Server-generated IDs in `saveEstimate`/`savePartnerJob` (`est_<ts>_<rand>`); accept incoming id only if `/^(est|pj)_[a-zA-Z0-9_-]+$/` **and** resolves inside the target dir. | `server/lib/data.js` | — |
| 2.3 | **C6b:** Compute partner-job `status` server-side from the partner record's `auto_approve_under_sf`; ignore client-posted status. Remove the client-side status logic. | `server/index.js`, `client/src/components/PartnerPortal.jsx` | — |
| 2.4 | **C6a:** Split auth: keep global Basic Auth, but allowlist the partner surface (`GET /api/partners/:slug`, `POST /api/partner-jobs`, `POST /api/estimate`, `GET /api/products|components`, `/partners/*` SPA path) ahead of the auth middleware. Admin routes (`/api/estimates`, `PUT /api/partners`, `/api/partner-jobs` GET, `/api/qb/*`) stay locked. | `server/index.js` | 2.3 |
| 2.5 | **L4 + L6:** Error handler → `err.status || 500`, expose message only for tagged validation errors; `timingSafeEqual` for auth; CORS restricted to known origins. | `server/index.js` | 2.1 |

### Phase 3 — State, workflow & estimator UX
| # | Task | Files | Depends on |
|---|---|---|---|
| 3.1 | **M3:** Single source of truth for cage labor: quick setup stops sending `_suggested_labor`; `calculateEstimate` accepts `cage_concrete_set` (overrides SKU HD detection); width multiplier applied only server-side; quick-setup preview reads the live `/api/estimate` result. **Re-verify against `cage-labor-matrix.xlsx` and the public configurator per CLAUDE.md.** | `server/lib/calculate.js`, `client/src/components/CageQuickSetup.jsx`, `EstimateBuilder.jsx` | 1.2 |
| 3.2 | **M4:** Hydrate builder from saved input: App passes `estimate?.input` to `EstimateBuilder` as `initialOpts`; only `+ New` clears it. | `client/src/App.jsx`, `EstimateBuilder.jsx` | — |
| 3.3 | **M5:** `CustomLineItems.jsx` editor (label/qty/unit/unit_cost rows, TreeRemovalPicker pattern); wire into builder; de-dupe line keys with index suffix server-side. | new component, `EstimateBuilder.jsx`, `server/lib/calculate.js` | — |
| 3.4 | **M6:** Output reconciliation: marked-up unit prices in Unit column; card fee as a table row; Cost/Profit rows wrapped in `no-print`. | `client/src/components/EstimateOutput.jsx` | — |
| 3.5 | **M10:** Output/Present read `estimate.input.total_sf` / `product_name` with intake fallback; guard cage-only rendering ("0 SF · undefined"). | `EstimateOutput.jsx`, `ClientPresentationMode.jsx` | — |
| 3.6 | **L9:** Disable Output step button until an estimate exists. | `client/src/App.jsx` | — |

### Phase 4 — Performance & reliability
| # | Task | Files | Depends on |
|---|---|---|---|
| 4.1 | **C7a:** Slim `GET /api/estimates` (strip attachments to metadata, drop `lines`); new `GET /api/estimates/:id` for full record; History fetches detail on Open. | `server/lib/data.js`, `server/index.js`, `client/src/lib/api.js`, `EstimateHistory.jsx`, `App.jsx` | 2.2 |
| 4.2 | **C7b:** QB push reads the single estimate file by id instead of `listEstimates().find()`. | `server/index.js`, `server/lib/data.js` | 4.1 |
| 4.3 | **M12:** 250 ms debounce in the builder's calc effect; mtime-keyed catalog cache in `data.js`. | `EstimateBuilder.jsx`, `server/lib/data.js` | — |
| 4.4 | **M7:** Voice corpus persists to `DATA_DIR` (copy-on-first-write from the static seed). | `server/lib/quickbooksDescription.js` | — |
| 4.5 | **M8:** Single-flight lock around QB token refresh. | `server/lib/quickbooks.js` | — |
| 4.6 | **L7 + L8 + L11:** QB margin `Number.isFinite` guard + card-fee line in per-line push; cache project plan in Output state; `Promise.all` in list loops. | `quickbooks.js`, `EstimateOutput.jsx`/`ProjectPlan.jsx`, `data.js` | — |

### Phase 5 — Cleanup
| # | Task | Files | Depends on |
|---|---|---|---|
| 5.1 | **L1:** Adopt `form/Field.jsx` primitives across components **or** delete it; single `SHAPE_OVERAGE` source (suggest `components.json → settings.shape_overage_pct`) consumed by IntakeForm, EstimateBuilder, PartnerPortal; shared `isHdFrame()`; delete empty `output/`. | multiple | Phase 3 done |
| 5.2 | **L3:** `r.ok`-checking response helper in `api.js`, applied to every fetch. | `client/src/lib/api.js` | — |
| 5.3 | **L5:** Gemini key via `x-goog-api-key` header. | `server/lib/gemini.js` | — |
| 5.4 | Run the full golden suite + a manual browser smoke test (one real estimate end-to-end per CLAUDE.md rule 3) before each phase's merge to main. | — | every phase |

**Suggested branch mapping:** `feat/audit-tests` (Phase 0) → `feat/audit-calc-fixes` (1) → `feat/audit-validation` (2) → `feat/audit-workflow` (3) → `feat/audit-perf` (4) → `feat/audit-cleanup` (5). Phases 1-2 are the highest-leverage; 0 is non-negotiable before touching `calculate.js`.
