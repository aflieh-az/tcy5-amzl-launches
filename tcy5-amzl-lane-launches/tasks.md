# Implementation Plan: TCY5 AMZL Lane Launches

## Overview

Implement the TCY5 AMZL lane launch system as a vanilla JS / ES modules single-page app with SheetJS for XLSX parsing. The system parses TCY5_Data.xlsx, assigns chutes to 3 new AMZL routes (DCK6-CYC1, DFA5-CYC1, DSR2-CYC1), renders a spatial floor layout grid matching the layout_view tab structure, generates a STEM file, produces a Change Overview, and provides an Ops checklist (AR only — NC is out of scope). All code lives under `tcy5_amzl_launches/src/`.

## Tasks

- [x] 1. Project scaffolding and TCY5 configuration
  - [x] 1.1 Create directory structure and entry point
    - Create `tcy5_amzl_launches/src/` with subdirectories: `js/data/`, `js/utils/`, `js/components/`, `js/panels/`, `css/`
    - Create `tcy5_amzl_launches/src/index.html` with SheetJS CDN script tag, tab navigation shell, and panel target `<div>` elements
    - Create `tcy5_amzl_launches/src/js/main.js` as the orchestrator: imports parsers, wires tab navigation, triggers panel rendering on data load
    - _Requirements: 1.1, 2.1, 4.1_

  - [x] 1.2 Implement `tcy5-config.js` with facility constants
    - Create `tcy5_amzl_launches/src/js/data/tcy5-config.js`
    - Export `ALLOWED_AMZL_LANES` as `[5, 6, 7, 12, 19, 20]`
    - Export `EXCLUDED_CHUTES_LANE_5_6` as `['20105', '20106', '21605', '21606']`
    - Export `MAX_CHUTE_ADV` as `1800`
    - Export `PRESERVED_ASSIGNMENTS` array with Chico (ARSC-21620, Multi), Facebook smalls (ARSC-20220-FLAT, D2C), and Facebook large entries
    - Export the 3 new route definitions: TCY9→DCK6-CYC1, TCY9→DFA5-CYC1, TCY9→DSR2-CYC1 with their known ADV breakdowns
    - _Requirements: 2.2, 2.3, 3.1, 4.3_

- [x] 2. Data parsers — SPOT and STEM
  - [x] 2.1 Implement `spot-parser.js`
    - Create `tcy5_amzl_launches/src/js/data/spot-parser.js`
    - Implement `parseSpotSheet(worksheet)` → returns array of SpotRoute objects with fields: `sortScheme`, `parentStackingFilter`, `programType`, `totalAdv`, `smallsAdv`, `nonconAdv`, `largeAdv`
    - Implement `validateSpotData(routes)` → returns `{ valid, errors, warnings }`. Rejects if any ADV field is missing, non-numeric, or negative. Rejects if any of the 3 required routes is absent.
    - Use SheetJS `XLSX.utils.sheet_to_json` for row extraction
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.2 Write property test for SPOT parser (Property 1)
    - **Property 1: SPOT parsing produces complete volume breakdowns or rejects incomplete data**
    - Use fast-check to generate random worksheet rows with valid/invalid/missing ADV fields
    - Assert: valid rows produce SpotRoute with non-negative ADV fields; invalid rows produce ValidationResult with `valid === false`
    - **Validates: Requirements 1.1, 1.3**

  - [x] 2.3 Implement `stem-parser.js`
    - Create `tcy5_amzl_launches/src/js/data/stem-parser.js`
    - Implement `parseSortationRules(worksheet)` → returns array of SortationRule objects with fields: `lane`, `stackingFilter`, `vsm`, `resourceLabel`, `resourceType`, `chute`, `sorter`
    - Implement `validateStemIntegrity(rules)` → returns `{ valid, errors, warnings }`. Checks for required fields, valid lane numbers, consistent resourceType values.
    - _Requirements: 6.1, 7.1_

  - [x] 2.4 Implement `parseLaneGeometry` in `tcy5-config.js`
    - Add `parseLaneGeometry(layoutSheet)` function that reads the `layout_view` tab from TCY5_Data.xlsx
    - Returns array of LaneGeometry objects: `{ lane, gridRow, gridCol, chutes, waveGroup }`
    - The geometry must match the exact structure from the layout_view tab — row/column positions, chute ordering, wave groupings
    - _Requirements: 4.1, 4.4_

- [x] 3. Assignment engine and volume validation
  - [x] 3.1 Implement `chute-assign.js`
    - Create `tcy5_amzl_launches/src/js/utils/chute-assign.js`
    - Implement `classifyChute(chuteId)` → returns `'D2C'` if chuteId ends in `-FLAT`, else `'Multi'`
    - Implement `isExcluded(chuteId, lane)` → returns `true` if chuteId is in EXCLUDED_CHUTES_LANE_5_6 and lane is 5 or 6
    - Implement `generateAssignments(routes, existingRules, config)` → returns ChuteAssignment array. Assigns FLAT chutes to Smalls volume, non-FLAT to Large/Mixed. Only uses allowed lanes. Skips excluded chutes for lanes 5 & 6. Preserves existing assignments (Chico, Facebook).
    - Implement `splitOverCapacity(assignments, maxAdv)` → duplicates any assignment exceeding 1800 ADV, splitting volume evenly across chutes. Sets `isDuplicate = true` on split chutes. Preserves total ADV per route.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.3_

  - [x] 3.2 Write property tests for assignment engine (Properties 2, 3, 4)
    - **Property 2: Assignments use only allowed AMZL lanes**
    - **Property 3: Excluded chutes are never assigned to lanes 5 or 6**
    - **Property 4: FLAT suffix determines chute type and volume category**
    - Use fast-check to generate random routes and config, assert lane/chute/type constraints hold
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [x] 3.3 Implement `volume-validator.js`
    - Create `tcy5_amzl_launches/src/js/utils/volume-validator.js`
    - Implement `validateChuteCapacity(assignments)` → returns array of CapacityViolation objects for any chute with `assignedAdv > 1800`
    - Implement `computeChuteAdv(assignment)` → returns the ADV number for a single assignment
    - _Requirements: 3.1, 3.3_

  - [x] 3.4 Write property tests for volume splitting (Properties 5, 6)
    - **Property 5: Volume splitting keeps all chutes at or below 1800 ADV and preserves total volume**
    - **Property 6: Capacity violation warning on manual override**
    - Use fast-check to generate assignments with random ADV values, assert post-split all ≤ 1800 and total preserved; assert violations flagged when ADV > 1800 without split
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 4. Checkpoint — Core logic validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. STEM generator
  - [x] 5.1 Implement `stem-generator.js`
    - Create `tcy5_amzl_launches/src/js/utils/stem-generator.js`
    - Implement `generateStemFile(existingRules, newAssignments, preservedAssignments)` → returns StemFile object with merged rules array and metadata (`generatedAt`, `facility: "TCY5"`, `version`)
    - Existing rules for unaffected lanes pass through unchanged
    - New assignments are converted to SortationRule format and merged
    - Preserved assignments (Chico, Facebook) are always included
    - Implement `validateStemFile(file)` → checks for missing required fields (`chute`, `stackingFilter`, `lane`, `resourceType`), catches unintentional duplicates (same chute + stackingFilter where neither is marked as intentional duplicate)
    - Implement `exportStemBlob(file)` → generates a downloadable Blob in STEM-compatible format
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1_

  - [x] 5.2 Write property tests for STEM generator (Properties 10, 11, 12, 13)
    - **Property 10: STEM file round-trip** — generate then parse back produces equivalent rules
    - **Property 11: Existing unaffected rules are preserved in STEM output**
    - **Property 12: No unintentional duplicate chute-to-route entries in STEM**
    - **Property 13: STEM validation rejects malformed files**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 6. Grid renderer and floor layout panel
  - [x] 6.1 Implement `grid-renderer.js`
    - Create `tcy5_amzl_launches/src/js/utils/grid-renderer.js`
    - Implement `renderFloorGrid(geometry, assignments, preserved)` → returns SVG markup string. Renders the spatial grid matching the layout_view tab structure from TCY5_Data.xlsx. Each lane occupies its correct grid position. Preserved assignments rendered in their fixed positions.
    - Implement `renderGridCell(chute)` → returns SVG cell markup containing chute ID, route code, and ADV text
    - Lane boundaries are visually distinct (thicker borders or color separation)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 6.2 Write property tests for grid renderer (Properties 7, 8)
    - **Property 7: Grid cell rendering includes chute ID, route code, and ADV**
    - **Property 8: Chute assignments respect lane boundaries**
    - Use fast-check to generate random assignments and geometry, assert cell content and lane membership
    - **Validates: Requirements 4.2, 4.4**

  - [x] 6.3 Implement `floor-layout-grid.js` panel
    - Create `tcy5_amzl_launches/src/js/panels/floor-layout-grid.js`
    - Panel reads lane geometry and assignments, calls `renderFloorGrid`, and sets `innerHTML` on its target div
    - Displays chute cells with color coding by route and highlights preserved assignments
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Remaining panels — SPOT, SPAO, Change Overview, STEM Editor, Ops Checklist
  - [x] 7.1 Implement `spot-volume.js` panel
    - Create `tcy5_amzl_launches/src/js/panels/spot-volume.js`
    - Renders ADV table for the 3 routes with columns: Route, Total ADV, Smalls, Large
    - Shows validation status (green check or red error) per route
    - If SPOT data is incomplete, displays inline error and blocks downstream panels
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 7.2 Implement `spao-assignments.js` panel
    - Create `tcy5_amzl_launches/src/js/panels/spao-assignments.js`
    - Renders chute-to-route recommendation table from assignment engine output
    - Columns: Chute ID, Lane, Route, Chute Type, ADV, Duplicate flag
    - Highlights any capacity violations with warning badges
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.3_

  - [x] 7.3 Implement `change-overview.js` panel
    - Create `tcy5_amzl_launches/src/js/panels/change-overview.js`
    - Compares old vs. new assignments to generate ChangeOverviewItem list
    - Displays PanD2C_Flip and 5S_Square changes grouped by lane
    - If no changes for a lane, explicitly states "No floor changes needed for Lane X"
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 7.4 Write property tests for change overview (Properties 9, 15)
    - **Property 9: Change overview items are complete and reflect actual diffs**
    - **Property 15: Ops checklist covers all change overview items**
    - **Validates: Requirements 5.1, 5.2, 8.1**

  - [x] 7.5 Implement `stem-editor.js` panel
    - Create `tcy5_amzl_launches/src/js/panels/stem-editor.js`
    - Renders STEM file preview as a table of all rules (existing + new)
    - Shows validation status from `validateStemFile`
    - Inline errors for duplicates or missing fields
    - Download button calls `exportStemBlob` — disabled if validation fails
    - Flags grid-STEM discrepancies with reconciliation prompt
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3_

  - [x] 7.6 Write property test for grid-STEM consistency (Property 14)
    - **Property 14: Grid and STEM consistency**
    - Assert: any chute-to-route mapping in grid but not in STEM (or vice versa) is flagged; no grid assignment saveable without STEM entry
    - **Validates: Requirements 7.2, 7.3**

  - [x] 7.7 Implement `ops-checklist.js` panel (AR only — NC out of scope)
    - Create `tcy5_amzl_launches/src/js/panels/ops-checklist.js`
    - Generates OpsChecklistItem array from finalized Change Overview
    - Each item has: description, lane, changeType, responsibleParty, targetDate (3/22 or 3/23), completed checkbox
    - Includes AR floor layout confirmation checkbox (`isArLayout: true`)
    - NC-related items are excluded (out of scope)
    - Warning banner if any item incomplete at launch date
    - Go-live button blocked if AR layout confirmation is not checked
    - _Requirements: 8.1, 8.2, 8.3, 9.2_

  - [x] 7.8 Write property tests for Ops checklist and AR go-live gate (Properties 16, 17)
    - **Property 16: Incomplete checklist triggers warning**
    - **Property 17: AR layout confirmation gates go-live**
    - **Validates: Requirements 8.3, 9.2**

- [x] 8. UI components and styling
  - [x] 8.1 Implement shared UI components
    - Create `tcy5_amzl_launches/src/js/components/kpi-bar.js` — renders KPI summary cards (total routes, total chutes assigned, volume utilization)
    - Create `tcy5_amzl_launches/src/js/components/tab-nav.js` — tab navigation switching between panels
    - Create `tcy5_amzl_launches/src/js/components/alert-bar.js` — warning/error alert bar for validation messages and discrepancy flags
    - _Requirements: 1.3, 3.3, 7.2_

  - [x] 8.2 Create CSS stylesheets
    - Create `tcy5_amzl_launches/src/css/theme.css` — color variables, typography, facility branding
    - Create `tcy5_amzl_launches/src/css/layout.css` — page layout, tab panel structure, grid container sizing
    - Create `tcy5_amzl_launches/src/css/components.css` — KPI cards, alert bars, table styles, checklist checkboxes, grid cell styles, lane boundary styling
    - _Requirements: 4.1, 4.2_

- [x] 9. Integration wiring and main orchestrator
  - [x] 9.1 Wire `main.js` orchestrator
    - Import all parsers, utils, components, and panels
    - On page load: prompt user to select TCY5_Data.xlsx via file input
    - Parse workbook sheets (`layout_view`, `Sortation_Rules`, `SPOT_Data`, `New_AMZ_Lanes`) using SheetJS
    - Run SPOT validation → if invalid, show alert bar and block
    - Run assignment engine → split over-capacity → validate
    - Generate STEM file from existing rules + new assignments
    - Initialize all panels with parsed data
    - Wire tab navigation to show/hide panels
    - _Requirements: 1.1, 2.1, 6.1, 7.1_

- [x] 10. Final checkpoint — Full integration validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- NC (Non-Conveyable) is explicitly out of scope — no NC signage, NC floor layout, or NC checklist items
- STEM is the single source of truth for all chute assignments
- The floor layout grid must match the exact structure from the layout_view tab in TCY5_Data.xlsx
- All code is vanilla JavaScript with ES modules — no build step, no framework
- SheetJS loaded via CDN for XLSX parsing
- Property tests use fast-check with minimum 100 iterations
- Preserved assignments (Chico, Facebook smalls, Facebook large) must never be overwritten
