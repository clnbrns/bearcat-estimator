import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  flexBaseYards,
  perimeterFromSf,
  turfLayoutFromDims,
  sanitizeEstimateInput,
  calculateEstimate,
} from './calculate.js';

describe('flexBaseYards', () => {
  it('matches the installer rule of thumb at the 3" default (10 yd / 1000 SF)', () => {
    expect(flexBaseYards(1000, 3, 10)).toBeCloseTo(10, 6);
    expect(flexBaseYards(2500, 3, 10)).toBeCloseTo(25, 6);
  });

  it('is continuous around 3" — no cliff when depth moves off the default', () => {
    const at3 = flexBaseYards(1000, 3, 10);
    const justOver = flexBaseYards(1000, 3.01, 10);
    expect(Math.abs(justOver - at3)).toBeLessThan(0.05);
    expect(justOver).toBeGreaterThan(at3); // deeper base = more material, always
  });

  it('scales linearly with depth (6" = 2× the 3" quantity)', () => {
    expect(flexBaseYards(1000, 6, 10)).toBeCloseTo(2 * flexBaseYards(1000, 3, 10), 6);
  });
});

describe('perimeterFromSf', () => {
  it('uses the square approximation', () => {
    expect(perimeterFromSf(1600)).toBeCloseTo(160, 6);
    expect(perimeterFromSf(0)).toBe(0);
  });
});

describe('turfLayoutFromDims', () => {
  it('keeps the standard orientation when it orders less', () => {
    // 30×50: standard 2 strips ×15×50 = 1500; rotated 4 strips ×15×30 = 1800
    const l = turfLayoutFromDims(30, 50, 15);
    expect(l).toMatchObject({ strips: 2, orderedSf: 1500, seamLf: 50, rotated: false });
  });

  it('rotates when running strips along the narrow dim buys less turf', () => {
    // 20×46: standard 2×15×46 = 1380; rotated 4×15×20 = 1200
    const l = turfLayoutFromDims(20, 46, 15);
    expect(l).toMatchObject({ strips: 4, orderedSf: 1200, seamLf: 60, rotated: true });
  });

  it('single-strip fit has zero seams', () => {
    const l = turfLayoutFromDims(15, 40, 15);
    expect(l).toMatchObject({ strips: 1, orderedSf: 600, seamLf: 0, rotated: false });
  });

  it('breaks orderedSf ties toward less seam length', () => {
    // 30×30: both orientations order 900 with 30 LF seam → standard wins the tie
    const l = turfLayoutFromDims(30, 30, 15);
    expect(l.orderedSf).toBe(900);
    expect(l.rotated).toBe(false);
  });
});

describe('sanitizeEstimateInput', () => {
  const components = {
    flex_base: { default_depth_inches: 3 },
    settings: { default_margin_pct: 30, card_fee_pct: 3.5 },
  };

  it('clamps negatives and coerces junk to safe defaults', () => {
    const s = sanitizeEstimateInput({
      total_sf: -500,
      narrow_dim_ft: 'abc',
      margin_pct: 'not a number',
      turf_overage_pct: 500,
      pg_cup_count: -3,
      hitting_mat_count: '2',
    }, components);
    expect(s.total_sf).toBe(0);
    expect(s.narrow_dim_ft).toBe(0);
    expect(s.margin_pct).toBe(30);
    expect(s.turf_overage_pct).toBe(100);
    expect(s.pg_cup_count).toBe(0);
    expect(s.hitting_mat_count).toBe(2);
  });

  it('treats a zero/blank flex-base depth as "use the default", not "no base"', () => {
    expect(sanitizeEstimateInput({ flex_base_depth_in: 0 }, components).flex_base_depth_in).toBe(3);
    expect(sanitizeEstimateInput({ flex_base_depth_in: '' }, components).flex_base_depth_in).toBe(3);
    expect(sanitizeEstimateInput({ flex_base_depth_in: 4 }, components).flex_base_depth_in).toBe(4);
    expect(sanitizeEstimateInput({ flex_base_depth_in: 99 }, components).flex_base_depth_in).toBe(12);
  });

  it('leaves optional overrides undefined when blank, and drops non-finite values', () => {
    const s = sanitizeEstimateInput({ perimeter_lf: '', seam_lf: 'x', bender_board_lf: 120 }, components);
    expect(s.perimeter_lf).toBeUndefined();
    expect(s.seam_lf).toBeUndefined();
    expect(s.bender_board_lf).toBe(120);
  });

  it('forces item collections to arrays', () => {
    const s = sanitizeEstimateInput({ cimarron_items: 'nope', plant_items: null }, components);
    expect(s.cimarron_items).toEqual([]);
    expect(s.plant_items).toEqual([]);
    expect(s.rock_items).toEqual([]);
  });
});

describe('per-line margin override on custom line items', () => {
  const components = JSON.parse(
    readFileSync(new URL('../../data/components.json', import.meta.url), 'utf8'),
  );
  const base = { no_turf: true, margin_pct: 30, include_shock_pad: false };

  it('prices an override line at its own margin and the rest at the estimate margin', () => {
    const r = calculateEstimate({
      ...base,
      custom_line_items: [
        { label: 'Own work', qty: 1, unit_cost: 700 },
        { label: 'Sub bid', qty: 1, unit_cost: 950, margin_pct: 5 },
      ],
    }, [], components);
    expect(r.totals.cost).toBe(1650);
    expect(r.totals.sell_price).toBeCloseTo(700 / 0.7 + 950 / 0.95, 2); // 1000 + 1000
    expect(r.totals.profit).toBeCloseTo(350, 2);
  });

  it('leaves pricing unchanged when no line has an override', () => {
    const r = calculateEstimate({
      ...base,
      custom_line_items: [{ label: 'Own work', qty: 2, unit_cost: 350 }],
    }, [], components);
    expect(r.totals.sell_price).toBeCloseTo(1000, 2);
  });
});

describe('minimum margin floor', () => {
  const components = JSON.parse(
    readFileSync(new URL('../../data/components.json', import.meta.url), 'utf8'),
  );
  const input = { no_turf: true, include_shock_pad: false, custom_line_items: [{ label: 'x', qty: 1, unit_cost: 700 }] };

  it('clamps a requested margin below the floor up to the floor', () => {
    const r = calculateEstimate({ ...input, margin_pct: 20 }, [], components);
    expect(r.totals.sell_price).toBeCloseTo(1000, 2);
  });

  it('starts Good/Better/Best at the floor', () => {
    const r = calculateEstimate({ ...input, margin_pct: 30 }, [], components);
    expect(r.tiers.good).toBeCloseTo(700 / 0.7, 2);
    expect(r.tiers.better).toBeCloseTo(700 / 0.65, 2);
    expect(r.tiers.best).toBeCloseTo(700 / 0.6, 2);
  });

  it('warns when a per-line override sits below the floor', () => {
    const r = calculateEstimate({ ...input, margin_pct: 30, custom_line_items: [{ label: 'Sub', qty: 1, unit_cost: 950, margin_pct: 5 }] }, [], components);
    expect(r.warnings.some(w => /below the 30% margin floor/.test(w))).toBe(true);
  });
});

describe('margin floor exemptions', () => {
  const components = JSON.parse(
    readFileSync(new URL('../../data/components.json', import.meta.url), 'utf8'),
  );
  const cimarron = [{ sku: 'CAGE1', name: 'Cage', category: 'Batting Cage Net + Frame Combos', length: 40, wholesale2024: 1000, map2024: 0 }];
  const base = { no_turf: true, include_shock_pad: false, custom_line_items: [{ label: 'x', qty: 1, unit_cost: 770 }] };

  it('honors a below-floor margin on batting cage jobs', () => {
    const r = calculateEstimate({ ...base, margin_pct: 23, cimarron_items: [{ sku: 'CAGE1', qty: 1 }] }, [], components, cimarron);
    expect(r.totals.margin_pct).toBe(23);
    expect(r.margin_floor_pct).toBe(0);
  });

  it('honors a below-floor margin when the server flags a partner', () => {
    const r = calculateEstimate({ ...base, margin_pct: 20, margin_floor_exempt: true }, [], components);
    expect(r.totals.sell_price).toBeCloseTo((770) / 0.8, 2);
  });

  it('still floors ordinary jobs', () => {
    const r = calculateEstimate({ ...base, margin_pct: 20 }, [], components);
    expect(r.totals.margin_pct).toBe(30);
    expect(r.margin_floor_pct).toBe(30);
  });
});

describe('downspout drain and paver lines', () => {
  const components = JSON.parse(
    readFileSync(new URL('../../data/components.json', import.meta.url), 'utf8'),
  );
  const base = { no_turf: true, margin_pct: 30, include_shock_pad: false };

  it('adds drain and paver lines priced from components', () => {
    const r = calculateEstimate({ ...base, downspout_drain_lf: 48, paver_count: 12 }, [], components);
    const drain = r.lines.find(l => l.key === 'downspout_drain');
    const paver = r.lines.find(l => l.key === 'paver');
    expect(drain.cost).toBeCloseTo(48 * components.downspout_drain.cost_per_lf, 2);
    expect(paver.cost).toBeCloseTo(12 * components.paver.cost_each, 2);
  });

  it('adds nothing when counts are zero or invalid', () => {
    const r = calculateEstimate({ ...base, downspout_drain_lf: -5, paver_count: 'x' }, [], components);
    expect(r.lines.some(l => l.key === 'downspout_drain' || l.key === 'paver')).toBe(false);
  });
});
