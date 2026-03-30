/**
 * build-static.js — Pre-process TCY5_Data.xlsx and generate a standalone HTML
 * with all pipeline results baked in. No file upload needed.
 *
 * Usage: node build-static.js
 * Output: dist/index.html (self-contained, ready to share)
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import XLSX from 'xlsx';

// Make XLSX available as a global so parseLaneGeometry works in Node.
globalThis.XLSX = XLSX;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Import pipeline modules ─────────────────────────────────
import { parseSpotSheet, validateSpotData } from './src/js/data/spot-parser.js';
import { parseSortationRules } from './src/js/data/stem-parser.js';
import {
  parseLaneGeometry,
  ALLOWED_AMZL_LANES,
  EXCLUDED_CHUTES_LANE_5_6,
  MAX_CHUTE_ADV,
  PRESERVED_ASSIGNMENTS,
  NEW_ROUTES,
} from './src/js/data/tcy5-config.js';
import { generateAssignments, splitOverCapacity, classifyChute } from './src/js/utils/chute-assign.js';

/** Resolve resourceType to D2C or Multi — falls back to resource label then chute ID for -FLAT check. */
function resolveType(chuteType, chuteId, resourceLabel) {
  if (chuteType === 'D2C' || chuteType === 'Multi') return chuteType;
  return classifyChute(resourceLabel || chuteId);
}
import { validateChuteCapacity } from './src/js/utils/volume-validator.js';
import { generateStemFile, validateStemFile } from './src/js/utils/stem-generator.js';
import { renderFloorGrid } from './src/js/utils/grid-renderer.js';

// ── Read XLSX ───────────────────────────────────────────────
const xlsxPath = join(__dirname, 'TCY5_Data.xlsx');
console.log(`Reading ${xlsxPath}...`);
const workbook = XLSX.readFile(xlsxPath);

const layoutSheetName = workbook.SheetNames.includes('layout_view') ? 'layout_view'
  : workbook.SheetNames.includes('layout') ? 'layout' : null;
if (!layoutSheetName) { console.error('Missing layout/layout_view sheet'); process.exit(1); }

const requiredSheets = ['Sortation_Rules', 'SPOT_Data', 'New_AMZ_Lanes'];
const miss = requiredSheets.filter((s) => !workbook.SheetNames.includes(s));
if (miss.length) { console.error(`Missing sheets: ${miss.join(', ')}`); process.exit(1); }

// ── Run pipeline ────────────────────────────────────────────
console.log('Parsing sheets...');
const geometry = parseLaneGeometry(workbook.Sheets[layoutSheetName]);
const spotRoutes = parseSpotSheet(workbook.Sheets['SPOT_Data']);
const newLaneRoutes = parseSpotSheet(workbook.Sheets['New_AMZ_Lanes']);
for (const r of newLaneRoutes) {
  if (r.routeName && (!r.parentStackingFilter || r.parentStackingFilter.includes('PARENT'))) {
    r.parentStackingFilter = r.routeName;
  }
}
const routes = [...spotRoutes, ...newLaneRoutes];
const spotValidation = validateSpotData(routes);
const existingRules = parseSortationRules(workbook.Sheets['Sortation_Rules']);

const chutesPerLane = {};
for (const row of geometry) {
  for (const d of (row.chuteDetails || [])) {
    const laneNum = parseInt(String(d.chuteId).slice(-2), 10);
    if (!isNaN(laneNum)) {
      if (!chutesPerLane[laneNum]) chutesPerLane[laneNum] = [];
      chutesPerLane[laneNum].push(d.chuteId);
    }
  }
}

console.log('Running assignment engine...');
const config = { ALLOWED_AMZL_LANES, EXCLUDED_CHUTES_LANE_5_6, PRESERVED_ASSIGNMENTS, chutesPerLane, geometry };
const rawAssignments = generateAssignments(routes, existingRules, config);
const assignments = splitOverCapacity(rawAssignments, MAX_CHUTE_ADV);
const violations = validateChuteCapacity(assignments);
console.log(`Assigned ${assignments.length} chutes across ${new Set(assignments.map(a => a.routeCode)).size} routes`);

// ── KPI data ────────────────────────────────────────────────
const newLanesAdded = new Set(assignments.map((a) => a.routeCode)).size;
const totalChutesAssigned = assignments.length;
const totalAdv = assignments.reduce((sum, a) => sum + a.assignedAdv, 0);

// ── Helper ──────────────────────────────────────────────────
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Panel 1: SPOT Volume ────────────────────────────────────
function buildSpotVolumeHtml() {
  const REQUIRED_FILTERS = NEW_ROUTES.map((r) => r.parentStackingFilter);
  const routeMap = new Map();
  for (const route of routes) {
    if (REQUIRED_FILTERS.includes(route.parentStackingFilter)) {
      routeMap.set(route.parentStackingFilter, route);
    }
  }
  let h = '';
  if (!spotValidation.valid) {
    h += '<div style="background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;margin-bottom:12px;border-radius:4px;color:#856404;"><strong>⚠ SPOT data is incomplete or invalid.</strong></div>';
  }
  h += '<table style="width:100%;border-collapse:collapse;">';
  h += '<thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Route</th>';
  h += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Total ADV</th>';
  h += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Smalls ADV</th>';
  h += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Large ADV</th>';
  h += '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333;">Status</th></tr></thead><tbody>';
  for (const filter of REQUIRED_FILTERS) {
    const route = routeMap.get(filter);
    const ok = !!route;
    h += `<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd;">${esc(filter)}</td>`;
    h += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${ok ? route.totalAdv : '—'}</td>`;
    h += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${ok ? route.smallsAdv : '—'}</td>`;
    h += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${ok ? route.largeAdv : '—'}</td>`;
    h += `<td style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;color:${ok ? '#28a745' : '#dc3545'};font-weight:bold;">${ok ? '✓' : '✗'}</td></tr>`;
  }
  h += '</tbody></table>';
  return h;
}

// ── Panel 2: SPAO Assignments ───────────────────────────────
function buildSpaoHtml() {
  const violationMap = new Map();
  for (const v of violations) violationMap.set(v.chuteId, v);
  let h = '<table style="width:100%;border-collapse:collapse;">';
  h += '<thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Chute ID</th>';
  h += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Lane</th>';
  h += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Route</th>';
  h += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Chute Type</th>';
  h += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">ADV</th>';
  h += '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333;">Duplicate</th></tr></thead><tbody>';
  for (const a of assignments) {
    const v = violationMap.get(a.chuteId);
    const bg = v ? 'background:#fff3cd;' : '';
    h += `<tr style="${bg}"><td style="padding:6px 8px;border-bottom:1px solid #ddd;">${esc(a.chuteId)}</td>`;
    h += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${a.lane}</td>`;
    h += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${esc(a.routeCode)}</td>`;
    h += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${esc(a.chuteType)}</td>`;
    h += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${Math.round(a.assignedAdv)}`;
    if (v) h += ` <span style="background:#e67e22;color:#fff;padding:1px 6px;border-radius:3px;font-size:0.85em;">+${v.overageAmount}</span>`;
    h += `</td><td style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;">${a.isDuplicate ? 'Yes' : 'No'}</td></tr>`;
  }
  h += '</tbody></table>';
  return h;
}

// ── Panel 3: Floor Layout Grid ──────────────────────────────
const gridHtml = renderFloorGrid(geometry, assignments, PRESERVED_ASSIGNMENTS);

// ── Panel 4: Change Overview ────────────────────────────────
function buildChangeOverviewHtml() {
  // Build old assignments from existing rules
  const oldAssignments = existingRules.map((r) => ({
    chuteId: r.chute, lane: r.lane, routeCode: r.stackingFilter,
    chuteType: r.resourceType, resourceLabel: r.resourceLabel, assignedAdv: 0, volumeCategory: '', isDuplicate: false,
  }));
  const oldMap = new Map();
  for (const a of oldAssignments) oldMap.set(a.chuteId, a);

  const changes = [];
  for (const newA of assignments) {
    const oldA = oldMap.get(newA.chuteId);
    if (oldA) {
      const oldType = resolveType(oldA.chuteType, oldA.chuteId, oldA.resourceLabel);
      const newType = resolveType(newA.chuteType, newA.chuteId, newA.resourceLabel);
      if (oldType !== newType) {
        changes.push({ chuteId: newA.chuteId, lane: newA.lane, changeType: 'PanD2C_Flip',
          description: `Chute ${newA.chuteId}: Changing ${oldType} to ${newType}`, fromState: oldType, toState: newType });
      }
      if (oldA.routeCode !== newA.routeCode) {
        changes.push({ chuteId: newA.chuteId, lane: newA.lane, changeType: '5S_Square',
          description: `Chute ${newA.chuteId} reassigned from ${oldA.routeCode} to ${newA.routeCode}`, fromState: oldA.routeCode, toState: newA.routeCode });
      }
    } else {
      changes.push({ chuteId: newA.chuteId, lane: newA.lane, changeType: '5S_Square',
        description: `New assignment: Chute ${newA.chuteId} → ${newA.routeCode}`, fromState: undefined, toState: newA.routeCode });
    }
  }

  const byLane = new Map();
  for (const item of changes) {
    if (!byLane.has(item.lane)) byLane.set(item.lane, []);
    byLane.get(item.lane).push(item);
  }

  let h = '';
  const sortedLanes = [...ALLOWED_AMZL_LANES].sort((a, b) => a - b);
  for (const lane of sortedLanes) {
    const lc = byLane.get(lane);
    h += `<div style="margin-bottom:16px;"><h3 style="margin:0 0 8px;font-size:1.1em;border-bottom:1px solid #ccc;padding-bottom:4px;">Lane ${lane}</h3>`;
    if (!lc || lc.length === 0) {
      h += `<p style="color:#6c757d;margin:4px 0;">No floor changes needed for Lane ${lane}</p>`;
    } else {
      const flips = lc.filter(c => c.changeType === 'PanD2C_Flip');
      const squares = lc.filter(c => c.changeType === '5S_Square');
      if (flips.length > 0) {
        h += '<h4 style="margin:8px 0 4px;font-size:0.95em;color:#d35400;">PanD2C Flips</h4>';
        h += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><thead><tr>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Chute ID</th>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">From</th>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">To</th>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Description</th></tr></thead><tbody>';
        for (const f of flips) {
          h += `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(f.chuteId)}</td>`;
          h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(f.fromState||'')}</td>`;
          h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(f.toState||'')}</td>`;
          h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(f.description)}</td></tr>`;
        }
        h += '</tbody></table>';
      }
      if (squares.length > 0) {
        h += '<h4 style="margin:8px 0 4px;font-size:0.95em;color:#2980b9;">5S Square Changes</h4>';
        h += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><thead><tr>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Chute ID</th>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">From</th>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">To</th>';
        h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Description</th></tr></thead><tbody>';
        for (const s of squares) {
          h += `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(s.chuteId)}</td>`;
          h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(s.fromState||'—')}</td>`;
          h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(s.toState||'')}</td>`;
          h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(s.description)}</td></tr>`;
        }
        h += '</tbody></table>';
      }
    }
    h += '</div>';
  }
  return h;
}

// ── Panel 5: Ops Checklist ──────────────────────────────────
function buildOpsChecklistHtml() {
  // Recompute change overview items for checklist
  const oldAssignments = existingRules.map((r) => ({
    chuteId: r.chute, lane: r.lane, routeCode: r.stackingFilter,
    chuteType: r.resourceType, resourceLabel: r.resourceLabel, assignedAdv: 0, volumeCategory: '', isDuplicate: false,
  }));
  const oldMap = new Map();
  for (const a of oldAssignments) oldMap.set(a.chuteId, a);
  const changeItems = [];
  for (const newA of assignments) {
    const oldA = oldMap.get(newA.chuteId);
    if (oldA) {
      const oldType = resolveType(oldA.chuteType, oldA.chuteId, oldA.resourceLabel);
      const newType = resolveType(newA.chuteType, newA.chuteId, newA.resourceLabel);
      if (oldType !== newType) changeItems.push({ chuteId: newA.chuteId, lane: newA.lane, changeType: 'PanD2C_Flip', description: `Chute ${newA.chuteId}: Changing ${oldType} to ${newType}` });
      if (oldA.routeCode !== newA.routeCode) changeItems.push({ chuteId: newA.chuteId, lane: newA.lane, changeType: '5S_Square', description: `Chute ${newA.chuteId} reassigned from ${oldA.routeCode} to ${newA.routeCode}` });
    } else {
      changeItems.push({ chuteId: newA.chuteId, lane: newA.lane, changeType: '5S_Square', description: `New assignment: Chute ${newA.chuteId} → ${newA.routeCode}` });
    }
  }

  const items = changeItems.map((item, i) => ({
    id: `ops-${item.lane}-${i}`, description: item.description, lane: item.lane,
    changeType: item.changeType, responsibleParty: item.changeType === 'PanD2C_Flip' ? 'MFO Engineer' : 'Ops Team',
    targetDate: item.changeType === 'PanD2C_Flip' ? '3/22' : '3/23',
  }));
  items.push({ id: 'ar-layout-confirm', description: 'AR floor layout updated', lane: 0, changeType: 'AR_Layout', responsibleParty: 'MFO Engineer', targetDate: '3/22' });

  let h = '<div style="background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;margin-bottom:12px;border-radius:4px;color:#856404;">All items must be completed before go-live.</div>';
  h += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">';
  h += '<thead><tr><th style="text-align:center;padding:4px 8px;border-bottom:2px solid #333;width:50px;">Done</th>';
  h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Description</th>';
  h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Lane</th>';
  h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Change Type</th>';
  h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Responsible</th>';
  h += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Target Date</th></tr></thead><tbody>';
  for (const item of items) {
    h += `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:center;"><input type="checkbox" style="width:18px;height:18px;cursor:pointer;accent-color:#28a745;" /></td>`;
    h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(item.description)}</td>`;
    h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${item.lane === 0 ? '—' : item.lane}</td>`;
    h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(item.changeType)}</td>`;
    h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(item.responsibleParty)}</td>`;
    h += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${esc(item.targetDate)}</td></tr>`;
  }
  h += '</tbody></table>';
  return h;
}

// ── Build all panel content ─────────────────────────────────
const spotVolumeHtml = buildSpotVolumeHtml();
const spaoHtml = buildSpaoHtml();
const changeOverviewHtml = buildChangeOverviewHtml();
const opsChecklistHtml = buildOpsChecklistHtml();

// ── Read CSS files ──────────────────────────────────────────
const themeCss = readFileSync(join(__dirname, 'src/css/theme.css'), 'utf8');
const layoutCss = readFileSync(join(__dirname, 'src/css/layout.css'), 'utf8');
const componentsCss = readFileSync(join(__dirname, 'src/css/components.css'), 'utf8');

console.log('Generating standalone HTML...');

const buildDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TCY5 AMZL Lane Launches</title>
  <style>
${themeCss}
${layoutCss}
${componentsCss}

/* Override header to be lighter */
header {
  background: linear-gradient(135deg, #37475a 0%, #4a6274 100%);
  color: #fff;
  padding: 16px 24px;
}
header h1 { color: #fff; margin: 0 0 4px 0; font-size: 1.4em; }
header .subtitle { opacity: 0.8; font-size: 0.88em; margin: 0; }

/* KPI cards in header — lighter glass style */
#kpi-bar {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.kpi-card {
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 6px;
  padding: 10px 16px;
  min-width: 140px;
  backdrop-filter: blur(4px);
}
.kpi-label { font-size: 0.82em; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-size: 1.5em; font-weight: 700; color: #fff; }
.kpi-desc { font-size: 0.75em; color: rgba(255,255,255,0.6); margin-top: 2px; }

/* Tab nav — slightly lighter */
#tab-nav {
  display: flex;
  gap: 2px;
  background: #4a6274;
  padding: 0 24px;
  overflow-x: auto;
}
.tab-btn {
  padding: 10px 18px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.75);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 3px solid transparent;
  transition: all 0.15s;
}
.tab-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
.tab-btn.active { color: #fff; border-bottom-color: #ff9900; background: rgba(255,255,255,0.05); font-weight: 600; }

/* Panel container */
#panel-container { padding: 24px; max-width: 1400px; margin: 0 auto; }
.panel { display: none; background: #fff; border: 1px solid #dee2e6; border-radius: 4px; padding: 24px; }
.panel.active { display: block; }

/* Floor layout panel scroll */
#panel-floor-layout-grid { overflow-x: auto; }
  </style>
</head>
<body>
  <header>
    <h1>TCY5 AMZL Lane Launches</h1>
    <p class="subtitle">Pre-built from TCY5_Data.xlsx — ${buildDate}</p>
    <div id="kpi-bar">
      <div class="kpi-card">
        <div class="kpi-label">New Lanes Added</div>
        <div class="kpi-value">${newLanesAdded}</div>
        <div class="kpi-desc">New AMZL routes launched</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Chutes Used</div>
        <div class="kpi-value">${totalChutesAssigned}</div>
        <div class="kpi-desc">Chutes assigned to new routes</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total New ADV</div>
        <div class="kpi-value">${totalAdv.toLocaleString()}</div>
        <div class="kpi-desc">Daily volume added to floor</div>
      </div>
    </div>
  </header>

  <nav id="tab-nav" role="tablist">
    <button class="tab-btn active" data-panel="spot-volume" role="tab" aria-selected="true">SPOT Volume</button>
    <button class="tab-btn" data-panel="spao-assignments" role="tab" aria-selected="false">SPAO Assignments</button>
    <button class="tab-btn" data-panel="floor-layout-grid" role="tab" aria-selected="false">Floor Layout</button>
    <button class="tab-btn" data-panel="change-overview" role="tab" aria-selected="false">Change Overview</button>
    <button class="tab-btn" data-panel="ops-checklist" role="tab" aria-selected="false">Ops Checklist</button>
  </nav>

  <main id="panel-container">
    <div id="panel-spot-volume" class="panel active" role="tabpanel">${spotVolumeHtml}</div>
    <div id="panel-spao-assignments" class="panel" role="tabpanel">${spaoHtml}</div>
    <div id="panel-floor-layout-grid" class="panel" role="tabpanel">${gridHtml}</div>
    <div id="panel-change-overview" class="panel" role="tabpanel">${changeOverviewHtml}</div>
    <div id="panel-ops-checklist" class="panel" role="tabpanel">${opsChecklistHtml}</div>
  </main>

  <script>
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        btn.setAttribute('aria-selected','true');
        const panel = document.getElementById('panel-' + btn.dataset.panel);
        if (panel) panel.classList.add('active');
      });
    });
  </script>
</body>
</html>`;

// ── Write output ────────────────────────────────────────────
const distDir = join(__dirname, 'dist');
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'index.html'), html, 'utf8');
console.log(`Done! Open dist/index.html to view.`);
