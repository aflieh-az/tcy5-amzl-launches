/**
 * build-design-tool.js — TCY5 Floor Layout Collaboration Tool
 * OPS + MFO brainstorming tool for layout changes
 * Usage: node build-design-tool.js → dist/design-tool.html
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import XLSX from 'xlsx';
globalThis.XLSX = XLSX;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { parseLaneGeometry, RESERVED_LANES } from './src/js/data/tcy5-config.js';
import { parseSortationRules } from './src/js/data/stem-parser.js';
import { classifyFilter } from './src/js/utils/grid-renderer.js';

const wb = XLSX.readFile(join(__dirname, 'TCY5_Data.xlsx'));
const ls = wb.SheetNames.includes('layout_view') ? 'layout_view' : wb.SheetNames.includes('layout') ? 'layout' : null;
if (!ls || !wb.SheetNames.includes('Sortation_Rules')) { console.error('Missing sheets'); process.exit(1); }
const geo = parseLaneGeometry(wb.Sheets[ls]);
const rules = parseSortationRules(wb.Sheets['Sortation_Rules']);
const rm = {};
for (const r of rules) { const id = String(r.chute).replace(/^ARSC-/, ''); const fl = String(r.resourceLabel || '').endsWith('-FLAT'); const rt = fl ? 'D2C' : 'Multi'; rm[id] = { rl: r.resourceLabel || '', rt, sf: r.stackingFilter || '', ln: r.lane, fl }; }

const gd = geo.map(row => ({ rn: row.lane, wg: row.waveGroup || '', cells: (row.chuteDetails || []).map(d => {
  const ri = rm[d.chuteId] || rm[`ARSC-${d.chuteId}`] || {};
  const f = d.filter || ri.sf || '', fl = ri.fl || String(ri.rl || '').endsWith('-FLAT');
  return { id: d.chuteId, ln: parseInt(String(d.chuteId).slice(-2), 10) || 0, f, adv: (d.adv != null && !isNaN(d.adv)) ? Math.round(d.adv) : null, fl, rt: fl ? 'D2C' : (ri.rt || 'Multi'), cat: classifyFilter(f), ro: d.route || '' };
})}));
const lns = gd[0].cells.map(c => c.ln);

// Tag EMPTY cells on reserved lanes as FPD in the data
for (const row of gd) for (const cell of row.cells) {
  if (RESERVED_LANES.includes(cell.ln) && cell.cat === 'EMPTY') cell.cat = 'FPD';
}

// ── Overlay AMZL assignments from the assignment engine ─────
import { generateAssignments, splitOverCapacity } from './src/js/utils/chute-assign.js';
import { parseSpotSheet } from './src/js/data/spot-parser.js';
import { ALLOWED_AMZL_LANES, EXCLUDED_CHUTES_LANE_5_6, MAX_CHUTE_ADV, PRESERVED_ASSIGNMENTS } from './src/js/data/tcy5-config.js';

const spotRoutes = parseSpotSheet(wb.Sheets['SPOT_Data']);
const newLaneRoutes = wb.SheetNames.includes('New_AMZ_Lanes') ? parseSpotSheet(wb.Sheets['New_AMZ_Lanes']) : [];
for (const r of newLaneRoutes) { if (r.routeName && (!r.parentStackingFilter || r.parentStackingFilter.includes('PARENT'))) r.parentStackingFilter = r.routeName; }
const allRoutes = [...spotRoutes, ...newLaneRoutes];

const chutesPerLane = {};
for (const row of geo) for (const d of (row.chuteDetails || [])) { const ln = parseInt(String(d.chuteId).slice(-2), 10); if (!isNaN(ln)) { if (!chutesPerLane[ln]) chutesPerLane[ln] = []; chutesPerLane[ln].push(d.chuteId); } }
const config = { ALLOWED_AMZL_LANES, EXCLUDED_CHUTES_LANE_5_6, PRESERVED_ASSIGNMENTS, chutesPerLane, geometry: geo };
try {
  const rawA = generateAssignments(allRoutes, rules, config);
  const assignments = splitOverCapacity(rawA, MAX_CHUTE_ADV);
  const aMap = new Map(); for (const a of assignments) aMap.set(a.chuteId, a);
  // Overlay onto grid data
  let amzlCount = 0;
  for (const row of gd) for (const cell of row.cells) {
    const a = aMap.get(cell.id);
    if (a) { cell.f = a.routeCode; cell.adv = Math.round(a.assignedAdv); cell.cat = 'AMZL_NEW'; cell.ro = a.routeCode; cell.fl = a.chuteType === 'D2C'; cell.rt = a.chuteType; amzlCount++; }
  }
  console.log(`Overlaid ${amzlCount} AMZL assignments onto grid`);
} catch (e) { console.log('Note: Could not run assignment engine:', e.message); }

// ── Overlay pallet position ADV data from CSV ───────────────
try {
  const palletCsv = readFileSync(join(__dirname, 'tcy5-pallet-pos.csv'), 'utf8');
  const palletLines = palletCsv.trim().split('\n').slice(1); // skip header
  const palletMap = new Map();
  for (const line of palletLines) {
    const cols = line.split(',');
    const loc = cols[0].trim();
    const adv = Math.round(parseFloat(cols[1]) || 0);
    if (loc && loc.startsWith('ARSC-')) {
      // Normalize: ARSC-20812-FLAT → 20812, ARSC-21007 → 21007, ARSC-20518-2 → 20518
      const parts = loc.replace('ARSC-', '').split('-');
      const chuteId = parts[0]; // e.g. "20812"
      // Accumulate ADV for same chute (FLAT + Multi variants)
      palletMap.set(chuteId, (palletMap.get(chuteId) || 0) + adv);
    }
  }
  let palletUpdates = 0;
  for (const row of gd) {
    for (const cell of row.cells) {
      const id = String(cell.id);
      if (palletMap.has(id)) {
        cell.adv = palletMap.get(id);
        palletUpdates++;
      }
    }
  }
  console.log(`Overlaid ${palletUpdates} pallet position ADV values (${palletMap.size} unique chutes from CSV)`);
} catch (e) { console.log('Note: Could not load pallet position data:', e.message); }

const WC = { CYCLE:{b:'#1B4F9B',t:'#fff',l:'Cycle'},SMALL:{b:'#2E8B57',t:'#fff',l:'Smalls'},LARGE:{b:'#D4A017',t:'#000',l:'Large'},MIXED:{b:'#E07020',t:'#fff',l:'Mixed'},KSMF:{b:'#7B2D8E',t:'#fff',l:'KSMF'},USPS:{b:'#0D3B66',t:'#fff',l:'USPS'},DYNAMIC:{b:'#C8D8EB',t:'#444',l:'Dynamic'},PSOLVE:{b:'#8E8E8E',t:'#fff',l:'P-Solve'},RECIRC:{b:'#5C5C5C',t:'#fff',l:'Recirc'},FF:{b:'#A0522D',t:'#fff',l:'FF'},AMZL_NEW:{b:'#D62828',t:'#fff',l:'New AMZL'},FPD:{b:'#1ABC9C',t:'#000',l:'FPD'},EMPTY:{b:'#ECECEC',t:'#999',l:'Empty'} };
console.log(`${gd.length}×${lns.length} grid. Building...`);

// ── HTML: CSS ───────────────────────────────────────────────
const css = `*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;background:#0b0b1e;color:#e0e0e0;user-select:none}
:root{--accent:#ff9900;--accent-dim:rgba(255,153,0,.15);--red:#e63946;--green:#2ec4b6;--blue:#4ea8de;--bg1:#0b0b1e;--bg2:#111128;--bg3:#161638;--bg4:#1c1c48;--bdr:#2a2a55;--bdr-light:#353570;--text-primary:#e8e8f0;--text-secondary:#8888aa;--text-dim:#555577;--radius:6px;--radius-sm:4px;--shadow:0 2px 8px rgba(0,0,0,.3)}

/* ── Header ─────────────────────────────────────────── */
header{background:linear-gradient(135deg,#141430 0%,#0b0b1e 100%);padding:14px 24px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;gap:16px}
header .hdr-left{display:flex;align-items:center;gap:14px}
header .hdr-logo{width:36px;height:36px;background:linear-gradient(135deg,var(--accent),#e67700);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#000;flex-shrink:0;letter-spacing:-1px}
header .hdr-text h1{margin:0;font-size:1.15em;color:var(--text-primary);font-weight:700;letter-spacing:-.02em}
header .hdr-text .sub{color:var(--text-dim);font-size:.78em;margin:2px 0 0;letter-spacing:.01em}
header .hdr-right{display:flex;align-items:center;gap:10px}
.search-wrap{position:relative;display:flex;align-items:center}
.search-wrap .search-icon{position:absolute;left:10px;color:var(--text-dim);font-size:12px;pointer-events:none}
.si{padding:7px 10px 7px 30px;border:1px solid var(--bdr);background:var(--bg3);color:var(--text-primary);border-radius:var(--radius);font-size:12px;width:200px;transition:border-color .15s,box-shadow .15s;outline:none}
.si:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
.si::placeholder{color:var(--text-dim)}
/* ── Toolbar ─────────────────────────────────────────── */
.tb{display:flex;align-items:center;gap:5px;padding:6px 20px;background:var(--bg2);border-bottom:1px solid var(--bdr);flex-wrap:wrap}
.sep{width:1px;height:20px;background:var(--bdr);margin:0 4px}
.b{padding:4px 10px;border:1px solid var(--bdr);background:var(--bg4);color:var(--text-secondary);border-radius:var(--radius-sm);cursor:pointer;font-size:11px;transition:all .12s;display:inline-flex;align-items:center;gap:4px;font-weight:500;white-space:nowrap}
.b:hover{background:#2a2a5a;color:var(--text-primary);border-color:var(--bdr-light)}
.b.on{background:var(--accent);border-color:var(--accent);color:#000;font-weight:600}
.b.ac{background:var(--green);border-color:var(--green);color:#000;font-weight:600}
.b.danger{background:var(--red);border-color:var(--red);color:#fff;font-weight:600}
.b:disabled{opacity:.25;cursor:not-allowed}
.b kbd{font-size:8px;background:rgba(255,255,255,.1);padding:1px 4px;border-radius:3px;font-family:inherit;opacity:.7}
/* ── Bottom panel tabs ────────────────────────────────── */
.tabs{display:flex;gap:2px;background:var(--bg2);border-bottom:1px solid var(--bdr);padding:0 24px}
.tab{padding:8px 16px;border:none;background:transparent;color:var(--text-dim);font-size:11px;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit;font-weight:500;transition:color .12s}
.tab:hover{color:var(--text-secondary)}
.tab.on{color:var(--accent);border-bottom-color:var(--accent)}

/* ── Status bar ──────────────────────────────────────── */
.sb{display:flex;align-items:center;gap:16px;padding:6px 24px;background:var(--bg1);border-bottom:1px solid rgba(42,42,85,.5);font-size:11px;color:var(--text-dim)}
.sb .si2{color:var(--accent);font-weight:600}
.sb .hint{color:var(--text-dim);font-size:10px;display:flex;align-items:center;gap:12px}
.sb .hint kbd{background:var(--bg4);padding:1px 5px;border-radius:3px;border:1px solid var(--bdr);font-size:9px;color:var(--text-secondary);font-family:inherit}

/* ── Legend ───────────────────────────────────────────── */
.lg{display:flex;flex-wrap:wrap;gap:4px 10px;padding:6px 24px;background:var(--bg2);border-bottom:1px solid var(--bdr);align-items:center}
.lg-label{font-size:10px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-right:4px}
.lg-i{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--text-secondary);padding:2px 6px;border-radius:var(--radius-sm);transition:background .1s}
.lg-i:hover{background:var(--bg4)}
.lg-s{width:10px;height:10px;border-radius:3px;border:1px solid rgba(255,255,255,.15);display:inline-block;flex-shrink:0}

/* ── Place mode banner ───────────────────────────────── */
.pb{display:none;padding:10px 24px;background:linear-gradient(90deg,var(--red),#c1121f);color:#fff;font-size:12px;text-align:center;cursor:pointer;font-weight:600;letter-spacing:.02em;animation:pb-pulse 2s infinite}
.pb.on{display:flex;align-items:center;justify-content:center;gap:8px}
@keyframes pb-pulse{0%,100%{opacity:1}50%{opacity:.85}}

/* ── Scenario bar ────────────────────────────────────── */
.scn{display:flex;align-items:center;gap:10px;padding:6px 24px;background:var(--bg3);border-bottom:1px solid var(--bdr);font-size:11px}
.scn-label{color:var(--text-dim);font-weight:600;text-transform:uppercase;font-size:9px;letter-spacing:.06em}
.scn select{padding:4px 10px;border:1px solid var(--bdr);background:var(--bg4);color:var(--text-primary);border-radius:var(--radius-sm);font-size:11px;outline:none;cursor:pointer}
.scn select:focus{border-color:var(--accent)}

/* ── Main layout ─────────────────────────────────────── */
.main{display:flex;flex-direction:column;height:calc(100vh - 140px)}
.top{display:flex;flex:1;min-height:0}
.gw{flex:1;overflow:auto;padding:2px;position:relative;background:var(--bg1)}
.lasso{position:absolute;border:2px dashed var(--accent);background:rgba(255,153,0,.08);pointer-events:none;z-index:10;display:none}

/* ── Grid table ──────────────────────────────────────── */
table.fg{border-collapse:collapse;white-space:nowrap;width:100%;height:100%;table-layout:fixed}
table.fg th{padding:2px 1px;background:var(--bg3);color:var(--text-secondary);text-align:center;border:1px solid var(--bdr);font-size:7px;font-weight:700;position:sticky;top:0;z-index:2;letter-spacing:.03em}
table.fg th.lh{cursor:pointer;transition:background .12s,color .12s}
table.fg th.lh:hover{background:var(--accent-dim);color:var(--accent)}
table.fg td.rl{padding:2px 2px;font-weight:700;background:var(--bg3);color:var(--text-secondary);text-align:center;border:1px solid var(--bdr);position:sticky;left:0;z-index:1;font-size:7px;width:36px;min-width:36px;letter-spacing:.02em}
table.fg td.rh{cursor:pointer;transition:background .12s,color .12s}
table.fg td.rh:hover{background:var(--accent-dim);color:var(--accent)}

/* ── Grid cells ──────────────────────────────────────── */
.c{border:1px solid rgba(42,42,85,.6);padding:1px 0;text-align:center;vertical-align:middle;cursor:pointer;transition:all .08s;position:relative;overflow:hidden;border-radius:1px}
.c:hover{filter:brightness(1.2);z-index:1;box-shadow:0 0 6px rgba(255,255,255,.08)}
.c.sel{box-shadow:0 0 0 3px #fff,0 0 0 5px #000;z-index:2;filter:brightness(1.3)}
.c.sel::after{content:'';position:absolute;inset:0;background:rgba(255,255,255,.15);pointer-events:none;z-index:0}
.c.dov{box-shadow:0 0 0 3px var(--accent) inset;transform:scale(1.04)}
.c.drg{opacity:.3}
.c.hit{box-shadow:0 0 0 3px #ff0 inset;z-index:1;filter:brightness(1.4)}
.c.pt{cursor:crosshair}.c.pt:hover{box-shadow:0 0 0 3px var(--red) inset}
.c.locked{opacity:.6;cursor:not-allowed}
.c.changed{border:2px solid var(--accent);animation:pulse 2s infinite}
.c.changed::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,153,0,.12);pointer-events:none}
.c.ch-swap{border-color:var(--blue)}
.c.ch-swap::before{background:rgba(78,168,222,.1)}
.c.ch-place{border-color:var(--green)}
.c.ch-place::before{background:rgba(46,196,182,.1)}
.c.ch-clear{border-color:var(--red)}
.c.ch-clear::before{background:rgba(230,57,70,.1)}
.c .ch-badge{position:absolute;bottom:0;right:0;font-size:6px;padding:1px 3px;border-radius:3px 0 0 0;font-weight:700;line-height:1.2;letter-spacing:.02em}
.c .ch-badge.sw{background:var(--blue);color:#fff}
.c .ch-badge.pl{background:var(--green);color:#000}
.c .ch-badge.cl{background:var(--red);color:#fff}
.c .ch-badge.bk{background:var(--accent);color:#000}
.c .orig-val{position:absolute;bottom:0;left:0;font-size:5px;color:#888;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,153,0,0)}50%{box-shadow:0 0 4px 1px rgba(255,153,0,.3)}}
.c.has-note::after{content:'💬';position:absolute;bottom:0;left:0;font-size:6px}
.c .ci{font-weight:bold;font-size:6px;opacity:.9;line-height:1}
.c .fn{font-size:5px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;margin:0 auto;line-height:1}
.c .av{font-size:5px;opacity:.65;line-height:1}
.c .tb2{position:absolute;top:0;right:0;font-size:7px;padding:1px 3px;border-radius:0 0 0 4px;font-weight:800;line-height:1.2;letter-spacing:.03em;opacity:.95}
.c .tb2.fl{background:#ff6b6b;color:#fff}.c .tb2.ml{background:#4ecdc4;color:#000}

/* ── Right panel: inspector ──────────────────────────── */
.rp{width:220px;background:var(--bg2);border-left:1px solid var(--bdr);display:flex;flex-direction:column;overflow:hidden}
.rp .rp-tabs{display:flex;border-bottom:1px solid var(--bdr)}
.rp .rp-tab{flex:1;padding:8px;text-align:center;font-size:10px;color:var(--text-dim);cursor:pointer;border-bottom:2px solid transparent;background:transparent;border-top:none;border-left:none;border-right:none;font-family:inherit;font-weight:500;transition:color .12s}
.rp .rp-tab:hover{color:var(--text-secondary)}
.rp .rp-tab.on{color:var(--accent);border-bottom-color:var(--accent)}
.rp .rp-body{flex:1;overflow-y:auto;padding:12px;font-size:11px}
.rp .f{margin-bottom:8px}
.rp .f label{display:block;font-size:9px;color:var(--text-dim);margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.rp .f .v{color:var(--text-primary);font-size:12px;word-break:break-all}
.rp .ns{color:var(--text-dim);font-style:italic;font-size:11px;text-align:center;padding:20px 0}
.rp textarea{width:100%;height:70px;border:1px solid var(--bdr);background:var(--bg4);color:var(--text-primary);border-radius:var(--radius-sm);font-size:11px;padding:8px;resize:vertical;font-family:inherit;outline:none;transition:border-color .15s}
.rp textarea:focus{border-color:var(--accent)}
.rp .note-saved{color:var(--green);font-size:10px;display:none;font-weight:600}

/* ── Bottom panels ───────────────────────────────────── */
.bot{height:100px;min-height:40px;border-top:1px solid var(--bdr);display:flex;flex-direction:column;background:var(--bg1)}
.bot .bp{flex:1;overflow-y:auto;padding:10px 24px;font-size:11px;display:none}
.bot .bp.on{display:block}
.bot .bp table{width:100%;border-collapse:collapse;font-size:11px}
.bot .bp th{text-align:left;padding:5px 8px;border-bottom:1px solid var(--bdr);color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.bot .bp td{padding:5px 8px;border-bottom:1px solid rgba(42,42,85,.4);color:var(--text-secondary)}
.bot .bp .chg-add{color:var(--green)}.bot .bp .chg-mod{color:var(--accent)}.bot .bp .chg-rem{color:var(--red)}
.sl{font-family:'SF Mono',Consolas,monospace;color:var(--text-dim);font-size:10px}
.sl .e{padding:3px 0;border-bottom:1px solid rgba(42,42,85,.3)}
.sl .fr{color:#ff6b6b}.sl .to{color:#4ecdc4}

/* ── Impact stats ────────────────────────────────────── */
.imp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px}
.imp-card{background:var(--bg3);border:1px solid var(--bdr);border-radius:var(--radius);padding:10px 12px}
.imp-card .imp-label{font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.imp-card .imp-val{font-size:20px;font-weight:700;color:var(--text-primary);margin-top:2px}
.imp-card .imp-delta{font-size:11px;font-weight:600}
.imp-card .imp-delta.pos{color:var(--green)}.imp-card .imp-delta.neg{color:var(--red)}

/* ── Modals ──────────────────────────────────────────── */
.mo{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:100;align-items:center;justify-content:center}
.mo.open{display:flex}
.md{background:var(--bg3);border:1px solid var(--bdr-light);border-radius:10px;padding:24px;width:360px;max-width:90vw;box-shadow:0 16px 48px rgba(0,0,0,.5)}
.md h2{margin:0 0 16px;font-size:1.1em;color:var(--text-primary);font-weight:700}
.md label{display:block;margin-bottom:10px;font-size:11px;color:var(--text-secondary)}
.md label span{display:block;margin-bottom:4px;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim)}
.md input,.md select{width:100%;padding:8px 12px;border:1px solid var(--bdr);background:var(--bg4);color:var(--text-primary);border-radius:var(--radius-sm);font-size:12px;outline:none;transition:border-color .15s}
.md input:focus,.md select:focus{border-color:var(--accent)}
.md .br{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}
.md .br button{padding:8px 18px;border:1px solid var(--bdr);background:var(--bg4);color:var(--text-secondary);border-radius:var(--radius-sm);cursor:pointer;font-size:11px;font-weight:600;transition:all .12s}
.md .br button:hover{background:#2a2a5a;color:var(--text-primary)}
.md .br button.p{background:var(--accent);border-color:var(--accent);color:#000}
.md .br button.p:hover{background:#e68a00}

/* ── Context menu ────────────────────────────────────── */
.cm{position:fixed;background:var(--bg3);border:1px solid var(--bdr-light);border-radius:var(--radius);padding:4px 0;z-index:200;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,.5);backdrop-filter:blur(8px)}
.cm .ci2{padding:7px 14px;cursor:pointer;font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;transition:all .08s}
.cm .ci2:hover{background:var(--accent-dim);color:var(--text-primary)}
.cm .ci2 .cm-icon{width:16px;text-align:center;font-size:12px;flex-shrink:0}
.cm .cs{height:1px;background:var(--bdr);margin:4px 8px}

/* ── Tooltip ─────────────────────────────────────────── */
[data-tip]{position:relative}
[data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#222;color:#eee;padding:4px 8px;border-radius:4px;font-size:10px;white-space:nowrap;z-index:300;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.4)}`;


// ── HTML: Body ──────────────────────────────────────────────
const body = `<header>
<div class="hdr-left">
<div class="hdr-logo">T5</div>
<div class="hdr-text">
<h1>TCY5 Floor Layout Designer</h1>
<p class="sub">Drag chutes, annotate changes, compare scenarios, export proposals</p>
</div>
</div>
<div class="hdr-right">
<div class="search-wrap"><span class="search-icon">🔍</span><input class="si" type="text" id="si" placeholder="Search by filter name…"></div>
<button class="b" id="bhelp" data-tip="Keyboard shortcuts &amp; help">? Help</button>
</div>
</header>

<div class="tb">
<button class="b" id="bu" disabled>↩ Undo <kbd>Z</kbd></button>
<button class="b" id="br2">⟲ Reset</button>
<span class="sep"></span>
<button class="b" id="bsw" disabled>⇄ Swap</button>
<button class="b" id="bcl" disabled>🗑 Clear <kbd>Del</kbd></button>
<button class="b" id="bsf" disabled>✏ Set Filter</button>
<span class="sep"></span>
<button class="b ac" id="bal">+ Add Lane</button>
<button class="b" id="bex">⬇ Export CSV</button>
<button class="b" id="bss">📸 Screenshot</button>
<span class="sep"></span>
<button class="b" id="bzo">−</button>
<span id="zl" style="font-size:11px;color:var(--text-secondary);min-width:36px;text-align:center;font-weight:600">100%</span>
<button class="b" id="bzi">+</button>
<span class="sep"></span>
<button class="b" id="btv">👁 Before/After</button>
<span class="sep"></span>
<button class="b" id="bss">📸 Screenshot</button>
</div>

<div class="scn">
<span class="scn-label">Scenario</span>
<select id="scn-sel"><option value="default">Current Draft</option></select>
<button class="b" id="scn-save" data-tip="Save current layout as a named scenario">💾 Save As…</button>
<button class="b" id="scn-del" data-tip="Delete selected scenario">🗑 Delete</button>
</div>

<div class="sb">
<span id="sc" style="font-weight:600">0 operations</span>
<span class="si2" id="ssi"></span>
<span class="hint">Click to select · Drag cell → cell to swap · Ctrl+Click to add · Click row/lane headers to select all · Right-click for menu</span>
</div>

<div class="lg"></div>

<div class="pb" id="pb">🎯 PLACE MODE — Click any cell to assign the new lane there. Press Esc or click here to cancel.</div>
<div class="main">
<div class="top">
<div class="gw" id="gw"><div class="lasso" id="lasso"></div></div>
<div class="rp">
<div class="rp-tabs"><button class="rp-tab on" data-rp="inspect">🔍 Inspector</button><button class="rp-tab" data-rp="notes">📝 Notes</button></div>
<div class="rp-body" id="rpb">
<div id="rp-inspect"><div class="ns" id="ie">Click a cell to inspect its details</div><div id="ic" style="display:none"></div></div>
<div id="rp-notes" style="display:none"><div class="ns" id="ne">Select a cell to add notes</div><div id="nc2" style="display:none">
<p style="font-size:10px;color:var(--text-dim);margin:0 0 6px">Document why you made this change (visible to OPS + MFO)</p>
<textarea id="nt2" placeholder="e.g. Moving DSR2 here to reduce drive congestion on row 14…"></textarea>
<button class="b" id="ns2" style="margin-top:6px;width:100%;justify-content:center">💾 Save Note</button><span class="note-saved" id="nsv">✓ Saved</span>
</div></div>
</div></div></div>
<div class="bot">
<div class="tabs"><button class="tab on" data-bp="changes">📋 Change Proposal</button><button class="tab" data-bp="impact">📊 Impact Analysis</button><button class="tab" data-bp="log">📝 Activity Log</button></div>
<div class="bp on" id="bp-changes"><div style="display:flex;justify-content:flex-end;padding:2px 0"><button class="b" id="bexc" style="font-size:9px;padding:2px 8px">⬇ Export Changes CSV</button></div><div id="chg-content"></div></div>
<div class="bp" id="bp-impact"><div id="imp-content"></div></div>
<div class="bp sl" id="bp-log"></div>
</div></div>
<div class="cm" id="cm" style="display:none"></div>
<span id="bsm" style="display:none"></span><span id="bsa" style="display:none"></span><span id="bds" style="display:none"></span><span id="btt" style="display:none"></span><span id="bcfm" style="display:none"></span>
<div class="mo" id="m1"><div class="md">
<h2>+ Add New Lane</h2>
<p style="font-size:10px;color:var(--text-dim);margin:-10px 0 14px">Define the route, then click a cell on the grid to place it.</p>
<label><span>Stacking Filter</span><input type="text" id="nf" placeholder="e.g. TCY9->DCK6-CYC1"></label>
<label><span>Expected ADV (Daily Volume)</span><input type="number" id="na" placeholder="1800" min="0"></label>
<label><span>Chute Type</span><select id="nty"><option value="Multi">Multi (standard)</option><option value="D2C">D2C / FLAT (smalls)</option></select></label>
<label><span>Color Category</span><select id="nca" onchange="document.getElementById('custom-cat-fields').style.display=this.value==='__CUSTOM__'?'block':'none'"><option value="AMZL_NEW">New AMZL</option><option value="CYCLE">Cycle</option><option value="SMALL">Smalls</option><option value="LARGE">Large</option><option value="MIXED">Mixed</option><option value="KSMF">KSMF</option><option value="USPS">USPS</option><option value="DYNAMIC">Dynamic</option><option value="PSOLVE">P-Solve</option><option value="FF">FF</option><option value="__CUSTOM__">+ Custom Color…</option></select></label>
<div id="custom-cat-fields" style="display:none">
<label><span>Custom Category Name</span><input type="text" id="ncc-name" placeholder="e.g. FedEx, Returns, New Program"></label>
<label><span>Color</span><input type="color" id="ncc-color" value="#e74c3c" style="height:36px;padding:2px;border-radius:4px"></label>
</div>
<div class="br"><button id="mc1">Cancel</button><button id="mc2" class="p">Place on Grid →</button></div>
</div></div>

<div class="mo" id="m2"><div class="md">
<h2>✏ Set Filter on Selected Cells</h2>
<p style="font-size:10px;color:var(--text-dim);margin:-10px 0 14px">Apply a stacking filter to all selected cells at once.</p>
<label><span>Stacking Filter</span><input type="text" id="bf" placeholder="e.g. 95370-SMALL"></label>
<label><span>ADV (optional)</span><input type="number" id="ba" placeholder="Leave blank to keep existing" min="0"></label>
<label><span>Color Category</span><select id="bc"><option value="AMZL_NEW">New AMZL</option><option value="MIXED">Mixed</option><option value="SMALL">Smalls</option><option value="LARGE">Large</option><option value="DYNAMIC">Dynamic</option><option value="CYCLE">Cycle</option><option value="KSMF">KSMF</option><option value="USPS">USPS</option><option value="FF">FF</option><option value="PSOLVE">P-Solve</option><option value="RECIRC">Recirc</option><option value="__CUSTOM__">+ Custom Color…</option></select></label>
<div id="custom-cat-fields-2" style="display:none">
<label><span>Custom Category Name</span><input type="text" id="bcc-name" placeholder="e.g. FedEx, Returns, New Program"></label>
<label><span>Color</span><input type="color" id="bcc-color" value="#e74c3c" style="height:36px;padding:2px;border-radius:4px"></label>
</div>
<div class="br"><button id="bc1">Cancel</button><button id="bc2" class="p">Apply to Selected</button></div>
</div></div>

<div class="mo" id="m3"><div class="md">
<h2>💾 Save Scenario</h2>
<p style="font-size:10px;color:var(--text-dim);margin:-10px 0 14px">Save your current layout as a named scenario to compare later.</p>
<label><span>Scenario Name</span><input type="text" id="sn" placeholder="e.g. Option A — DSR2 on Lane 7"></label>
<div class="br"><button id="sc1">Cancel</button><button id="sc2" class="p">Save Scenario</button></div>
</div></div>
<div class="mo" id="m4"><div class="md" style="width:560px;max-height:80vh;overflow-y:auto">
<h2 style="margin-bottom:16px;display:flex;align-items:center;gap:10px"><span style="background:linear-gradient(135deg,var(--accent),#e67700);-webkit-background-clip:text;-webkit-text-fill-color:transparent">TCY5 Floor Layout Designer</span></h2>
<div style="font-size:11px;color:var(--text-secondary);line-height:1.7">

<div style="background:var(--bg4);border:1px solid var(--bdr);border-radius:6px;padding:12px 14px;margin-bottom:14px">
<p style="color:var(--accent);font-weight:700;font-size:12px;margin:0 0 6px">What is this tool?</p>
<p style="margin:0;color:var(--text-secondary)">A shared workspace for MFO Engineers and OPS Managers to plan floor layout changes. Drag chutes, annotate decisions, compare scenarios, and export documented proposals — all from one page.</p>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
<div style="background:var(--bg4);border:1px solid var(--bdr);border-radius:6px;padding:10px 12px">
<p style="color:var(--blue);font-weight:700;font-size:11px;margin:0 0 6px">🖱 Mouse Actions</p>
<p style="margin:0 0 3px"><span style="color:var(--text-primary)">Click</span> — select a cell</p>
<p style="margin:0 0 3px"><span style="color:var(--text-primary)">Ctrl+Click</span> — add to selection</p>
<p style="margin:0 0 3px"><span style="color:var(--text-primary)">Click+Drag</span> — lasso select (works anywhere)</p>
<p style="margin:0 0 3px"><span style="color:var(--text-primary)">Click Row/Lane header</span> — select entire row or lane</p>
<p style="margin:0"><span style="color:var(--text-primary)">Right-click</span> — context menu (swap, clear, etc.)</p>
</div>
<div style="background:var(--bg4);border:1px solid var(--bdr);border-radius:6px;padding:10px 12px">
<p style="color:var(--blue);font-weight:700;font-size:11px;margin:0 0 6px">⌨ Keyboard Shortcuts</p>
<p style="margin:0 0 3px"><kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--bdr);font-size:10px">Ctrl+Z</kbd> Undo</p>
<p style="margin:0 0 3px"><kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--bdr);font-size:10px">Ctrl+A</kbd> Select all</p>
<p style="margin:0 0 3px"><kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--bdr);font-size:10px">Esc</kbd> Deselect / cancel</p>
<p style="margin:0"><kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--bdr);font-size:10px">Del</kbd> Clear selected</p>
</div>
</div>

<div style="background:var(--bg4);border:1px solid var(--bdr);border-radius:6px;padding:10px 12px;margin-bottom:14px">
<p style="color:var(--blue);font-weight:700;font-size:11px;margin:0 0 8px">🏷 Change Tracking Badges</p>
<div style="display:flex;gap:12px;flex-wrap:wrap">
<span><span style="background:var(--blue);color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700">SWAP</span> Two cells swapped</span>
<span><span style="background:var(--green);color:#000;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700">NEW</span> New lane placed</span>
<span><span style="background:var(--red);color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700">CLR</span> Cell cleared</span>
<span><span style="background:var(--accent);color:#000;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700">MOD</span> Bulk edit</span>
</div>
<p style="margin:6px 0 0;color:var(--text-dim);font-size:10px">Changed cells show "was: ..." so you can see the original value at a glance.</p>
</div>

<div style="background:var(--bg4);border:1px solid var(--bdr);border-radius:6px;padding:10px 12px">
<p style="color:var(--blue);font-weight:700;font-size:11px;margin:0 0 6px">📊 Bottom Panels</p>
<p style="margin:0 0 3px"><span style="color:var(--text-primary)">Change Proposal</span> — auto-generated table of every proposed change with notes</p>
<p style="margin:0 0 3px"><span style="color:var(--text-primary)">Impact Analysis</span> — ADV shifts per lane, total changes, type flips</p>
<p style="margin:0"><span style="color:var(--text-primary)">Activity Log</span> — chronological history of every operation</p>
</div>

</div>
<div class="br"><button id="mh1" class="p">Got it</button></div>
</div></div>`;

// ── Generate script with data injected ───────────────────────
const GD = JSON.stringify(gd);
const LNS = JSON.stringify(lns);
const RLS = JSON.stringify(RESERVED_LANES);
const WCS = JSON.stringify(WC);

const scriptContent = `
const G=${GD};const LN=${LNS};const RL=${RLS};const WC=${WCS};
const OG=JSON.parse(JSON.stringify(G));
let H=[],sel=new Set(),sm=false,pm=null,ds=null,zm=100,st='',lci=null,showOrig=false,notes={},chgMap={};
let scenarios=JSON.parse(localStorage.getItem('tcy5-scenarios')||'{}');
const KS=['f','adv','fl','rt','cat','ro'];
const $=id=>document.getElementById(id);
function K(r,c){return r+','+c}
function gc(r,c){return G[r].cells[c]}
function oc(r,c){return OG[r].cells[c]}
function E(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function T(s,n){return !s?'':s.length>n?s.slice(0,n-1)+'\\u2026':s}
function clr(cell){return WC[cell.cat]||WC.EMPTY}
function isChanged(r,c){const a=gc(r,c),b=oc(r,c);return a.f!==b.f||a.adv!==b.adv||a.fl!==b.fl||a.rt!==b.rt}
function isLocked(r,c){return gc(r,c).cat==='PSOLVE'}
function render(){const src=showOrig?OG:G;let h='<table class="fg"><thead><tr><th></th>';
for(let i=0;i<LN.length;i++){const l=LN[i];h+='<th class=\"lh\" data-lane=\"'+l+'\" style=\"cursor:pointer\">Lane '+l+'</th>'}
h+='</tr></thead><tbody>';
for(let r=0;r<src.length;r++){const row=src[r];h+='<tr><td class=\"rl rh\" data-row=\"'+r+'\" style=\"cursor:pointer\">Row '+row.rn;h+='</td>';
for(let c=0;c<row.cells.length;c++){const cell=row.cells[c],co=clr(cell),iS=sel.has(K(r,c)),iH=st&&(cell.f.toLowerCase().includes(st)||cell.id.toLowerCase().includes(st)||cell.ro.toLowerCase().includes(st));
const chg=!showOrig&&isChanged(r,c),hasN=!!notes[K(r,c)],ct=chgMap[K(r,c)]||'';
let cl='c';if(isLocked(r,c))cl+=' locked';if(iS)cl+=' sel';if(iH)cl+=' hit';if(pm)cl+=' pt';if(chg){cl+=' changed';if(ct==='sw')cl+=' ch-swap';else if(ct==='pl')cl+=' ch-place';else if(ct==='cl')cl+=' ch-clear'}if(hasN)cl+=' has-note';
h+='<td class=\"'+cl+'\" data-r=\"'+r+'\" data-c=\"'+c+'\" style=\"background:'+co.b+';color:'+co.t+'\">';
var hideBadge=(cell.cat==='PSOLVE'||cell.cat==='DYNAMIC'||cell.cat==='RECIRC'||cell.cat==='CYCLE')&&!isChanged(r,c);
if(!hideBadge)h+='<span class=\"tb2 '+(cell.fl?'fl':'ml')+'\">'+(cell.fl?'F':'M')+'</span>';
h+='<div class=\"ci\">'+E(cell.id)+'</div><div class=\"fn\">'+E(T(cell.f,9))+'</div>';
if(cell.adv!=null)h+='<div class=\"av\">'+cell.adv+'</div>';
if(chg){const orig=oc(r,c);h+='<div class=\"orig-val\">was:'+E(T(orig.f||'empty',8))+'</div>';
const lbl=ct==='sw'?'SWAP':ct==='pl'?'NEW':ct==='cl'?'CLR':'MOD';
h+='<span class=\"ch-badge '+(ct||'bk')+'\">'+lbl+'</span>'}
h+='</td>'}h+='</tr>'}
h+='</tbody></table>';var zs=zm/100;$('gw').innerHTML='<div class=\"lasso\" id=\"lasso\"></div><div id=\"zoom-wrap\" style=\"transform:scale('+zs+');transform-origin:top left;display:inline-block\">'+h+'</div>';bindAll();upSt();upChg();upImp();updateLegend()}
function upSt(){$('sc').textContent=H.length+' operation'+(H.length!==1?'s':'');$('bu').disabled=!H.length;let n=sel.size,adv=0;sel.forEach(k=>{const[r,c]=k.split(',').map(Number);if(gc(r,c).adv)adv+=gc(r,c).adv});$('ssi').textContent=n?n+' selected \\u00b7 '+adv.toLocaleString()+' ADV':'';$('bcl').disabled=!n;$('bsf').disabled=!n;$('btt').disabled=!n;$('bcfm').disabled=!n;$('bsw').disabled=n!==2;$('zl').textContent=zm+'%';$('btv').classList.toggle('on',showOrig)}
function upIns(){const ie=$('ie'),ic=$('ic');if(sel.size!==1){ie.style.display='block';ic.style.display='none';ie.textContent=sel.size>1?sel.size+' cells':'Click a cell';$('ne').style.display='block';$('nc2').style.display='none';return}ie.style.display='none';ic.style.display='block';$('ne').style.display='none';$('nc2').style.display='block';const[r,c]=[...sel][0].split(',').map(Number),cell=gc(r,c),row=G[r],orig=oc(r,c),chg=isChanged(r,c);let ih='<div class=\"f\"><label>Chute</label><div class=\"v\">'+E(cell.id)+'</div></div><div class=\"f\"><label>Position</label><div class=\"v\">Row '+row.rn+' Lane '+cell.ln+'</div></div><div class=\"f\"><label>Filter</label><div class=\"v\" style=\"color:var(--accent)\">'+E(cell.f||'(empty)')+'</div></div><div class=\"f\"><label>ADV</label><div class=\"v\" style=\"font-size:14px;font-weight:bold\">'+(cell.adv!=null?cell.adv.toLocaleString():'\\u2014')+'</div></div><div class=\"f\"><label>Type</label><div class=\"v\">'+cell.rt+(cell.fl?' (FLAT)':'')+'</div></div>';if(chg)ih+='<div style=\"margin-top:6px;padding:4px;background:rgba(255,153,0,.1);border:1px solid rgba(255,153,0,.3);border-radius:3px;font-size:9px\"><span style=\"color:var(--accent)\">\\u26a1 Changed</span><br>Was: '+E(orig.f||'empty')+' ADV:'+(orig.adv||'\\u2014')+'</div>';ic.innerHTML=ih;$('nt2').value=notes[K(r,c)]||'';$('nsv').style.display='none'}
function upChg(){const changes=[];for(let r=0;r<G.length;r++)for(let c=0;c<G[r].cells.length;c++){if(isChanged(r,c)){const cur=gc(r,c),orig=oc(r,c);changes.push({id:cur.id,row:G[r].rn,lane:cur.ln,oldF:orig.f,newF:cur.f,oldAdv:orig.adv,newAdv:cur.adv,oldRt:orig.rt,newRt:cur.rt,note:notes[K(r,c)]||''})}}if(!changes.length){$('chg-content').innerHTML='<p style=\"color:var(--text-dim);font-style:italic;text-align:center;padding:16px 0\">No changes yet. Drag cells or use the toolbar to start building your proposal.</p>';return}let h='<p style=\"color:#888;margin:0 0 4px;font-size:9px\">'+changes.length+' proposed</p><table><thead><tr><th>Chute</th><th>Row</th><th>Lane</th><th>Was</th><th>Proposed</th><th>ADV\\u0394</th><th>Type</th><th>Note</th></tr></thead><tbody>';for(const ch of changes){const d=(ch.newAdv||0)-(ch.oldAdv||0);h+='<tr><td>'+E(ch.id)+'</td><td>R'+ch.row+'</td><td>L'+ch.lane+'</td><td class=\"chg-rem\">'+E(ch.oldF||'empty')+'</td><td class=\"chg-add\">'+E(ch.newF||'empty')+'</td><td class=\"'+(d>0?'chg-add':d<0?'chg-rem':'')+'\">'+(d>0?'+':'')+d+'</td><td>'+(ch.oldRt!==ch.newRt?ch.oldRt+'\\u2192'+ch.newRt:ch.newRt)+'</td><td style=\"color:#666;max-width:100px;overflow:hidden;text-overflow:ellipsis\">'+E(ch.note||'\\u2014')+'</td></tr>'}h+='</tbody></table>';$('chg-content').innerHTML=h}
function upImp(){let tO=0,tN=0,chgC=0,flips=0;const lO={},lN={};for(let r=0;r<G.length;r++)for(let c=0;c<G[r].cells.length;c++){const cur=gc(r,c),orig=oc(r,c);tO+=(orig.adv||0);tN+=(cur.adv||0);lO[cur.ln]=(lO[cur.ln]||0)+(orig.adv||0);lN[cur.ln]=(lN[cur.ln]||0)+(cur.adv||0);if(isChanged(r,c)){chgC++;if(orig.fl!==cur.fl)flips++}}const d=tN-tO;let h='<div class=\"imp-grid\"><div class=\"imp-card\"><div class=\"imp-label\">Changed</div><div class=\"imp-val\">'+chgC+'</div></div><div class=\"imp-card\"><div class=\"imp-label\">Total ADV</div><div class=\"imp-val\">'+tN.toLocaleString()+'</div><div class=\"imp-delta '+(d>=0?'pos':'neg')+'\">'+(d>=0?'+':'')+d.toLocaleString()+'</div></div><div class=\"imp-card\"><div class=\"imp-label\">Type Flips</div><div class=\"imp-val\">'+flips+'</div></div></div>';const lanes=[...new Set([...Object.keys(lO),...Object.keys(lN)])].sort((a,b)=>a-b);h+='<table><thead><tr><th>Lane</th><th>Original</th><th>Proposed</th><th>Delta</th></tr></thead><tbody>';for(const ln of lanes){const o=lO[ln]||0,n=lN[ln]||0,dd=n-o;if(!dd)continue;h+='<tr><td>L'+ln+'</td><td>'+o.toLocaleString()+'</td><td>'+n.toLocaleString()+'</td><td class=\"'+(dd>0?'chg-add':'chg-rem')+'\">'+(dd>0?'+':'')+dd.toLocaleString()+'</td></tr>'}h+='</tbody></table>';$('imp-content').innerHTML=h}
function bindAll(){
// Cell events — no native drag, we handle everything via mouse events
document.querySelectorAll('.c').forEach(el=>{el.addEventListener('contextmenu',onCM)});
// Row header clicks
document.querySelectorAll('.rh').forEach(el=>{el.addEventListener('click',function(e){
  if(showOrig)return;const r=+this.dataset.row;
  if(!e.ctrlKey&&!e.metaKey)sel.clear();
  G[r].cells.forEach((_,ci)=>sel.add(K(r,ci)));rSV();upSt();upIns()})});
// Lane header clicks
document.querySelectorAll('.lh').forEach(el=>{el.addEventListener('click',function(e){
  if(showOrig)return;const l=+this.dataset.lane;
  if(!e.ctrlKey&&!e.metaKey)sel.clear();
  G.forEach((row,ri)=>row.cells.forEach((cc,ci)=>{if(cc.ln===l&&!isLocked(ri,ci))sel.add(K(ri,ci))}));rSV();upSt();upIns()})});
}
function rSV(){document.querySelectorAll('.c').forEach(el=>el.classList.toggle('sel',sel.has(K(+el.dataset.r,+el.dataset.c))))}
function doSw(r1,c1,r2,c2){const a=gc(r1,c1),b=gc(r2,c2);H.push({t:'sw',r1,c1,r2,c2,a:JSON.parse(JSON.stringify(a)),b:JSON.parse(JSON.stringify(b))});const tA={},tB={};for(const k of KS){tA[k]=a[k];tB[k]=b[k]}for(const k of KS){a[k]=tB[k];b[k]=tA[k]}chgMap[K(r1,c1)]="sw";chgMap[K(r2,c2)]="sw";lg('<span class=\"fr\">'+E(a.id)+'('+E(tA.f||'\\u2014')+')</span> \\u21c4 <span class=\"to\">'+E(b.id)+'('+E(tB.f||'\\u2014')+')</span>');render()}
function exitPM(){pm=null;$('pb').classList.remove('on');render()}
function bCl(){if(!sel.size)return;const b=[];sel.forEach(k=>{const[r,c]=k.split(',').map(Number);b.push({r,c,p:JSON.parse(JSON.stringify(gc(r,c)))})});H.push({t:'bk',b});b.forEach(({r,c})=>{const cell=gc(r,c);cell.f='';cell.adv=null;cell.fl=false;cell.rt='Multi';cell.cat=RL.includes(cell.ln)?'FPD':'EMPTY';cell.ro=''});sel.forEach(k=>chgMap[k]='cl');lg('\\ud83d\\uddd1 Cleared '+b.length);render()}
function bTg(){if(!sel.size)return;const b=[];sel.forEach(k=>{const[r,c]=k.split(',').map(Number);b.push({r,c,p:JSON.parse(JSON.stringify(gc(r,c)))})});H.push({t:'bk',b});b.forEach(({r,c})=>{const cell=gc(r,c);cell.fl=!cell.fl;cell.rt=cell.fl?'D2C':'Multi'});sel.forEach(k=>chgMap[k]='bk');lg('\\ud83d\\udd04 Toggled '+b.length);render()}
function undo(){if(!H.length)return;const last=H.pop();const log=$('bp-log');if(log.firstChild)log.removeChild(log.firstChild);if(last.t==='sw'){for(const k of KS){G[last.r1].cells[last.c1][k]=last.a[k];G[last.r2].cells[last.c2][k]=last.b[k]}}else if(last.t==='pl'){const cell=gc(last.r,last.c);for(const k of KS)cell[k]=last.prev[k]}else if(last.t==='bk'){last.b.forEach(({r,c,p})=>{const cell=gc(r,c);for(const k of KS)cell[k]=p[k]})}render()}
function lg(h){const d=document.createElement('div');d.className='e';d.innerHTML=h;$('bp-log').insertBefore(d,$('bp-log').firstChild)}
function onCM(e){e.preventDefault();if(showOrig)return;const r=+e.currentTarget.dataset.r,c=+e.currentTarget.dataset.c,key=K(r,c);if(!sel.has(key)){sel.clear();sel.add(key);rSV();upSt();upIns()}const m=$('cm'),cell=gc(r,c);const n=sel.size;const multi=n>1;m.innerHTML='<div class=\"ci2\" data-a=\"ins\"><span class=\"cm-icon\">🔍</span>'+(multi?'Inspect ('+n+' cells)':'Inspect Cell')+'</div><div class=\"ci2\" data-a=\"sr\"><span class=\"cm-icon\">↔</span>Select Row '+G[r].rn+'</div><div class=\"ci2\" data-a=\"sl\"><span class=\"cm-icon\">↕</span>Select Lane '+cell.ln+'</div><div class=\"ci2\" data-a=\"sf\"><span class=\"cm-icon\">🎯</span>Select Same Filter</div><div class=\"cs\"></div><div class=\"ci2\" data-a=\"cl\"><span class=\"cm-icon\">🗑</span>'+(multi?'Clear '+n+' Cells':'Clear Cell')+'</div><div class=\"ci2\" data-a=\"st\"><span class=\"cm-icon\">✏</span>'+(multi?'Set Filter on '+n+' Cells':'Set Filter…')+'</div><div class=\"ci2\" data-a=\"mf\"><span class=\"cm-icon\">F</span>'+(multi?'Set FLAT on '+n+' Cells':'Set as FLAT')+'</div><div class=\"ci2\" data-a=\"mm\"><span class=\"cm-icon\">M</span>'+(multi?'Set Multi on '+n+' Cells':'Set as Multi')+'</div><div class=\"cs\"></div><div class=\"ci2\" data-a=\"cp\"><span class=\"cm-icon\">📋</span>Copy Filter</div><div class=\"ci2\" data-a=\"an\"><span class=\"cm-icon\">💬</span>Add Note</div>';m.style.left=Math.min(e.clientX,innerWidth-180)+'px';m.style.top=Math.min(e.clientY,innerHeight-220)+'px';m.style.display='block';m.querySelectorAll('.ci2').forEach(i=>i.addEventListener('click',()=>{m.style.display='none';cAct(i.dataset.a,r,c)}))}
document.addEventListener('click',e=>{if(!e.target.closest('.cm'))$('cm').style.display='none'});
function cAct(a,r,c){const cell=gc(r,c);if(a==='ins'){if(sel.size<=1){sel.clear();sel.add(K(r,c))}upIns();upSt();rSV();switchRP('inspect')}else if(a==='sr'){sel.clear();G[r].cells.forEach((_,ci)=>{if(!isLocked(r,ci))sel.add(K(r,ci))});rSV();upSt();upIns()}else if(a==='sl'){sel.clear();const l=cell.ln;G.forEach((row,ri)=>row.cells.forEach((cc,ci)=>{if(cc.ln===l&&!isLocked(ri,ci))sel.add(K(ri,ci))}));rSV();upSt();upIns()}else if(a==='sf'){const f=cell.f;if(!f){return}sel.clear();const prefix=f.split('-')[0];G.forEach((row,ri)=>row.cells.forEach((cc,ci)=>{if(!isLocked(ri,ci)&&cc.f&&(cc.f===f||cc.f.startsWith(prefix+'-')||cc.f===prefix))sel.add(K(ri,ci))}));rSV();upSt();upIns()}else if(a==='cl')bCl();else if(a==='tg')bTg();else if(a==='st'){rebuildCatDropdowns();$('m2').classList.add('open')}else if(a==='mf'){if(!sel.size)return;const b=[];sel.forEach(k=>{const[rr,cc]=k.split(',').map(Number);b.push({r:rr,c:cc,p:JSON.parse(JSON.stringify(gc(rr,cc)))})});H.push({t:'bk',b});b.forEach(({r:rr,c:cc})=>{const c2=gc(rr,cc);c2.fl=true;c2.rt='D2C'});sel.forEach(k=>chgMap[k]='bk');lg('Set FLAT on '+b.length);render()}else if(a==='mm'){if(!sel.size)return;const b=[];sel.forEach(k=>{const[rr,cc]=k.split(',').map(Number);b.push({r:rr,c:cc,p:JSON.parse(JSON.stringify(gc(rr,cc)))})});H.push({t:'bk',b});b.forEach(({r:rr,c:cc})=>{const c2=gc(rr,cc);c2.fl=false;c2.rt='Multi'});sel.forEach(k=>chgMap[k]='bk');lg('Set Multi on '+b.length);render()}else if(a==='cp')navigator.clipboard.writeText(cell.f).catch(()=>{});else if(a==='an'){sel.clear();sel.add(K(r,c));rSV();upSt();upIns();switchRP('notes')}}
function switchRP(name){document.querySelectorAll('.rp-tab').forEach(t=>t.classList.toggle('on',t.dataset.rp===name));$('rp-inspect').style.display=name==='inspect'?'block':'none';$('rp-notes').style.display=name==='notes'?'block':'none'}
document.querySelectorAll('.rp-tab').forEach(t=>t.addEventListener('click',()=>switchRP(t.dataset.rp)));
document.querySelectorAll('.tabs .tab').forEach(t=>t.addEventListener('click',()=>{document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');document.querySelectorAll('.bp').forEach(p=>p.classList.remove('on'));$('bp-'+t.dataset.bp).classList.add('on')}));
$('ns2').addEventListener('click',()=>{if(sel.size!==1)return;const[r,c]=[...sel][0].split(',').map(Number);const val=$('nt2').value.trim();if(val)notes[K(r,c)]=val;else delete notes[K(r,c)];$('nsv').style.display='inline';setTimeout(()=>$('nsv').style.display='none',1500);render()});
$('btv').addEventListener('click',()=>{showOrig=!showOrig;render()});
$('bhelp').addEventListener('click',()=>$('m4').classList.add('open'));
$('mh1').addEventListener('click',()=>$('m4').classList.remove('open'));
function refreshScn(){const s=$('scn-sel');const cur=s.value;s.innerHTML='<option value=\"default\">Current Draft</option>';for(const name of Object.keys(scenarios))s.innerHTML+='<option value=\"'+E(name)+'\">'+E(name)+'</option>';s.value=cur}refreshScn();
$('scn-save').addEventListener('click',()=>{$('sn').value='';$('m3').classList.add('open')});$('sc1').addEventListener('click',()=>$('m3').classList.remove('open'));
$('sc2').addEventListener('click',()=>{const name=$('sn').value.trim();if(!name){alert('Enter name');return}scenarios[name]={grid:JSON.parse(JSON.stringify(G)),notes:JSON.parse(JSON.stringify(notes))};localStorage.setItem('tcy5-scenarios',JSON.stringify(scenarios));refreshScn();$('scn-sel').value=name;$('m3').classList.remove('open')});
$('scn-sel').addEventListener('change',()=>{const v=$('scn-sel').value;if(v==='default'){for(let r=0;r<OG.length;r++)for(let c=0;c<OG[r].cells.length;c++)Object.assign(G[r].cells[c],OG[r].cells[c]);notes={}}else if(scenarios[v]){for(let r=0;r<scenarios[v].grid.length;r++)for(let c=0;c<scenarios[v].grid[r].cells.length;c++)Object.assign(G[r].cells[c],scenarios[v].grid[r].cells[c]);notes=JSON.parse(JSON.stringify(scenarios[v].notes||{}))}H=[];sel.clear();render();upIns()});
$('scn-del').addEventListener('click',()=>{const v=$('scn-sel').value;if(v==='default')return;if(!confirm('Delete?'))return;delete scenarios[v];localStorage.setItem('tcy5-scenarios',JSON.stringify(scenarios));$('scn-sel').value='default';refreshScn()});
$('bu').addEventListener('click',undo);$('br2').addEventListener('click',()=>{if(!confirm('Reset?'))return;for(let r=0;r<OG.length;r++)for(let c=0;c<OG[r].cells.length;c++)Object.assign(G[r].cells[c],OG[r].cells[c]);H=[];sel.clear();notes={};chgMap={};$('bp-log').innerHTML='';render();upIns()});
$('bsm').addEventListener('click',()=>{sm=!sm;upSt()});$('bsa').addEventListener('click',()=>{G.forEach((row,r)=>row.cells.forEach((_,c)=>sel.add(K(r,c))));rSV();upSt();upIns()});$('bds').addEventListener('click',()=>{sel.clear();rSV();upSt();upIns()});
$('bcl').addEventListener('click',bCl);$('bsw').addEventListener('click',()=>{if(sel.size!==2)return;const keys=[...sel];const[r1,c1]=keys[0].split(',').map(Number);const[r2,c2]=keys[1].split(',').map(Number);doSw(r1,c1,r2,c2);sel.clear()});$('btt').addEventListener('click',bTg);$('bcfm').addEventListener('click',()=>{if(!sel.size)return;const b=[];sel.forEach(k=>{const[r,c]=k.split(',').map(Number);b.push({r,c,p:JSON.parse(JSON.stringify(gc(r,c)))})});H.push({t:'bk',b});b.forEach(({r,c})=>{const cell=gc(r,c);cell.fl=false;cell.rt='Multi'});sel.forEach(k=>chgMap[k]='bk');lg('Cleared F/M on '+b.length);render()});$('bsf').addEventListener('click',()=>{rebuildCatDropdowns();$('m2').classList.add('open')});
$('bzi').addEventListener('click',()=>{zm=Math.min(200,zm+10);render()});$('bzo').addEventListener('click',()=>{zm=Math.max(50,zm-10);render()});
$('bex').addEventListener('click',()=>{const rows=[['Row','Lane','Chute','Filter','Type','ADV','Previous Filter','Previous Type','Previous ADV','Type Changed','Note','Changed']];G.forEach((row,ri)=>row.cells.forEach((cell,ci)=>{const chg=isChanged(ri,ci);const orig=chg?oc(ri,ci):null;const typeFlip=chg&&orig&&orig.fl!==cell.fl?((orig.fl?'D2C':'Multi')+' -> '+(cell.fl?'D2C':'Multi')):'';rows.push([row.rn,cell.ln,cell.id,cell.f,cell.rt,cell.adv||'',chg?(orig.f||''):'',chg?(orig.fl?'D2C (FLAT)':'Multi'):'',chg?(orig.adv||''):'',typeFlip,notes[K(ri,ci)]||'',chg?'YES':''])}));const csv='\\uFEFF'+rows.map(r=>r.map(v=>'\"'+String(v).replace(/\"/g,'\"\"')+'\"').join(',')).join('\\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tcy5-layout-'+new Date().toISOString().slice(0,10)+'.csv';a.click()});
$('bexc').addEventListener('click',()=>{const rows=[['Chute','Row','Lane','What Changed','Previous Filter','New Filter','Previous Type','New Type','Previous ADV','New ADV','ADV Delta','Note']];for(let r=0;r<G.length;r++)for(let c=0;c<G[r].cells.length;c++){if(isChanged(r,c)){const cur=gc(r,c),orig=oc(r,c);const changes=[];if(orig.f!==cur.f)changes.push('Filter: '+orig.f+' -> '+cur.f);if(orig.fl!==cur.fl)changes.push('Type: '+(orig.fl?'D2C':'Multi')+' -> '+(cur.fl?'D2C':'Multi'));if(orig.adv!==cur.adv)changes.push('ADV: '+(orig.adv||0)+' -> '+(cur.adv||0));const delta=(cur.adv||0)-(orig.adv||0);rows.push([cur.id,G[r].rn,cur.ln,changes.join(' | '),orig.f||'(empty)',cur.f||'(empty)',orig.fl?'D2C (FLAT)':'Multi',cur.fl?'D2C (FLAT)':'Multi',orig.adv||0,cur.adv||0,delta>0?'+'+delta:delta,notes[K(r,c)]||''])}}if(rows.length<=1){alert('No changes to export');return}const csv='\\uFEFF'+rows.map(r=>r.map(v=>'\"'+String(v).replace(/\"/g,'\"\"')+'\"').join(',')).join('\\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tcy5-changes-'+new Date().toISOString().slice(0,10)+'.csv';a.click()});
$('bss').addEventListener('click',()=>{const btn=$('bss');btn.textContent='\\u23f3 Capturing...';btn.disabled=true;const target=document.querySelector('#zoom-wrap')||$('gw');html2canvas(target,{backgroundColor:'#0b0b1e',scale:2,useCORS:true,logging:false}).then(canvas=>{canvas.toBlob(blob=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='tcy5-layout-'+new Date().toISOString().slice(0,10)+'.png';a.click();URL.revokeObjectURL(url);btn.textContent='\\ud83d\\udcf8 Screenshot';btn.disabled=false},'image/png')}).catch(()=>{alert('Screenshot failed');btn.textContent='\\ud83d\\udcf8 Screenshot';btn.disabled=false})});
$('bal').addEventListener('click',()=>{$('nf').value='';$('na').value='';$('nty').value='Multi';rebuildCatDropdowns();$('nca').value='AMZL_NEW';$('m1').classList.add('open')});$('mc1').addEventListener('click',()=>$('m1').classList.remove('open'));
$('mc2').addEventListener('click',()=>{const f=$('nf').value.trim();if(!f){alert('Enter filter');return}const adv=parseInt($('na').value)||0;const t=$('nty').value;let cat=$('nca').value;
if(cat==='__CUSTOM__'){const cname=$('ncc-name').value.trim();const ccolor=$('ncc-color').value;if(!cname){alert('Enter custom category name');return}cat='CUSTOM_'+cname.toUpperCase().replace(/[^A-Z0-9]/g,'_');WC[cat]={b:ccolor,t:getBrightness(ccolor)<128?'#fff':'#000',l:cname};updateLegend()}
pm={f,adv,fl:t==='D2C',rt:t,cat,ro:f};$('m1').classList.remove('open');$('pb').classList.add('on');render()});
$('nca').addEventListener('change',()=>{$('custom-cat-fields').style.display=$('nca').value==='__CUSTOM__'?'block':'none'});
function getBrightness(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return(r*299+g*587+b*114)/1000}
function rebuildCatDropdowns(){const skip=['EMPTY','FPD'];const opts=Object.entries(WC).filter(([k])=>!skip.includes(k)).map(([k,v])=>'<option value=\"'+k+'\">'+E(v.l)+'</option>').join('')+'<option value=\"__CUSTOM__\">+ Custom Color\\u2026</option>';$('nca').innerHTML=opts;$('bc').innerHTML=opts}
function updateLegend(){const counts={};for(const row of G)for(const cell of row.cells){const cat=cell.cat||'EMPTY';if(cat!=='EMPTY')counts[cat]=(counts[cat]||0)+1}let h='<span class=\"lg-label\">Legend</span>';for(const[k,v]of Object.entries(WC)){if(k==='EMPTY'||!counts[k])continue;h+='<span class=\"lg-i\"><span class=\"lg-s\" style=\"background:'+v.b+'\"></span>'+E(v.l)+' <span style=\"opacity:.5;font-size:9px\">('+counts[k]+')</span></span>'}document.querySelector('.lg').innerHTML=h}
$('pb').addEventListener('click',exitPM);$('bc1').addEventListener('click',()=>$('m2').classList.remove('open'));
$('bc').addEventListener('change',()=>{$('custom-cat-fields-2').style.display=$('bc').value==='__CUSTOM__'?'block':'none'});
$('bc2').addEventListener('click',()=>{const f=$('bf').value.trim();if(!f){alert('Enter filter');return}const adv=parseInt($('ba').value)||null;let cat=$('bc').value;
if(cat==='__CUSTOM__'){const cname=$('bcc-name').value.trim();const ccolor=$('bcc-color').value;if(!cname){alert('Enter custom category name');return}cat='CUSTOM_'+cname.toUpperCase().replace(/[^A-Z0-9]/g,'_');WC[cat]={b:ccolor,t:getBrightness(ccolor)<128?'#fff':'#000',l:cname};updateLegend()}
const b=[];sel.forEach(k=>{const[r,c]=k.split(',').map(Number);b.push({r,c,p:JSON.parse(JSON.stringify(gc(r,c)))})});H.push({t:'bk',b});b.forEach(({r,c})=>{const cell=gc(r,c);cell.f=f;if(adv!=null)cell.adv=adv;cell.cat=cat;cell.ro=f});lg('Set '+f+' on '+b.length);$('m2').classList.remove('open');render()});
$('si').addEventListener('input',e=>{st=e.target.value.trim().toLowerCase();render()});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&e.key==='a'){e.preventDefault();G.forEach((row,r)=>row.cells.forEach((_,c)=>{if(!isLocked(r,c))sel.add(K(r,c))}));rSV();upSt();upIns()}else if(e.key==='Escape'){sel.clear();exitPM();document.querySelectorAll('.mo').forEach(m=>m.classList.remove('open'));rSV();upSt();upIns()}else if(e.key==='Delete'||e.key==='Backspace'){if(sel.size)bCl()}else if(e.key==='s'&&!e.ctrlKey){sm=!sm;upSt()}});

// ── Unified mouse system: click, lasso select, drag-swap ────
let mdn=false,mstart=null,mlasso=false,mdrag=false,mthresh=5,mstartCell=null,preSelSnapshot=null;
let dragGhost=null;
const gw=$('gw');

gw.addEventListener('mousedown',function(e){
  if(e.button!==0||showOrig)return;
  const cell=e.target.closest('.c');
  if(pm){
    // Place mode: just record the click target, no drag/lasso
    if(cell){
      mdn=true;mlasso=false;mdrag=false;
      mstartCell={r:+cell.dataset.r,c:+cell.dataset.c,el:cell};
      mstart={x:e.clientX,y:e.clientY,gx:0,gy:0};
    }
    e.preventDefault();return;
  }
  mdn=true;mlasso=false;mdrag=false;
  const rect=gw.getBoundingClientRect();
  mstart={x:e.clientX,y:e.clientY,gx:e.clientX-rect.left,gy:e.clientY-rect.top};
  mstartCell=cell?{r:+cell.dataset.r,c:+cell.dataset.c,el:cell}:null;
  preSelSnapshot=e.ctrlKey||e.metaKey?new Set(sel):null;
  e.preventDefault();
});

document.addEventListener('mousemove',function(e){
  if(!mdn)return;
  const dx=e.clientX-mstart.x,dy=e.clientY-mstart.y,dist=Math.sqrt(dx*dx+dy*dy);
  if(!mlasso&&!mdrag&&dist<mthresh)return;

  if(!mlasso&&!mdrag){
    if(mstartCell){
      // Started on a cell — this is a drag-swap
      mdrag=true;
      mstartCell.el.classList.add('drg');
      // Create ghost element following cursor
      dragGhost=document.createElement('div');
      const gc2=gc(mstartCell.r,mstartCell.c);
      dragGhost.textContent=gc2.id+' ('+E(gc2.f||'empty').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')+')';
      dragGhost.style.cssText='position:fixed;padding:4px 10px;background:var(--accent);color:#000;border-radius:4px;font-size:10px;font-weight:600;pointer-events:none;z-index:300;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.4)';
      document.body.appendChild(dragGhost);
    } else {
      // Started on empty space — lasso
      mlasso=true;
      if(!e.ctrlKey&&!e.metaKey)sel.clear();
      $('lasso').style.display='block';
    }
  }

  if(mdrag&&dragGhost){
    dragGhost.style.left=(e.clientX+12)+'px';
    dragGhost.style.top=(e.clientY+12)+'px';
    // Highlight drop target
    document.querySelectorAll('.c.dov').forEach(x=>x.classList.remove('dov'));
    const target=document.elementFromPoint(e.clientX,e.clientY);
    const targetCell=target?target.closest('.c'):null;
    if(targetCell&&(+targetCell.dataset.r!==mstartCell.r||+targetCell.dataset.c!==mstartCell.c)){
      targetCell.classList.add('dov');
    }
  }

  if(mlasso){
    const rect=gw.getBoundingClientRect();
    const cx=e.clientX-rect.left,cy=e.clientY-rect.top;
    const x=Math.min(mstart.gx,cx),y=Math.min(mstart.gy,cy);
    const w=Math.abs(cx-mstart.gx),h=Math.abs(cy-mstart.gy);
    const lassoEl=$('lasso');
    lassoEl.style.left=x+'px';lassoEl.style.top=y+'px';
    lassoEl.style.width=w+'px';lassoEl.style.height=h+'px';
    const lRect={left:rect.left+x,top:rect.top+y,right:rect.left+x+w,bottom:rect.top+y+h};
    if(preSelSnapshot)sel=new Set(preSelSnapshot);else sel.clear();
    document.querySelectorAll('.c').forEach(el=>{
      const cr=el.getBoundingClientRect();
      const overlap=!(cr.right<lRect.left||cr.left>lRect.right||cr.bottom<lRect.top||cr.top>lRect.bottom);
      const rr=+el.dataset.r,cc=+el.dataset.c;
      if(overlap&&!isLocked(rr,cc))sel.add(K(rr,cc));
    });
    rSV();upSt();
  }
});

document.addEventListener('mouseup',function(e){
  if(!mdn)return;
  const wasLasso=mlasso,wasDrag=mdrag;
  mdn=false;
  $('lasso').style.display='none';$('lasso').style.width='0';$('lasso').style.height='0';

  // Clean up drag visuals
  if(dragGhost){document.body.removeChild(dragGhost);dragGhost=null}
  document.querySelectorAll('.c.drg').forEach(x=>x.classList.remove('drg'));
  document.querySelectorAll('.c.dov').forEach(x=>x.classList.remove('dov'));

  if(wasDrag&&mstartCell){
    // Find drop target
    const target=document.elementFromPoint(e.clientX,e.clientY);
    const targetCell=target?target.closest('.c'):null;
    if(targetCell){
      const r2=+targetCell.dataset.r,c2=+targetCell.dataset.c;
      if(r2!==mstartCell.r||c2!==mstartCell.c){
        doSw(mstartCell.r,mstartCell.c,r2,c2);
      }
    }
    mlasso=false;mdrag=false;mstartCell=null;preSelSnapshot=null;
    return;
  }

  if(wasLasso){
    upSt();upIns();
    mlasso=false;mstartCell=null;preSelSnapshot=null;
    return;
  }

  // No drag happened — this is a click
  if(mstartCell){
    const r=mstartCell.r,c=mstartCell.c,key=K(r,c);
    if(pm){
      if(isLocked(r,c)){mlasso=false;mdrag=false;mstartCell=null;preSelSnapshot=null;return}
      const cell=gc(r,c);
      H.push({t:'pl',r,c,prev:JSON.parse(JSON.stringify(cell))});
      lg('\\ud83c\\udd95 '+E(pm.f)+' \\u2192 '+E(cell.id));
      chgMap[K(r,c)]='pl';
      for(const k of KS)cell[k]=pm[k];
      exitPM();
    } else if(isLocked(r,c)){mlasso=false;mdrag=false;mstartCell=null;preSelSnapshot=null;return
    } else if(e.shiftKey&&lci){
      const[lr,lc]=lci.split(',').map(Number);
      for(let ri=Math.min(r,lr);ri<=Math.max(r,lr);ri++)
        for(let ci=Math.min(c,lc);ci<=Math.max(c,lc);ci++)
          if(!isLocked(ri,ci))sel.add(K(ri,ci));
    } else if(e.ctrlKey||e.metaKey){
      if(!isLocked(r,c)){sel.has(key)?sel.delete(key):sel.add(key)}
    } else {
      sel.clear();if(!isLocked(r,c))sel.add(key);
    }
    lci=key;
    rSV();upSt();upIns();
  } else {
    if(!e.ctrlKey&&!e.metaKey){sel.clear();rSV();upSt();upIns()}
  }
  mlasso=false;mdrag=false;mstartCell=null;preSelSnapshot=null;
});

render();

// ── Screenshot: capture grid + legend as PNG ────────────────
$('bss').addEventListener('click', async ()=>{
  $('bss').disabled=true;$('bss').textContent='⏳ Capturing...';
  if(!window.html2canvas){
    await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)});
  }
  const wrap=document.createElement('div');
  wrap.style.cssText='position:absolute;left:-9999px;top:0;background:#0b0b1e;padding:16px;';
  const hdr=document.createElement('div');
  hdr.style.cssText='padding:10px 16px;margin-bottom:8px;font-family:Inter,sans-serif;color:#e8e8f0;font-size:16px;font-weight:700;';
  hdr.textContent='TCY5 Floor Layout — '+new Date().toLocaleDateString();
  wrap.appendChild(hdr);
  const lgClone=document.querySelector('.lg').cloneNode(true);
  lgClone.style.cssText+='padding:8px 16px;margin-bottom:8px;background:#111128;border:1px solid #2a2a55;border-radius:6px;';
  wrap.appendChild(lgClone);
  const gridEl=document.getElementById('zoom-wrap')||document.querySelector('table.fg');
  const gridClone=gridEl.cloneNode(true);
  gridClone.style.transform='none';
  wrap.appendChild(gridClone);
  document.body.appendChild(wrap);
  try{
    const canvas=await html2canvas(wrap,{backgroundColor:'#0b0b1e',scale:2,useCORS:true});
    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download='tcy5-layout-'+new Date().toISOString().slice(0,10)+'.png';
    a.click();
  }catch(e){alert('Screenshot failed: '+e.message)}
  document.body.removeChild(wrap);
  $('bss').disabled=false;$('bss').textContent='📸 Screenshot';
});
`;

const fullHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TCY5 Floor Layout Designer</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<style>${css}</style></head>
<body>
${body}
<script>${scriptContent}<\/script>
</body></html>`;

mkdirSync(join(__dirname, 'dist'), { recursive: true });
writeFileSync(join(__dirname, 'dist', 'design-tool.html'), fullHtml, 'utf8');
console.log('Done! dist/design-tool.html');
