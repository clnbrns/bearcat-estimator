// End-to-end behavior tests for calculateEstimate against the REAL catalogs
// (products, components, cimarron). These lock in the audit fixes: any change
// to customer-facing dollar math must consciously update these expectations.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateEstimate } from './calculate.js';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const load = (f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8'));
const products = load('products.json').products;
const components = load('components.json');
const cimarron = load('cimarron.json').products;

const DAY_RATE = components.cage_install.day_rate; // 1800
const line = (r, key) => r.lines.find(l => l.key === key);

// Real SKUs (verified in data/cimarron.json):
const NET_ONLY_SKU = '302024TP';      // 30' net, category "Batting Cage Nets Only"
const COMBO_SKU = '302024TPC';        // 30' net+frame combo (Frame Corners)
const COMBO_HD_SKU = '302024TPCF1.5'; // 30' combo, HD frame (concrete-set)

const baseTurfJob = {
  total_sf: 1400,
  narrow_dim_ft: 28,
  long_dim_ft: 50,
  product_name: 'Bermuda Pro',
  project_type: 'Residential',
};

describe('turf job with real dims (28×50, 1,400 SF)', () => {
  const r = calculateEstimate(baseTurfJob, products, components);

  it('computes perimeter from the actual dims, not the square approximation', () => {
    expect(r.perimeter_lf).toBe(2 * (28 + 50)); // 156, not sqrt(1400)*4 ≈ 149.7
  });

  it('orders whole square feet and the turf line reconciles: qty × unit = cost', () => {
    const turf = line(r, 'turf');
    expect(Number.isInteger(turf.qty)).toBe(true);
    expect(turf.qty * turf.unit_cost).toBeCloseTo(turf.cost, 6);
  });

  it('picks the cheaper roll orientation (standard here: 2 strips × 15 × 50)', () => {
    expect(line(r, 'turf').qty).toBe(1500);
  });

  it('produces finite totals', () => {
    for (const v of Object.values(r.totals)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('roll-orientation optimizer inside an estimate (20×46, 920 SF)', () => {
  const r = calculateEstimate({ ...baseTurfJob, total_sf: 920, narrow_dim_ft: 20, long_dim_ft: 46 },
    products, components);

  it('rotates the layout when that buys less turf (1,200 SF not 1,380)', () => {
    expect(line(r, 'turf').qty).toBe(1200);
    expect(line(r, 'turf').label).toContain('narrow');
  });

  it('seam length follows the chosen orientation (3 seams × 20 ft)', () => {
    expect(line(r, 'seam_tape').qty).toBe(60);
  });
});

describe('elongated strip (15×100, 1,500 SF)', () => {
  const r = calculateEstimate({ ...baseTurfJob, total_sf: 1500, narrow_dim_ft: 15, long_dim_ft: 100 },
    products, components);

  it('perimeter is 230 LF (was ~155 under the square approximation)', () => {
    expect(r.perimeter_lf).toBe(230);
  });

  it('single strip → no seam tape billed beyond zero LF', () => {
    expect(line(r, 'seam_tape').qty).toBe(0);
  });
});

describe('other costs % basis (C1)', () => {
  it('is the LAST line and covers Cimarron / plants / rocks / subs / custom', () => {
    const plants = [{ id: 'p1', description: 'Live Oak 15g', price: 100, size_tier: '15g' }];
    const rocks = [{ id: 'r1', description: 'River rock', price: 80, unit: 'ton', category: 'River Rocks' }];
    const r = calculateEstimate({
      ...baseTurfJob,
      other_costs_pct: 10,
      cimarron_items: [{ sku: COMBO_SKU, qty: 1 }],
      plant_items: [{ id: 'p1', qty: 2 }],
      rock_items: [{ id: 'r1', qty: 3 }],
      tree_removal_items: [{ description: 'Crape myrtle', qty: 1, sub_cost: 900 }],
      custom_line_items: [{ label: 'Hand-set coping labor', qty: 1, unit_cost: 500 }],
    }, products, components, cimarron, plants, rocks);

    const other = line(r, 'other_costs');
    expect(r.lines[r.lines.length - 1].key).toBe('other_costs');
    const basisSum = r.lines.filter(l => l.key !== 'other_costs').reduce((s, l) => s + (l.cost || 0), 0);
    expect(other.cost).toBeCloseTo(basisSum * 0.10, 6);
    // sanity: the basis really includes the non-turf lines
    expect(line(r, `cimarron_${COMBO_SKU}`)).toBeTruthy();
    expect(line(r, 'plant_p1')).toBeTruthy();
    expect(line(r, 'rock_r1')).toBeTruthy();
  });
});

describe('cage auto-labor (C2 / M3)', () => {
  const cageJob = (items, extra = {}) => calculateEstimate(
    { total_sf: 0, no_turf: true, project_type: 'Cage Install (no turf)', cimarron_items: items, ...extra },
    products, components, cimarron);

  it('a replacement net alone gets NO auto assembly labor — just the safety-net warning', () => {
    const r = cageJob([{ sku: NET_ONLY_SKU, qty: 1 }]);
    expect(line(r, 'equipment_install')).toBeUndefined();
    expect(r.warnings.some(w => w.includes('no cage assembly labor'))).toBe(true);
  });

  it('a 30\' combo auto-adds the small-tier labor (2 days × day rate)', () => {
    const r = cageJob([{ sku: COMBO_SKU, qty: 1 }]);
    expect(line(r, 'equipment_install').cost).toBe(2 * DAY_RATE); // 3600
  });

  it('adding a spare net does not change combo labor (width counts combos only)', () => {
    const r = cageJob([{ sku: COMBO_SKU, qty: 1 }, { sku: NET_ONLY_SKU, qty: 1 }]);
    expect(line(r, 'equipment_install').cost).toBe(2 * DAY_RATE);
  });

  it('two combos = double-wide 1.6× multiplier', () => {
    const r = cageJob([{ sku: COMBO_SKU, qty: 2 }]);
    expect(line(r, 'equipment_install').cost).toBe(Math.round(2 * DAY_RATE * 1.6)); // 5760
  });

  it('HD frame SKU adds the concrete-set day automatically', () => {
    const r = cageJob([{ sku: COMBO_HD_SKU, qty: 1 }]);
    expect(line(r, 'equipment_install').cost).toBe(3 * DAY_RATE); // 5400
  });

  it('cage_concrete_set flag adds the concrete-set day on a non-HD frame (quick-setup checkbox)', () => {
    const r = cageJob([{ sku: COMBO_SKU, qty: 1 }], { cage_concrete_set: true });
    expect(line(r, 'equipment_install').cost).toBe(3 * DAY_RATE); // 5400
  });

  it('a manually entered install fee still wins over the auto-calc', () => {
    const r = cageJob([{ sku: COMBO_SKU, qty: 1 }], { equipment_install_fee: 850 });
    expect(line(r, 'equipment_install').cost).toBe(850);
  });
});

describe('plant install labor tiers (M11)', () => {
  const plants = [
    { id: 'soil', description: 'Bagged soil', price: 8, size_tier: 'material' },
    { id: 'oak', description: 'Live Oak 15g', price: 120, size_tier: '15g' },
    { id: 'odd', description: 'Mystery plant', price: 30, size_tier: '17g' },
  ];
  const job = (items) => calculateEstimate({ ...baseTurfJob, plant_items: items }, products, components, [], plants);

  it("'material' tier bills no dig-and-plant labor and raises no warning", () => {
    const r = job([{ id: 'soil', qty: 10 }]);
    expect(line(r, 'plant_labor_soil')).toBeUndefined();
    expect(r.warnings.some(w => w.includes('size tier'))).toBe(false);
  });

  it('known tiers bill from the labor table', () => {
    const r = job([{ id: 'oak', qty: 2 }]);
    expect(line(r, 'plant_labor_oak').cost).toBe(2 * 75); // 15g → $75/ea
  });

  it('an unrecognized tier falls back to the unknown rate AND warns', () => {
    const r = job([{ id: 'odd', qty: 1 }]);
    expect(line(r, 'plant_labor_odd').cost).toBe(50);
    expect(r.warnings.some(w => w.includes('17g'))).toBe(true);
  });
});

describe('hostile / degenerate input (C4)', () => {
  it('negative SF, junk margin, and non-array items produce a finite, sane result', () => {
    const r = calculateEstimate({
      total_sf: -500,
      product_name: 'Bermuda Pro',
      margin_pct: 'abc',
      turf_overage_pct: -50,
      flex_base_depth_in: 0,
      cimarron_items: 'nope',
    }, products, components, cimarron);
    for (const v of Object.values(r.totals)) expect(Number.isFinite(v)).toBe(true);
    for (const l of r.lines) expect(Number.isFinite(l.cost)).toBe(true);
    expect(r.totals.cost).toBeGreaterThanOrEqual(0);
  });

  it('a tiny job still triggers the min-day labor floor', () => {
    const r = calculateEstimate({ ...baseTurfJob, total_sf: 300, narrow_dim_ft: 0, long_dim_ft: 0 },
      products, components);
    expect(line(r, 'labor_min_day_adjustment')).toBeTruthy();
    expect(r.warnings.some(w => w.includes('Min day-rate'))).toBe(true);
  });
});

describe('representative job snapshots (regression net)', () => {
  const cases = {
    'residential 28x50': baseTurfJob,
    'irregular curves yard (fill < 0.85)': {
      ...baseTurfJob, total_sf: 1000, narrow_dim_ft: 40, long_dim_ft: 50, turf_overage_pct: 20,
    },
    'multi-zone (fill > 1.05)': { ...baseTurfJob, total_sf: 2000, narrow_dim_ft: 28, long_dim_ft: 50 },
    'putting green': {
      total_sf: 600, narrow_dim_ft: 20, long_dim_ft: 30, product_name: 'Tour Elite',
      project_type: 'Putting Green', putting_green_sf: 600, pg_cup_count: 3, pg_flag_count: 3,
    },
    'supply only': { ...baseTurfJob, supply_only: true },
    'cage quick setup (HD combo)': {
      total_sf: 0, no_turf: true, project_type: 'Cage Install (no turf)',
      cimarron_items: [{ sku: COMBO_HD_SKU, qty: 1 }], margin_pct: 23,
    },
  };
  for (const [name, input] of Object.entries(cases)) {
    it(name, () => {
      const r = calculateEstimate(input, products, components, cimarron);
      const summary = {
        lines: r.lines.map(l => ({ key: l.key, qty: l.qty, cost: Math.round(l.cost * 100) / 100 })),
        totals: r.totals,
        warnings: r.warnings,
      };
      expect(summary).toMatchSnapshot();
    });
  }
});
