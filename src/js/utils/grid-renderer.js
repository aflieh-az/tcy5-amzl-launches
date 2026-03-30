/**
 * grid-renderer.js — HTML table grid renderer for TCY5 floor layout
 *
 * Renders the floor layout as an HTML table matching the Excel layout tab:
 * 16 rows × 21 chutes, each cell colored by wave/filter category.
 * New AMZL assignments are highlighted with a red border.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { RESERVED_LANES } from '../data/tcy5-config.js';

/**
 * Wave/filter color palette matching the Excel layout tab.
 * Categories are derived from the stacking filter pattern.
 */
const WAVE_COLORS = {
  'CYCLE':    { bg: '#1B4F9B', text: '#fff', label: 'Cycle' },
  'SMALL':    { bg: '#2E8B57', text: '#fff', label: 'Smalls' },
  'LARGE':    { bg: '#D4A017', text: '#000', label: 'Large' },
  'MIXED':    { bg: '#E07020', text: '#fff', label: 'Mixed' },
  'KSMF':     { bg: '#7B2D8E', text: '#fff', label: 'KSMF' },
  'USPS':     { bg: '#0D3B66', text: '#fff', label: 'USPS' },
  'DYNAMIC':  { bg: '#C8D8EB', text: '#444', label: 'Dynamic' },
  'PSOLVE':   { bg: '#8E8E8E', text: '#fff', label: 'P-Solve' },
  'RECIRC':   { bg: '#5C5C5C', text: '#fff', label: 'Recirc' },
  'FF':       { bg: '#A0522D', text: '#fff', label: 'FF' },
  'AMZL_NEW': { bg: '#D62828', text: '#fff', label: 'New AMZL' },
  'FPD':      { bg: '#17A558', text: '#fff', label: 'Reserved (FPD)' },
  'EMPTY':    { bg: '#ECECEC', text: '#999', label: 'Empty' },
};

/**
 * Classify a chute's stacking filter into a wave color category.
 * @param {string} filter — stacking filter from the layout sheet
 * @returns {string} category key from WAVE_COLORS
 */
export function classifyFilter(filter) {
  if (!filter) return 'EMPTY';
  const f = filter.toUpperCase();
  if (f === 'DYNAMIC') return 'DYNAMIC';
  if (f === 'PSOLVE') return 'PSOLVE';
  if (f === 'RECIRC') return 'RECIRC';
  if (f.includes('KSMF')) return 'KSMF';
  if (f.includes('USPS') || f.includes('LPC-')) return 'USPS';
  if (f.startsWith('FF') || f.startsWith('USC') || f.startsWith('USA') || f.startsWith('UST')) return 'FF';
  if (f.includes('CYCLE1-SMALL') || f.includes('CYCLE1-NONMACH')) return 'CYCLE';
  if (f.includes('CYCLE1')) return 'CYCLE';
  if (f.includes('-SMALL')) return 'SMALL';
  if (f.includes('-LARGE')) return 'LARGE';
  // Multi-zip or plain zip codes (no SMALL/LARGE suffix) = mixed
  if (/^\d{5}/.test(f)) return 'MIXED';
  return 'MIXED';
}

/**
 * Render the full TCY5 floor grid as an HTML table matching the Excel layout.
 *
 * Layout: 16 rows × 21 columns (lanes). Lanes are columns, not rows.
 * The last 2 digits of each chute ID indicate the lane number.
 * First row is a lane header (Lane 1 .. Lane 21).
 * Each subsequent row is a row group from the layout sheet.
 * Cells are colored by wave category (derived from stacking filter).
 * New AMZL assignments get a red highlight border.
 * Reserved lanes (e.g. lane 21 for FPD) show green for empty slots.
 * Includes a color legend and an explanation panel for new assignments.
 *
 * @param {Array<object>} geometry — LaneGeometry[] from parseLaneGeometry
 * @param {Array<object>} assignments — ChuteAssignment[] from the assignment engine
 * @param {Array<object>} preserved — PreservedAssignment[] from tcy5-config
 * @returns {string} complete HTML markup
 */
export function renderFloorGrid(geometry, assignments, preserved) {
  if (!geometry || geometry.length === 0) {
    return '<p style="color:#666;padding:16px;">No layout geometry available</p>';
  }

  // Build lookup maps
  const assignmentMap = new Map();
  for (const a of assignments || []) {
    assignmentMap.set(a.chuteId, a);
  }
  // Collect new AMZL assignment info for the explanation panel
  const newAmzlByLane = new Map();

  let html = '';

  // ── Color Legend ──────────────────────────────────────────
  html += '<div style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  html += '<span style="font-weight:bold;margin-right:8px;">Legend:</span>';
  for (const [key, val] of Object.entries(WAVE_COLORS)) {
    if (key === 'EMPTY') continue;
    const border = key === 'AMZL_NEW' ? 'border:3px solid #D62828;' : 'border:1px solid #ccc;';
    html += `<span style="display:inline-flex;align-items:center;gap:4px;">`;
    html += `<span style="width:16px;height:16px;${border}background:${val.bg};border-radius:2px;display:inline-block;"></span>`;
    html += `<span style="font-size:0.85em;">${val.label}</span></span>`;
  }
  html += '</div>';

  // ── Grid Table ────────────────────────────────────────────
  // Determine lane numbers from chute IDs (last 2 digits) using the first row
  const firstRowDetails = geometry[0].chuteDetails || [];
  const laneNumbers = firstRowDetails.map((d, i) => {
    const parsed = parseInt(String(d.chuteId).slice(-2), 10);
    return !isNaN(parsed) ? parsed : i + 1;
  });
  const maxCols = laneNumbers.length;

  html += '<div style="width:100%;">';
  html += '<table style="border-collapse:collapse;font-size:11px;white-space:nowrap;width:100%;table-layout:fixed;">';

  // Lane header row (lanes = columns)
  html += '<tr>';
  html += '<th style="padding:2px 4px;background:#222;color:#fff;text-align:center;border:1px solid #555;"></th>';
  for (let col = 0; col < maxCols; col++) {
    const laneNum = laneNumbers[col];
    const isReserved = RESERVED_LANES.includes(laneNum);
    const bgColor = '#333';
    const label = isReserved ? `Lane ${laneNum}<br><span style="font-size:0.75em;">Reserved (FPD)</span>` : `Lane ${laneNum}`;
    html += `<th style="padding:2px 4px;background:${bgColor};color:#fff;text-align:center;border:1px solid #555;font-size:10px;">${label}</th>`;
  }
  html += '</tr>';

  for (const row of geometry) {
    const details = row.chuteDetails || [];

    // Row label on the left
    html += '<tr>';
    html += `<td style="padding:2px 4px;font-weight:bold;background:#333;color:#fff;text-align:center;border:1px solid #555;">`;
    html += `Row ${row.lane}`;
    if (row.waveGroup) html += `<br><span style="font-size:0.8em;opacity:0.8;">W${row.waveGroup}</span>`;
    html += '</td>';

    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      const colLane = parseInt(String(d.chuteId).slice(-2), 10) || (i + 1); // lane from last 2 digits of chute ID
      const aEntry = assignmentMap.get(d.chuteId);
      const isNewAmzl = !!aEntry;

      // Determine cell color
      let color;
      if (isNewAmzl) {
        color = WAVE_COLORS.AMZL_NEW;
        // Track for explanation — key by column-based lane number
        if (!newAmzlByLane.has(colLane)) newAmzlByLane.set(colLane, []);
        newAmzlByLane.get(colLane).push({
          chuteId: d.chuteId,
          row: row.lane,
          route: aEntry.routeCode,
          adv: aEntry.assignedAdv,
          prevFilter: d.filter,
          prevAdv: d.adv,
        });
      } else {
        // Normal color based on wave category
        const isReservedLane = RESERVED_LANES.includes(colLane);
        const cat = classifyFilter(d.filter);
        if (isReservedLane && (cat === 'EMPTY' || cat === 'DYNAMIC')) {
          color = WAVE_COLORS.FPD;
        } else {
          color = WAVE_COLORS[cat] || WAVE_COLORS.EMPTY;
        }
      }

      const borderStyle = isNewAmzl
        ? 'border:3px solid #D62828;'
        : 'border:1px solid #bbb;';

      const advDisplay = isNewAmzl
        ? Math.round(aEntry.assignedAdv)
        : (d.adv != null && !isNaN(d.adv) ? Math.round(d.adv) : '');

      const isFpdReserved = color === WAVE_COLORS.FPD;
      const filterDisplay = isNewAmzl ? aEntry.routeCode.replace(/->/g, '-') : isFpdReserved ? 'FPD' : d.filter;

      html += `<td style="${borderStyle}background:${color.bg};color:${color.text};padding:2px 3px;text-align:center;vertical-align:top;overflow:hidden;">`;
      html += `<div style="font-weight:bold;font-size:10px;">${escapeHtml(d.chuteId)}</div>`;
      html += `<div style="font-size:9px;opacity:0.9;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(filterDisplay)}">${escapeHtml(truncate(filterDisplay, 12))}</div>`;
      if (advDisplay !== '' && advDisplay != null) {
        html += `<div style="font-size:9px;opacity:0.8;">${advDisplay}</div>`;
      }
      html += '</td>';
    }

    html += '</tr>';
  }

  html += '</table></div>';

  // ── Allocation Summary ──────────────────────────────────────
  // Always show the summary — it explains the color coding and methodology
  html += '<div style="margin-top:24px;padding:20px;background:#F8F9FA;border:1px solid #DEE2E6;border-radius:8px;">';
  html += '<h3 style="margin:0 0 14px 0;color:#333;font-size:1.15em;">Floor Layout Allocation Summary</h3>';

  // Color coding explanation
  html += '<div style="margin-bottom:16px;">';
  html += '<h4 style="margin:0 0 8px 0;color:#555;font-size:0.95em;">Color Coding</h4>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:0.88em;">';
  html += '<thead><tr style="background:#E9ECEF;">';
  html += '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #CCC;">Color</th>';
  html += '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #CCC;">Category</th>';
  html += '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #CCC;">Meaning</th>';
  html += '</tr></thead><tbody>';
  const colorDescriptions = {
    'CYCLE':    'Core sort cycle infrastructure — routes packages through the AR sort loop. Never reassigned.',
    'SMALL':    'Smalls-specific chutes — handles small-item volume for zip-code or program routes.',
    'LARGE':    'Large-item chutes — handles oversized or heavy packages for specific routes.',
    'MIXED':    'Mixed volume chutes — handles both smalls and large items, typically zip-code routes.',
    'KSMF':     'KSMF program chutes — dedicated to the KSMF fulfillment program. Protected from reassignment.',
    'USPS':     'USPS / LPC chutes — dedicated to USPS mail and LPC programs. Protected from reassignment.',
    'DYNAMIC':  'Dynamic / unassigned slots — no fixed route. Often near induction points, so not ideal for high-volume new routes (congestion risk).',
    'PSOLVE':   'Problem-solve overflow — handles exception packages. Low priority, easily relocated.',
    'RECIRC':   'Recirculation chutes — core AR infrastructure for packages that miss their sort window. Never reassigned.',
    'FF':       'Fulfillment / specialty chutes (FF, USC, USA, UST) — dedicated programs, protected from reassignment.',
    'AMZL_NEW': 'New AMZL lane launch assignments — chutes reassigned to the 3 new AMZL routes (DCK6, DFA5, DSR2).',
    'FPD':      'Reserved for FPD — empty slots on lane 21 held for the FPD program.',
  };
  for (const [key, desc] of Object.entries(colorDescriptions)) {
    const c = WAVE_COLORS[key];
    html += '<tr style="border-bottom:1px solid #E9ECEF;">';
    html += `<td style="padding:4px 8px;"><span style="display:inline-block;width:14px;height:14px;background:${c.bg};border:1px solid #999;border-radius:2px;vertical-align:middle;"></span></td>`;
    html += `<td style="padding:4px 8px;font-weight:600;">${c.label}</td>`;
    html += `<td style="padding:4px 8px;color:#555;">${desc}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  // Allocation methodology
  html += '<div style="margin-bottom:16px;">';
  html += '<h4 style="margin:0 0 8px 0;color:#555;font-size:0.95em;">Allocation Methodology</h4>';
  html += '<div style="font-size:0.88em;color:#555;line-height:1.6;">';
  html += '<p style="margin:0 0 6px 0;">Assignments follow Thomas Peterson\'s AR site lane launch methodology:</p>';
  html += '<ol style="margin:0 0 6px 0;padding-left:20px;">';
  html += '<li><strong>Displacement scoring</strong> — Low-ADV DDU D2C chutes (&lt;200 ADV) are preferred over dynamic/empty slots. Dynamic slots near induction cause drive congestion, so the engine displaces low-volume DDU chutes in better floor positions first. Core infrastructure (cycle, recirc, KSMF, USPS, FF) is never swapped.</li>';
  html += '<li><strong>Lane constraints</strong> — Only lanes 6, 7, 12, 19, and 20 are eligible for new AMZL routes. Lane 6 is the primary target. Lane 21 is reserved for FPD. Row 9 is psolve-only and excluded.</li>';
  html += '<li><strong>Drive congestion optimization</strong> — High-volume routes (e.g. DSR2 at 3033 ADV) are placed in middle rows (closer to row 8-9) where AR drive paths are shortest. Low-volume routes (e.g. DCK6 at 1987 ADV) go on outer rows to spread traffic.</li>';
  html += '<li><strong>Frugal chute usage</strong> — Each chute carries up to 1800 ADV before splitting. The engine uses as few chutes as possible to minimize floor disruption.</li>';
  html += '<li><strong>Volume routing</strong> — D2C chutes (resource label ends in -FLAT) handle smalls volume. Multi chutes handle large/mixed volume. Multi chutes absorb smalls overflow when no D2C slots remain.</li>';
  html += '</ol></div></div>';

  // New AMZL assignment details (if any)
  if (newAmzlByLane.size > 0) {
    html += '<div>';
    html += '<h4 style="margin:0 0 8px 0;color:#D62828;font-size:0.95em;">New AMZL Assignments Detail</h4>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.88em;">';
    html += '<thead><tr style="background:#D62828;color:#fff;">';
    html += '<th style="padding:6px 8px;text-align:left;">Lane (Col)</th>';
    html += '<th style="padding:6px 8px;text-align:left;">Chute</th>';
    html += '<th style="padding:6px 8px;text-align:left;">Row</th>';
    html += '<th style="padding:6px 8px;text-align:left;">New Route</th>';
    html += '<th style="padding:6px 8px;text-align:right;">ADV</th>';
    html += '<th style="padding:6px 8px;text-align:left;">Was</th>';
    html += '</tr></thead><tbody>';

    const sortedLanes = [...newAmzlByLane.keys()].sort((a, b) => a - b);
    for (const laneNum of sortedLanes) {
      const items = newAmzlByLane.get(laneNum);
      for (const item of items) {
        html += '<tr style="border-bottom:1px solid #ddd;">';
        html += `<td style="padding:4px 8px;">${laneNum}</td>`;
        html += `<td style="padding:4px 8px;font-weight:bold;">${escapeHtml(item.chuteId)}</td>`;
        html += `<td style="padding:4px 8px;">Row ${item.row}</td>`;
        html += `<td style="padding:4px 8px;">${escapeHtml(item.route.replace(/->/g, '-'))}</td>`;
        html += `<td style="padding:4px 8px;text-align:right;">${Math.round(item.adv)}</td>`;
        html += `<td style="padding:4px 8px;">${escapeHtml(item.prevFilter || '—')}</td>`;
        html += '</tr>';
      }
    }

    html += '</tbody></table></div>';
  }

  html += '</div>'; // close allocation summary container

  return html;
}

/**
 * Truncate a string to maxLen characters, adding "…" if truncated.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
