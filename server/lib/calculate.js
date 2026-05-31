// Pure pricing/quantity math. Inputs come in as numbers; outputs are numbers.
// Currency formatting and rounding for display happens on the client.

export function flexBaseYards(sf, depthInches = 3, yardsPer1000Sf = 10) {
  // Use installer rule of thumb (10 yd per 1000 SF) when at default 3" depth.
  // Otherwise fall back to geometric calc: SF * depth_ft / 27.
  if (Math.abs(depthInches - 3) < 0.01) return (sf / 1000) * yardsPer1000Sf;
  return (sf * (depthInches / 12)) / 27;
}

export function perimeterFromSf(sf) {
  // Square approximation: side = sqrt(SF), perimeter = 4 * side
  return Math.sqrt(sf) * 4;
}

// Improvement A: roll-width optimizer.
// Returns the SF you actually have to BUY given a 15'-wide roll cut to length.
// strips = ceil(narrow / rollWidth); orderedSf = strips * rollWidth * long
export function turfOrderSfFromDims(narrowFt, longFt, rollWidthFt = 15) {
  const strips = Math.ceil(narrowFt / rollWidthFt);
  return strips * rollWidthFt * longFt;
}

// Improvement B: seam length from dimensions.
// (strips - 1) interior seams, each running the long dimension.
export function seamLengthFromDims(narrowFt, longFt, rollWidthFt = 15) {
  const strips = Math.ceil(narrowFt / rollWidthFt);
  if (strips <= 1) return 0;
  return (strips - 1) * longFt;
}

export function calculateEstimate(input, products, components, cimarron = [], plants = [], rocks = []) {
  const {
    total_sf = 0,
    product_name,
    project_type,
    supply_only = false,
    no_turf = false,
    equipment_install_fee = 0,
    turf_overage_pct = 10,
    narrow_dim_ft,
    long_dim_ft,
    perimeter_lf,
    seam_lf,
    flex_base_depth_in = components.flex_base.default_depth_inches,
    include_demo = false,
    include_laser_grading = false,
    include_weed_barrier = true,
    include_seam_tape = true,
    include_bender_board = true,
    bender_board_lf,
    lumber_2x4_lf = 0,
    include_silica_infill = true,
    include_antimicrobial_infill = false,
    french_drain_lf = 0,
    putting_green_sf = 0,
    pg_cup_count = 0,
    pg_cup_size = '6in',
    pg_flag_count = 0,
    hitting_mat_count = 0,
    include_shock_pad,
    cimarron_items = [],
    plant_items = [],
    rock_items = [],
    tree_removal_items = [],
    custom_line_items = [],
    margin_pct = components.settings.default_margin_pct,
    apply_card_fee = components.settings.card_fee_enabled,
    card_fee_pct = components.settings.card_fee_pct,
    other_costs_pct = components.settings.other_costs_pct,
  } = input;

  const product = no_turf ? null : products.find(p => p.name === product_name);
  if (!no_turf && !product) throw new Error(`Unknown product: ${product_name}`);

  const perimeter = perimeter_lf ?? perimeterFromSf(total_sf);
  const baseYards = flexBaseYards(total_sf, flex_base_depth_in, components.flex_base.yards_per_1000_sf);
  const baseDeliveries = Math.ceil(baseYards / components.flex_base.yards_per_delivery);
  const baseMaterialCost = baseYards * components.flex_base.cost_per_cubic_yard;
  const baseDeliveryCost = baseDeliveries * components.flex_base.delivery_fee;

  const lines = [];

  const rollWidth = components.turf_roll?.width_ft ?? 15;
  const haveDims = narrow_dim_ft > 0 && long_dim_ft > 0;
  // "Irregular shape" detection: if actual SF is much smaller than the bounding-box
  // dims imply, the yard is non-rectangular and we should NOT order the full
  // strips × rollWidth × long (that would massively over-order). Threshold: yard
  // fills ≥85% of its bounding box → treat as rectangular; else flat overage.
  const boundingBoxArea = haveDims ? narrow_dim_ft * long_dim_ft : 0;
  const fillRatio = boundingBoxArea > 0 ? total_sf / boundingBoxArea : 1;
  // Bounding-box roll math only valid when total_sf is roughly == narrow×long.
  // - fillRatio < 0.85  → irregular yard (e.g. kidney). Bounding box over-orders.
  // - fillRatio > 1.05  → multi-zone job; dims represent one zone only.
  //   Bounding box UNDER-orders by ignoring the other zones.
  // In both cases, fall back to flat per-SF overage on actual total.
  const useBoundingBox = haveDims && fillRatio >= 0.85 && fillRatio <= 1.05;
  const turfOrderSf = no_turf ? 0 : (useBoundingBox
    ? turfOrderSfFromDims(narrow_dim_ft, long_dim_ft, rollWidth)
    : total_sf * (1 + turf_overage_pct / 100));
  const turfWastePct = total_sf > 0 && !no_turf ? round(((turfOrderSf - total_sf) / total_sf) * 100, 1) : 0;
  const multiZone = haveDims && fillRatio > 1.05;
  const turfLabel = no_turf ? '' : (useBoundingBox
    ? `Turf material — ${product.name} (${narrow_dim_ft}'×${long_dim_ft}' from ${rollWidth}' rolls, ${turfWastePct}% waste)`
    : `Turf material — ${product.name} (${total_sf} SF + ${turf_overage_pct}% waste${multiZone ? ', multi-zone — dims cover only one zone' : haveDims ? ', irregular shape' : ''})`);
  if (!no_turf) {
    lines.push({
      key: 'turf',
      label: turfLabel,
      qty: round(turfOrderSf, 0),
      unit: 'SF',
      unit_cost: product.cost_per_sf,
      cost: turfOrderSf * product.cost_per_sf,
    });
  }

  if (!supply_only && !no_turf) {
    lines.push({
      key: 'flex_base',
      label: `${components.flex_base.label} (${round(baseYards,1)} yd, ${baseDeliveries} deliver${baseDeliveries>1?'ies':'y'})`,
      qty: round(baseYards, 2),
      unit: 'CY',
      unit_cost: components.flex_base.cost_per_cubic_yard,
      cost: baseMaterialCost + baseDeliveryCost,
    });
  }

  if (include_weed_barrier && !no_turf) {
    lines.push(componentLine('weed_barrier', components.weed_barrier, total_sf, 'SF'));
  }
  if (include_seam_tape && !no_turf) {
    const st = components.seam_tape;
    const glue = components.glue;
    const computedSeamLf = seam_lf != null
      ? seam_lf
      : (useBoundingBox ? seamLengthFromDims(narrow_dim_ft, long_dim_ft, rollWidth) : null);
    if (computedSeamLf != null) {
      // Auto-switch to bulk pricing when seam length crosses threshold
      const useBulk = computedSeamLf >= st.bulk_threshold_lf;
      const tapeRate = useBulk ? st.bulk_cost_per_lf : st.cost_per_lf;
      const tapeLabel = useBulk
        ? `${st.label} (${round(computedSeamLf, 1)} LF, bulk roll @ $${st.bulk_cost_per_lf}/LF)`
        : `${st.label} (${round(computedSeamLf, 1)} LF of seams)`;
      lines.push({
        key: 'seam_tape',
        label: tapeLabel,
        qty: round(computedSeamLf, 1),
        unit: 'LF',
        unit_cost: tapeRate,
        cost: computedSeamLf * tapeRate,
      });
      // Glue: 1 gal per 200 LF, rounded up
      const gallons = Math.ceil(computedSeamLf / glue.lf_per_gallon);
      if (gallons > 0) {
        lines.push({
          key: 'glue',
          label: `${glue.label} (${gallons} gal × ${glue.lf_per_gallon} LF coverage)`,
          qty: gallons,
          unit: 'gal',
          unit_cost: glue.cost_per_gallon,
          cost: gallons * glue.cost_per_gallon,
        });
      }
    } else {
      // No dims — fall back to per-SF estimate (combined tape + glue)
      lines.push({
        key: 'seam_tape',
        label: `${st.label} + glue (estimate, no dims provided)`,
        qty: total_sf,
        unit: 'SF',
        unit_cost: st.fallback_cost_per_sf,
        cost: total_sf * st.fallback_cost_per_sf,
      });
    }
  }
  if (include_bender_board && !no_turf) {
    const bb = components.bender_board;
    const requestedLf = bender_board_lf != null ? bender_board_lf : perimeter;
    const sticks = Math.ceil(requestedLf / bb.stick_length_lf);
    const billedLf = sticks * bb.stick_length_lf;
    lines.push({
      key: 'bender_board',
      label: `${bb.label} (${sticks} × ${bb.stick_length_lf}' sticks)`,
      qty: billedLf,
      unit: 'LF',
      unit_cost: bb.cost_per_lf,
      cost: sticks * bb.cost_per_stick,
    });
    const stakes = components.bender_board_stakes;
    const stakeQty = Math.ceil(billedLf / stakes.lf_per_stake);
    lines.push({
      key: 'bender_board_stakes',
      label: stakes.label,
      qty: stakeQty,
      unit: 'EA',
      unit_cost: stakes.cost_per_stake,
      cost: stakeQty * stakes.cost_per_stake,
    });
  }
  if (lumber_2x4_lf > 0) {
    lines.push({
      key: 'lumber_2x4',
      label: components.lumber_2x4.label,
      qty: lumber_2x4_lf,
      unit: 'LF',
      unit_cost: components.lumber_2x4.cost_per_lf,
      cost: lumber_2x4_lf * components.lumber_2x4.cost_per_lf,
    });
  }
  if (include_silica_infill && !no_turf) {
    lines.push(componentLine('silica_sand_infill', components.silica_sand_infill, total_sf, 'SF'));
  }

  // Shock pad: auto-on for Playground projects, manual toggle elsewhere
  const shockPadOn = include_shock_pad ?? (project_type === 'Playground');
  if (shockPadOn && total_sf > 0 && !supply_only) {
    lines.push(componentLine('shock_pad', components.shock_pad, total_sf, 'SF'));
  }

  // Hitting mats (batting cage projects)
  if (hitting_mat_count > 0) {
    lines.push({
      key: 'hitting_mat',
      label: components.hitting_mat.label,
      qty: hitting_mat_count,
      unit: 'EA',
      unit_cost: components.hitting_mat.cost_each,
      cost: hitting_mat_count * components.hitting_mat.cost_each,
    });
  }
  if (include_antimicrobial_infill && !no_turf) {
    lines.push(componentLine('antimicrobial_infill_upcharge', components.antimicrobial_infill_upcharge, total_sf, 'SF'));
  }
  if (include_demo && !supply_only) {
    lines.push(componentLine('demo', components.demo, total_sf, 'SF'));
  }
  if (include_laser_grading && !supply_only) {
    lines.push(componentLine('laser_grading', components.laser_grading, total_sf, 'SF'));
  }
  if (french_drain_lf > 0) {
    lines.push({
      key: 'french_drain',
      label: components.french_drain.label,
      qty: french_drain_lf,
      unit: 'LF',
      unit_cost: components.french_drain.cost_per_lf,
      cost: french_drain_lf * components.french_drain.cost_per_lf,
    });
  }
  const pgSf = (supply_only || no_turf) ? 0 : Math.min(Math.max(putting_green_sf, 0), total_sf);
  const standardSf = (supply_only || no_turf) ? 0 : total_sf - pgSf;
  const standardLaborCost = standardSf * components.labor.cost_per_sf;
  const pgLaborCost = pgSf * components.putting_green_labor.cost_per_sf;
  const computedLabor = standardLaborCost + pgLaborCost;
  const minDay = (supply_only || no_turf) ? 0 : (components.labor.min_day_rate ?? 0);
  const labor_floored = !supply_only && !no_turf && computedLabor < minDay && total_sf > 0;

  if (standardSf > 0) {
    lines.push({
      key: 'labor',
      label: components.labor.label,
      qty: standardSf,
      unit: 'SF',
      unit_cost: components.labor.cost_per_sf,
      cost: standardLaborCost,
    });
  }
  if (pgSf > 0) {
    lines.push({
      key: 'putting_green_labor',
      label: components.putting_green_labor.label,
      qty: pgSf,
      unit: 'SF',
      unit_cost: components.putting_green_labor.cost_per_sf,
      cost: pgLaborCost,
    });
    lines.push({
      key: 'putting_green_upcharge',
      label: components.putting_green_upcharge.label,
      qty: pgSf,
      unit: 'SF',
      unit_cost: components.putting_green_upcharge.cost_per_sf,
      cost: pgSf * components.putting_green_upcharge.cost_per_sf,
    });
  }

  // PG hardware — itemized cups + flags
  if (pg_cup_count > 0) {
    const cupSpec = pg_cup_size === '4in' ? components.pg_cup_4in : components.pg_cup_6in;
    lines.push({
      key: 'pg_cups',
      label: cupSpec.label,
      qty: pg_cup_count,
      unit: 'EA',
      unit_cost: cupSpec.cost_each,
      cost: pg_cup_count * cupSpec.cost_each,
    });
  }
  if (pg_flag_count > 0) {
    const flagSet = components.pg_flag_pole.cost_each + components.pg_flag_nylon.cost_each;
    lines.push({
      key: 'pg_flags',
      label: 'Flag set (30" pole + nylon flag)',
      qty: pg_flag_count,
      unit: 'EA',
      unit_cost: flagSet,
      cost: pg_flag_count * flagSet,
    });
  }

  if (labor_floored) {
    const adjustment = minDay - computedLabor;
    lines.push({
      key: 'labor_min_day_adjustment',
      label: `Min day-rate adjustment (computed labor $${round(computedLabor,2)} → $${minDay} min)`,
      qty: 1,
      unit: '',
      unit_cost: adjustment,
      cost: adjustment,
    });
  }

  // Equipment install fee (cage install, etc.) — billed when no_turf or as add-on.
  // Auto-fill from cimarron_items when a batting-cage product is present and no
  // manual fee was entered. This guarantees every cage estimate carries assembly
  // labor whether the user came in via Quick Cage Setup or hand-picked items.
  let effectiveInstallFee = equipment_install_fee;
  let autoCageLabor = null;
  if (!(effectiveInstallFee > 0) && components.cage_install && cimarron_items?.length) {
    const cageProducts = cimarron_items
      .map(ci => ({ ci, product: cimarron.find(p => p.sku === ci.sku) }))
      .filter(({ product }) => product && /Batting Cage/i.test(product.category) && product.length);
    if (cageProducts.length) {
      const maxLen = Math.max(...cageProducts.map(({ product }) => product.length));
      const isHd = cageProducts.some(({ product }) =>
        product.sku && product.sku.includes('CF1.5') && !product.sku.endsWith('SP'));
      const tier = components.cage_install.tiers.find(t => maxLen <= t.max_length_ft)
        || components.cage_install.tiers[components.cage_install.tiers.length - 1];
      // Width multiplier from cage-labor matrix: single 1.0, double-wide 1.6,
      // triple+ 2.2. Internal estimator uses cage-combo qty as the proxy for
      // installation width (qty 2 = double-wide tunnel, 3+ = triple+).
      const cageQtyTotal = cageProducts.reduce((s, { ci }) => s + (Number(ci.qty) || 0), 0);
      const widthMult = cageQtyTotal >= 3 ? 2.2 : cageQtyTotal === 2 ? 1.6 : 1.0;
      const widthLabel = cageQtyTotal >= 3 ? 'triple+ wide' : cageQtyTotal === 2 ? 'double-wide' : 'single';
      const baseDays = tier.days + (isHd ? 1 : 0);
      const baseLabor = baseDays * components.cage_install.day_rate;
      const totalLabor = Math.round(baseLabor * widthMult);
      autoCageLabor = { tier, baseDays, baseLabor, widthMult, widthLabel, totalLabor, isHd };
      effectiveInstallFee = totalLabor;
    }
  }
  if (effectiveInstallFee > 0) {
    const label = autoCageLabor
      ? `Cage assembly labor — ${autoCageLabor.tier.label}${autoCageLabor.widthMult > 1 ? `, ${autoCageLabor.widthLabel}` : ''} (${autoCageLabor.baseDays} days × $${components.cage_install.day_rate}/day${autoCageLabor.isHd ? ' incl. concrete-set HD' : ''}${autoCageLabor.widthMult > 1 ? ` × ${autoCageLabor.widthMult} width` : ''}, auto-added)`
      : 'Equipment installation labor';
    lines.push({
      key: 'equipment_install',
      label,
      qty: 1,
      unit: '',
      unit_cost: effectiveInstallFee,
      cost: effectiveInstallFee,
      auto_cage_labor: !!autoCageLabor,
    });
  }

  const nails = components.nails;
  const nailBoxes = (no_turf || total_sf <= 0) ? 0 : Math.ceil(total_sf / nails.sf_per_box);
  if (nailBoxes > 0) {
    lines.push({
      key: 'nails',
      label: nails.label,
      qty: nailBoxes,
      unit: 'box',
      unit_cost: nails.cost_per_box,
      cost: nailBoxes * nails.cost_per_box,
    });
  }

  lines.push({
    key: 'cleanup',
    label: components.cleanup.label,
    qty: 1,
    unit: '',
    unit_cost: 0,
    cost: 0,
    included: true,
  });

  if (other_costs_pct > 0) {
    const directCost = lines.reduce((s, l) => s + (l.cost || 0), 0);
    const otherCost = directCost * (other_costs_pct / 100);
    lines.push({
      key: 'other_costs',
      label: `Other costs (equipment, dump fees, fuel, contingency)`,
      qty: other_costs_pct,
      unit: '%',
      unit_cost: otherCost,
      cost: otherCost,
    });
  }

  // Cimarron equipment — bills at dealer cost; standard project margin applies
  for (const ci of cimarron_items) {
    const qty = Number(ci.qty) || 0;
    if (qty <= 0) continue;
    const product = cimarron.find(p => p.sku === ci.sku);
    if (!product) continue;
    lines.push({
      key: `cimarron_${product.sku}`,
      label: `Cimarron · ${product.name}`,
      qty,
      unit: 'EA',
      unit_cost: product.wholesale2024,
      cost: qty * product.wholesale2024,
      cimarron: true,
      map: product.map2024,
    });
  }

  // Plants — material billed at 2× wholesale (markup_multiplier), per-pot
  // install labor $40–$80 by size tier, and a 5% warranty + delivery
  // reserve on the marked-up material total. Standard project margin_pct
  // wraps the whole basis after.
  const plantCfg = components.plant_install || {};
  const plantMarkup = plantCfg.markup_multiplier ?? 1.0;
  const laborTable = plantCfg.install_labor_per_size || {};
  let plantMaterialMarkedUp = 0;
  for (const pi of plant_items) {
    const qty = Number(pi.qty) || 0;
    if (qty <= 0) continue;
    const plant = plants.find(p => p.id === pi.id);
    if (!plant) continue;
    const unitMaterial = plant.price * plantMarkup;
    const lineMaterial = qty * unitMaterial;
    plantMaterialMarkedUp += lineMaterial;
    lines.push({
      key: `plant_${plant.id}`,
      label: `Plant · ${plant.description} (${plantMarkup}× wholesale)`,
      qty,
      unit: 'EA',
      unit_cost: unitMaterial,
      cost: lineMaterial,
      plant: true,
      size_tier: plant.size_tier,
      wholesale_unit: plant.price,
    });
    const laborPer = laborTable[plant.size_tier] ?? laborTable.unknown ?? 0;
    if (laborPer > 0) {
      lines.push({
        key: `plant_labor_${plant.id}`,
        label: `Install labor — ${plant.description}`,
        qty,
        unit: 'EA',
        unit_cost: laborPer,
        cost: qty * laborPer,
        plant_labor: true,
      });
    }
  }
  // 5% warranty + delivery reserve on marked-up plant material
  const warrantyPct = plantCfg.warranty_reserve_pct || 0;
  if (plantMaterialMarkedUp > 0 && warrantyPct > 0) {
    const reserve = plantMaterialMarkedUp * (warrantyPct / 100);
    lines.push({
      key: 'plant_warranty_reserve',
      label: `Delivery + 60-day plant replacement guarantee (${warrantyPct}% of plant material)`,
      qty: warrantyPct,
      unit: '%',
      unit_cost: reserve,
      cost: reserve,
      plant_reserve: true,
    });
  }

  // Rocks / stone / mulch — material billed at 1.75× wholesale
  // (markup_multiplier), per-unit spread labor by unit (ton / yard / piece),
  // plus a 5% delivery + breakage reserve on marked-up rock material.
  // Slabs and pool-coping pieces return 0 labor (custom_quote_units) because
  // hand-set masonry doesn't fit a flat-rate table.
  const rockCfg = components.rock_install || {};
  const rockMarkup = rockCfg.markup_multiplier ?? 1.0;
  const rockLaborTable = rockCfg.spread_labor_per_unit || {};
  const rockCustomUnits = new Set(rockCfg.custom_quote_units || []);
  let rockMaterialMarkedUp = 0;
  for (const ri of rock_items) {
    const qty = Number(ri.qty) || 0;
    if (qty <= 0) continue;
    const rock = rocks.find(r => r.id === ri.id);
    if (!rock) continue;
    const unit = rock.unit || 'ton';
    const unitMaterial = rock.price * rockMarkup;
    const lineMaterial = qty * unitMaterial;
    rockMaterialMarkedUp += lineMaterial;
    lines.push({
      key: `rock_${rock.id}`,
      label: `${rock.category?.split('/')[0] || 'Rock'} · ${rock.description} (${rockMarkup}× wholesale)`,
      qty,
      unit,
      unit_cost: unitMaterial,
      cost: lineMaterial,
      rock: true,
      wholesale_unit: rock.price,
    });
    const laborPer = rockCustomUnits.has(unit) ? 0 : (rockLaborTable[unit] ?? 0);
    if (laborPer > 0) {
      lines.push({
        key: `rock_labor_${rock.id}`,
        label: `Spread labor — ${rock.description} ($${laborPer}/${unit})`,
        qty,
        unit,
        unit_cost: laborPer,
        cost: qty * laborPer,
        rock_labor: true,
      });
    }
  }
  const rockReservePct = rockCfg.warranty_reserve_pct || 0;
  if (rockMaterialMarkedUp > 0 && rockReservePct > 0) {
    const reserve = rockMaterialMarkedUp * (rockReservePct / 100);
    lines.push({
      key: 'rock_delivery_reserve',
      label: `Delivery + breakage reserve (${rockReservePct}% of rock material)`,
      qty: rockReservePct,
      unit: '%',
      unit_cost: reserve,
      cost: reserve,
      rock_reserve: true,
    });
  }

  // Tree & stump removal — subcontracted service, entered as sub cost.
  // Project margin applies on top (same as all other cost lines).
  // Each item: { description, sub_cost, qty }
  for (const ti of tree_removal_items) {
    const qty = Number(ti.qty) || 1;
    const subCost = Number(ti.sub_cost) || 0;
    if (subCost <= 0) continue;
    lines.push({
      key: `tree_removal_${ti.description?.replace(/\W+/g, '_') || lines.length}`,
      label: `Tree & stump removal — ${ti.description || 'tree/stump'}`,
      qty,
      unit: 'EA',
      unit_cost: subCost,
      cost: qty * subCost,
      tree_removal: true,
    });
  }

  for (const item of custom_line_items) {
    lines.push({
      key: `custom_${item.label}`,
      label: item.label,
      qty: item.qty ?? 1,
      unit: item.unit ?? '',
      unit_cost: item.unit_cost ?? item.cost ?? 0,
      cost: (item.qty ?? 1) * (item.unit_cost ?? item.cost ?? 0),
      custom: true,
    });
  }

  const totalCost = lines.reduce((s, l) => s + (l.cost || 0), 0);
  const margin = clamp(margin_pct, 0, 95) / 100;
  const sellPrice = totalCost / (1 - margin);
  const cardFee = apply_card_fee ? sellPrice * (card_fee_pct / 100) : 0;
  const finalPrice = sellPrice + cardFee;
  const profit = sellPrice - totalCost;
  const pricePerSf = total_sf > 0 ? finalPrice / total_sf : 0;

  const tiers = {
    good: priceAtMargin(totalCost, 25),
    better: priceAtMargin(totalCost, 30),
    best: priceAtMargin(totalCost, 35),
  };

  // Size-tiered floor + benchmark from real won-estimate data
  const sizeFloor = pickTier(components.settings?.sf_floor_tiers, total_sf);
  const sizeBenchmark = pickTier(components.settings?.size_benchmarks, total_sf);
  const typeFloor = components.settings?.type_floors?.[project_type];

  return {
    input,
    perimeter_lf: round(perimeter, 2),
    flex_base_yards: round(baseYards, 2),
    lines,
    totals: {
      cost: round(totalCost, 2),
      margin_pct,
      sell_price: round(sellPrice, 2),
      card_fee: round(cardFee, 2),
      final_price: round(finalPrice, 2),
      profit: round(profit, 2),
      price_per_sf: round(pricePerSf, 2),
    },
    tiers,
    benchmark: sizeBenchmark ? {
      median_psf: sizeBenchmark.median_psf,
      label: sizeBenchmark.label,
      floor: sizeFloor?.floor,
      type_floor: typeFloor,
      project_type,
    } : null,
    warnings: buildWarnings({ total_sf, pricePerSf, components, labor_floored, computedLabor, minDay, haveDims, multiZone, supply_only, sizeFloor, typeFloor, project_type, lines, margin }),
  };
}

function pickTier(tiers, sf) {
  if (!tiers || !Array.isArray(tiers)) return null;
  return tiers.find(t => sf < t.max_sf) || tiers[tiers.length - 1];
}

function componentLine(key, comp, qty, unit) {
  const unitCost = comp.cost_per_sf ?? comp.cost_per_lf ?? 0;
  return { key, label: comp.label, qty, unit, unit_cost: unitCost, cost: qty * unitCost };
}

function priceAtMargin(cost, marginPct) {
  const m = clamp(marginPct, 0, 95) / 100;
  return round(cost / (1 - m), 2);
}

function buildWarnings({ total_sf, pricePerSf, components, labor_floored, computedLabor, minDay, haveDims, multiZone, supply_only, sizeFloor, typeFloor, project_type, lines, margin }) {
  const w = [];
  if (total_sf > 50000) w.push('Large project (>50,000 SF) — recommend manual review.');
  if (total_sf > 0 && total_sf < 100) w.push('Very small project (<100 SF) — verify minimums.');

  // Skip price-floor warnings on supply-only jobs (they naturally land below the install-job benchmarks)
  if (!supply_only && pricePerSf > 0) {
    if (sizeFloor && pricePerSf < sizeFloor.floor) {
      w.push(`Below size-tier floor: $${pricePerSf.toFixed(2)}/SF for ${sizeFloor.label} jobs (floor $${sizeFloor.floor.toFixed(2)}/SF based on closed-won data).`);
    }
    if (typeFloor && pricePerSf < typeFloor) {
      w.push(`${project_type} jobs should bid ≥ $${typeFloor.toFixed(2)}/SF. This estimate: $${pricePerSf.toFixed(2)}/SF — raise margin or scope review.`);
    }
  }
  if (labor_floored) {
    w.push(`Min day-rate triggered: computed labor $${computedLabor.toFixed(0)} below $${minDay} floor.`);
  }
  if (!haveDims && total_sf > 0) {
    w.push('No yard dimensions provided — turf waste & seam tape are estimates. Add dims for accurate quantities.');
  }
  if (multiZone) {
    w.push('Total SF exceeds narrow×long bounding box — treating as multi-zone job. Dims cover only one zone; turf material uses flat overage on actual total SF.');
  }
  // Cage-labor safety net: if any batting-cage Cimarron line is on the estimate
  // but no equipment_install / cage-assembly labor line exists, flag it.
  if (lines) {
    const hasCageProduct = lines.some(l =>
      l.cimarron && typeof l.label === 'string' && /Batting Cage/i.test(l.label));
    const hasCageLabor = lines.some(l => l.key === 'equipment_install' && (l.cost || 0) > 0);
    if (hasCageProduct && !hasCageLabor) {
      w.push('Batting cage hardware is on the estimate but no cage assembly labor is billed. Add an Equipment install fee or use Quick Cage Setup.');
    }
  }
  // MAP-floor check: if standard margin pushes any Cimarron line below its MAP, warn
  if (lines && margin != null && margin < 1) {
    const violators = [];
    for (const l of lines) {
      if (!l.cimarron || !l.map) continue;
      const perUnitSell = l.unit_cost / (1 - margin);
      if (perUnitSell < l.map - 0.01) {
        violators.push({
          name: l.label.replace(/^Cimarron · /, ''),
          customer: round(perUnitSell, 2),
          map: l.map,
          shortfall: round(l.map - perUnitSell, 2),
        });
      }
    }
    if (violators.length === 1) {
      const v = violators[0];
      w.push(`MAP violation: "${v.name}" would sell at $${v.customer} but Cimarron MAP is $${v.map} (short $${v.shortfall}). Raise margin or override.`);
    } else if (violators.length > 1) {
      w.push(`MAP violations on ${violators.length} Cimarron items — raise margin or override pricing. Lowest: "${violators[0].name}" $${violators[0].customer} vs MAP $${violators[0].map}.`);
    }
  }
  return w;
}

function round(n, dp = 2) { const p = 10 ** dp; return Math.round(n * p) / p; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
