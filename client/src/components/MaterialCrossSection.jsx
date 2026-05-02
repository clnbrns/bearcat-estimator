import React from 'react';

// SVG cross-section showing the install layers from bottom to top.
// Adapts to: shock pad (playground), antimicrobial infill (pet), supply-only,
// no-turf, putting green. Visual changes communicate spec at a glance.
export default function MaterialCrossSection({ estimate, intake }) {
  if (!estimate || !intake) return null;
  const noTurf = estimate.input?.no_turf;
  if (noTurf) return null;  // No turf = no cross-section

  const lines = estimate.lines || [];
  const has = (key) => lines.some(l => l.key === key || l.key?.startsWith(key));
  const hasShockPad = has('shock_pad');
  const hasAntimicrobial = has('antimicrobial_infill_upcharge');
  const hasInfill = has('silica_sand_infill') || hasAntimicrobial;
  const hasWeedBarrier = has('weed_barrier');
  const hasBase = has('flex_base');
  const hasSeam = has('seam_tape');
  const product = estimate.input?.product_name || 'Turf';
  const baseDepth = estimate.input?.flex_base_depth_in || 3;

  // Layer definitions, top to bottom (reversed for SVG y-axis = increasing down)
  const layers = [];
  if (hasInfill) layers.push({
    name: hasAntimicrobial ? 'Envirofill (antimicrobial)' : 'Silica sand infill',
    height: 14, fill: '#c2d4c8', stroke: '#8ab898', pattern: 'dots',
    detail: hasAntimicrobial ? '~$0.23/SF · pet-safe' : '~2 lbs/SF',
  });
  layers.push({
    name: `${product} turf`,
    height: 28, fill: '#1b3d24', stroke: '#0d2412', pattern: 'turf',
    detail: 'Tufted face fiber + perforated backing',
  });
  if (hasSeam) layers.push({
    name: 'Seam tape + glue',
    height: 6, fill: '#c85c18', stroke: '#a04a13',
    detail: 'Per LF of seams, Turf Claw glue',
  });
  if (hasShockPad) layers.push({
    name: 'Shock pad 8mm',
    height: 16, fill: '#8ab898', stroke: '#6a9477',
    detail: 'Playground fall-rated underlayment',
  });
  if (hasWeedBarrier) layers.push({
    name: '15-year weed barrier',
    height: 4, fill: '#5a4a3a', stroke: '#3a2f24',
    detail: 'Commercial-grade fabric',
  });
  if (hasBase) layers.push({
    name: `Crushed concrete sub-base (${baseDepth}")`,
    height: 38, fill: '#a8a194', stroke: '#7a7468', pattern: 'gravel',
    detail: `${estimate.flex_base_yards} CY, compacted`,
  });
  layers.push({
    name: 'Compacted earth (existing grade)',
    height: 24, fill: '#6b5340', stroke: '#3a2c20',
    detail: 'Laser-graded for drainage slope',
  });

  // Layout
  const W = 480;
  const labelX = 280;
  const layerX = 30;
  const layerW = 240;
  const totalH = layers.reduce((s, l) => s + l.height, 0) + 40;

  let yCursor = 20;
  const layerRects = layers.map((l, i) => {
    const y = yCursor;
    yCursor += l.height;
    return { ...l, y };
  });

  return (
    <section className="bg-white border border-sageMuted rounded-lg p-6 mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-semibold text-hunter">Install cross-section</h3>
        <span className="text-xs text-hunter/60">As specified · scale approximate</span>
      </div>
      <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full h-auto">
        <defs>
          <pattern id="dots" patternUnits="userSpaceOnUse" width="6" height="6">
            <circle cx="3" cy="3" r="1" fill="#7a8b7e" />
          </pattern>
          <pattern id="turf" patternUnits="userSpaceOnUse" width="4" height="6">
            <rect width="4" height="6" fill="#1b3d24" />
            <line x1="2" y1="6" x2="2" y2="2" stroke="#3d6b48" strokeWidth="0.5" />
            <line x1="0" y1="6" x2="0" y2="3" stroke="#2d5235" strokeWidth="0.5" />
          </pattern>
          <pattern id="gravel" patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="#a8a194" />
            <circle cx="2" cy="2" r="1.2" fill="#7a7468" />
            <circle cx="6" cy="5" r="1" fill="#8a8378" />
            <circle cx="3" cy="6" r="0.8" fill="#6a6458" />
          </pattern>
        </defs>

        {layerRects.map((l, i) => (
          <g key={i}>
            <rect
              x={layerX} y={l.y} width={layerW} height={l.height}
              fill={l.pattern ? `url(#${l.pattern})` : l.fill}
              stroke={l.stroke}
              strokeWidth="0.8"
            />
            {/* Connector line from layer to label */}
            <line
              x1={layerX + layerW} y1={l.y + l.height / 2}
              x2={labelX - 8} y2={l.y + l.height / 2}
              stroke="#8ab898" strokeWidth="0.5" strokeDasharray="2 2"
            />
            {/* Layer name */}
            <text
              x={labelX} y={l.y + l.height / 2 - 1}
              fontSize="11" fontWeight="600" fill="#1b3d24"
              dominantBaseline="middle"
            >
              {l.name}
            </text>
            {/* Detail line under name */}
            <text
              x={labelX} y={l.y + l.height / 2 + 11}
              fontSize="9" fill="#1b3d24" opacity="0.6"
              dominantBaseline="middle"
            >
              {l.detail}
            </text>
          </g>
        ))}

        {/* Ground line at bottom */}
        <line
          x1={layerX - 5} y1={yCursor} x2={layerX + layerW + 5} y2={yCursor}
          stroke="#1b3d24" strokeWidth="2"
        />
      </svg>
      <p className="text-xs text-hunter/50 mt-3 italic">
        Layers reflect what's billed in this estimate. Changes to spec automatically update the diagram.
      </p>
    </section>
  );
}
