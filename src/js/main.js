/**
 * main.js — TCY5 AMZL Lane Launches orchestrator
 *
 * Wires file input, parses workbook sheets via SheetJS,
 * runs validation & assignment pipeline, and initialises all panels.
 *
 * Requirements: 1.1, 2.1, 6.1, 7.1
 */

// ── Data parsers ────────────────────────────────────────────
import { parseSpotSheet, validateSpotData } from './data/spot-parser.js';
import { parseSortationRules } from './data/stem-parser.js';
import {
  parseLaneGeometry,
  ALLOWED_AMZL_LANES,
  EXCLUDED_CHUTES_LANE_5_6,
  MAX_CHUTE_ADV,
  PRESERVED_ASSIGNMENTS,
} from './data/tcy5-config.js';

// ── Utils ───────────────────────────────────────────────────
import { generateAssignments, splitOverCapacity } from './utils/chute-assign.js';
import { validateChuteCapacity } from './utils/volume-validator.js';
import { generateStemFile, validateStemFile } from './utils/stem-generator.js';

// ── Components ──────────────────────────────────────────────
import { renderKpiBar } from './components/kpi-bar.js';
import { initTabNav } from './components/tab-nav.js';
import { showAlert, clearAlert } from './components/alert-bar.js';

// ── Panels ──────────────────────────────────────────────────
import { renderSpotVolume } from './panels/spot-volume.js';
import { renderSpaoAssignments } from './panels/spao-assignments.js';
import { renderFloorLayoutGrid } from './panels/floor-layout-grid.js';
import { renderChangeOverview, generateChangeOverview } from './panels/change-overview.js';
import { renderOpsChecklist } from './panels/ops-checklist.js';

// ── File input & data pipeline ──────────────────────────────

/**
 * Handle XLSX file selection, parse sheets, run pipeline, render panels.
 */
function handleFileLoad(event) {
  const file = event.target.files[0];
  if (!file) return;

  const alertBar = document.getElementById('alert-bar');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      /* global XLSX */
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      // Check for required sheets (accept 'layout' or 'layout_view')
      const layoutSheet = workbook.SheetNames.includes('layout_view') ? 'layout_view'
        : workbook.SheetNames.includes('layout') ? 'layout' : null;
      const sheetNames = ['Sortation_Rules', 'SPOT_Data', 'New_AMZ_Lanes'];
      const missing = sheetNames.filter((s) => !workbook.SheetNames.includes(s));
      if (!layoutSheet || missing.length) {
        const allMissing = layoutSheet ? missing : ['layout_view/layout', ...missing];
        showAlert(alertBar, `Missing sheets: ${allMissing.join(', ')}`, 'error');
        return;
      }

      clearAlert(alertBar);

      // ── 1. Parse layout_view → lane geometry ────────────────
      const geometry = parseLaneGeometry(workbook.Sheets[layoutSheet]);

      // ── 2. Parse SPOT_Data + New_AMZ_Lanes → merge → validate ─
      const spotRoutes = parseSpotSheet(workbook.Sheets['SPOT_Data']);
      const newLaneRoutes = parseSpotSheet(workbook.Sheets['New_AMZ_Lanes']);

      // New_AMZ_Lanes uses Route Name (e.g. "TCY9->DCK6-CYC1") as the
      // identifier the validator checks. Map routeName → parentStackingFilter
      // so validation finds the 3 required routes.
      for (const r of newLaneRoutes) {
        if (r.routeName && (!r.parentStackingFilter || r.parentStackingFilter.includes('PARENT'))) {
          r.parentStackingFilter = r.routeName;
        }
      }

      const routes = [...spotRoutes, ...newLaneRoutes];
      const spotValidation = validateSpotData(routes);

      if (!spotValidation.valid) {
        showAlert(
          alertBar,
          `SPOT data invalid: ${spotValidation.errors.map((e) => e.message).join('; ')}`,
          'error'
        );
        // Still render SPOT panel so user can see what's wrong
        renderSpotVolume(document.getElementById('panel-spot-volume'), routes, spotValidation);
        return;
      }

      // ── 3. Parse Sortation_Rules → existing rules ───────────
      const existingRules = parseSortationRules(workbook.Sheets['Sortation_Rules']);

      // ── 4. Build chutesPerLane map from geometry ────────────
      // Lanes are columns. The last 2 digits of each chute ID
      // indicate the lane number (e.g. 20106 → lane 6, 21621 → lane 21).
      const chutesPerLane = {};
      for (const row of geometry) {
        const details = row.chuteDetails || [];
        for (const d of details) {
          const id = String(d.chuteId);
          const laneNum = parseInt(id.slice(-2), 10);
          if (!isNaN(laneNum)) {
            if (!chutesPerLane[laneNum]) chutesPerLane[laneNum] = [];
            chutesPerLane[laneNum].push(d.chuteId);
          }
        }
      }

      // ── 5. Run assignment engine ────────────────────────────
      const config = {
        ALLOWED_AMZL_LANES,
        EXCLUDED_CHUTES_LANE_5_6,
        PRESERVED_ASSIGNMENTS,
        chutesPerLane,
        geometry,
      };
      const rawAssignments = generateAssignments(routes, existingRules, config);

      // ── 6. Split over-capacity chutes ───────────────────────
      const assignments = splitOverCapacity(rawAssignments, MAX_CHUTE_ADV);

      // ── 7. Validate capacity (for warnings) ─────────────────
      const violations = validateChuteCapacity(assignments);

      // ── 8. Generate STEM file ───────────────────────────────
      const stemFile = generateStemFile(existingRules, assignments, PRESERVED_ASSIGNMENTS);
      const stemValidation = validateStemFile(stemFile);

      // Show STEM validation warnings in alert bar if invalid
      if (!stemValidation.valid) {
        showAlert(
          alertBar,
          `STEM validation: ${stemValidation.errors.map((e) => e.message).join('; ')}`,
          'warning'
        );
      }

      // ── 9. Build old assignments from existing rules for change overview
      const oldAssignments = existingRules.map((r) => ({
        chuteId: r.chute,
        lane: r.lane,
        routeCode: r.stackingFilter,
        chuteType: r.resourceType,
        resourceLabel: r.resourceLabel,
        assignedAdv: 0,
        volumeCategory: '',
        isDuplicate: false,
      }));

      // ── 10. Generate change overview items for ops checklist
      const changeOverviewItems = generateChangeOverview(oldAssignments, assignments);

      // ── 11. Render KPI bar ──────────────────────────────────
      const newLanesAdded = new Set(assignments.map((a) => a.routeCode)).size;
      const totalChutesAssigned = assignments.length;
      const totalAdv = assignments.reduce((sum, a) => sum + a.assignedAdv, 0);

      renderKpiBar(document.getElementById('kpi-bar'), {
        newLanesAdded,
        totalChutesAssigned,
        totalAdv,
      });

      // ── 12. Render all panels ───────────────────────────────
      renderSpotVolume(
        document.getElementById('panel-spot-volume'),
        routes,
        spotValidation
      );

      renderSpaoAssignments(
        document.getElementById('panel-spao-assignments'),
        assignments,
        violations
      );

      renderFloorLayoutGrid(
        document.getElementById('panel-floor-layout-grid'),
        geometry,
        assignments,
        PRESERVED_ASSIGNMENTS
      );

      renderChangeOverview(
        document.getElementById('panel-change-overview'),
        oldAssignments,
        assignments,
        ALLOWED_AMZL_LANES
      );

      renderOpsChecklist(
        document.getElementById('panel-ops-checklist'),
        changeOverviewItems
      );

    } catch (err) {
      console.error('Pipeline error:', err);
      showAlert(alertBar, `Unable to load TCY5_Data.xlsx. Check file path and format. (${err.message})`, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Init ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTabNav(
    document.getElementById('tab-nav'),
    document.getElementById('panel-container')
  );

  const fileInput = document.getElementById('xlsx-file');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileLoad);
  }
});
