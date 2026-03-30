# Design Document — TCY5 AMZL Lane Launches

## 1. Overview

This document describes the technical design for launching 3 new AMZL sortable lanes at the TCY5 (Tracy, CA) sort center. The system automates the MFO Engineer workflow: pulling SPOT volume data, generating SPAO chute-to-route assignments, rendering a spatial floor layout grid, producing a Change Overview, updating the STEM allocation file, and coordinating Ops readiness for the 3/22-23 go-live.

The 3 new routes originate from TCY9:
- **TCY9→DCK6-CYC1** — Total ADV 1,987 (Smalls 1,418 / Noncon 58 / Large 511)
- **TCY9→DFA5-CYC1** — Total ADV 2,476 (Smalls 1,943 / Noncon 24 / Large 509)
- **TCY9→DSR2-CYC1** — Total ADV 3,033 (Smalls 2,231 / Noncon 98 / Large 704)

The system extends the existing MFO Floor Layout Design & Deployment System architecture (vanilla JS, ES modules, inline SVG grid rendering) adapted for TCY5's physical floor topology.

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        index.html                            │
│  (entry point, SheetJS CDN for XLSX parsing)                 │
├──────────────────────────────────────────────────────────────┤
│                         main.js                              │
│  (orchestrates init, data load, panel rendering)             │
├────────────┬────────────┬────────────┬───────────────────────┤
│   data/    │   utils/   │ components/│       panels/         │
│            │            │            │                       │
│ tcy5-      │ chute-     │ kpi-bar    │ spot-volume           │
│  config    │  assign    │ tab-nav    │ spao-assignments      │
│ spot-      │ volume-    │ alert-bar  │ floor-layout-grid     │
│  parser    │  validator │            │ change-overview       │
│ stem-      │ stem-      │            │ stem-editor           │
│  parser    │  generator │            │ ops-checklist         │
│ sortation- │ grid-      │            │                       │
│  rules     │  renderer  │            │                       │
├────────────┴────────────┴────────────┴───────────────────────┤
│                        css/                                  │
│  theme.css  ·  layout.css  ·  components.css                 │
└──────────────────────────────────────────────────────────────┘
```

**Data flow is unidirectional:**

```
XLSX (TCY5_Data.xlsx) → data/ parsers → utils/ validators & assigners → panels/ → DOM
                                              ↓
                                    utils/stem-generator → STEM file download
```

1. **Data Layer** (`data/`): Parses the TCY5_Data.xlsx workbook (sheets: `layout_view`, `Sortation_Rules`, `SPOT_Data`, `New_AMZ_Lanes`) into typed JS objects. Holds TCY5 floor configuration constants (lane boundaries, chute IDs, excluded chutes).
2. **Utility Layer** (`utils/`): Pure functions for chute assignment logic, volume validation (1,800 ADV cap), duplicate chute splitting, STEM file generation, and spatial grid coordinate mapping.
3. **Component Layer** (`components/`): Reusable UI atoms — KPI cards, tab navigation, alert/warning bars.
4. **Panel Layer** (`panels/`): Each panel owns a tab and renders into a target `<div>`. Panels read from data, call utils, and set `innerHTML`.

No module writes back to the data layer. The STEM file is generated as a downloadable blob, not written in-place.

## 3. Components and Interfaces

### 3.1 Data Parsers

```
┌─────────────────────────────────────────────────────┐
│ spot-parser.js                                      │
│                                                     │
│ parseSpotSheet(worksheet) → SpotRoute[]             │
│ validateSpotData(routes) → ValidationResult         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ stem-parser.js                                      │
│                                                     │
│ parseSortationRules(worksheet) → SortationRule[]    │
│ validateStemIntegrity(rules) → ValidationResult     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ tcy5-config.js                                      │
│                                                     │
│ ALLOWED_AMZL_LANES: number[]     // [5,6,7,12,19,20]│
│ EXCLUDED_CHUTES_LANE_5_6: string[] // [20105,20106, │
│                                      21605,21606]   │
│ MAX_CHUTE_ADV: number            // 1800            │
│ PRESERVED_ASSIGNMENTS: PreservedAssignment[]        │
│ parseLaneGeometry(layoutSheet) → LaneGeometry[]     │
└─────────────────────────────────────────────────────┘
```

### 3.2 Assignment Engine

```
┌─────────────────────────────────────────────────────┐
│ chute-assign.js                                     │
│                                                     │
│ generateAssignments(                                │
│   routes: SpotRoute[],                              │
│   existingRules: SortationRule[],                   │
│   config: TCY5Config                                │
│ ) → ChuteAssignment[]                              │
│                                                     │
│ splitOverCapacity(                                   │
│   assignments: ChuteAssignment[],                   │
│   maxAdv: number                                    │
│ ) → ChuteAssignment[]                              │
│                                                     │
│ classifyChute(chuteId: string) → 'D2C' | 'Multi'   │
│ isExcluded(chuteId: string, lane: number) → boolean │
└─────────────────────────────────────────────────────┘
```

### 3.3 Volume Validator

```
┌─────────────────────────────────────────────────────┐
│ volume-validator.js                                 │
│                                                     │
│ validateChuteCapacity(                              │
│   assignments: ChuteAssignment[]                    │
│ ) → CapacityViolation[]                            │
│                                                     │
│ computeChuteAdv(                                    │
│   assignment: ChuteAssignment                       │
│ ) → number                                         │
└─────────────────────────────────────────────────────┘
```

### 3.4 STEM Generator

```
┌─────────────────────────────────────────────────────┐
│ stem-generator.js                                   │
│                                                     │
│ generateStemFile(                                   │
│   existingRules: SortationRule[],                   │
│   newAssignments: ChuteAssignment[],                │
│   preservedAssignments: PreservedAssignment[]       │
│ ) → StemFile                                       │
│                                                     │
│ validateStemFile(file: StemFile) → ValidationResult │
│ exportStemBlob(file: StemFile) → Blob              │
└─────────────────────────────────────────────────────┘
```

### 3.5 Grid Renderer

```
┌─────────────────────────────────────────────────────┐
│ grid-renderer.js                                    │
│                                                     │
│ renderFloorGrid(                                    │
│   geometry: LaneGeometry[],                         │
│   assignments: ChuteAssignment[],                   │
│   preserved: PreservedAssignment[]                  │
│ ) → string (SVG markup)                            │
│                                                     │
│ renderGridCell(                                     │
│   chute: ChuteAssignment                            │
│ ) → string (SVG cell markup)                       │
└─────────────────────────────────────────────────────┘
```

### 3.6 Panels

| Panel | File | Renders |
|---|---|---|
| SPOT Volume | `spot-volume.js` | ADV table for 3 routes, validation status |
| SPAO Assignments | `spao-assignments.js` | Chute-to-route recommendation table |
| Floor Layout Grid | `floor-layout-grid.js` | Spatial SVG grid with chute cells |
| Change Overview | `change-overview.js` | PanD2C flips, 5S squares list |
| STEM Editor | `stem-editor.js` | STEM file preview, validation, download |
| Ops Checklist | `ops-checklist.js` | Coordination checklist with checkboxes |


## 4. Data Models

### 4.1 SpotRoute

Parsed from the `SPOT_Data` sheet and `New_AMZ_Lanes` sheet.

```typescript
interface SpotRoute {
  sortScheme: string;        // e.g. "TCY9"
  sortCenter: string;        // e.g. "TCY5"
  parentStackingFilter: string; // e.g. "TCY9->DCK6-CYC1"
  sundayRouteName: string;
  routeName: string;
  wave: string;
  routeStatus: string;
  startDate: string;
  endDate: string;
  programType: string;       // e.g. "AMZL"
  totalAdv: number;          // e.g. 1987
  smallsAdv: number;         // e.g. 1418
  nonconAdv: number;         // e.g. 58
  largeAdv: number;          // e.g. 511
}
```

### 4.2 SortationRule

Parsed from the `Sortation_Rules` sheet (STEM data).

```typescript
interface SortationRule {
  lane: number;              // physical lane number (1-20)
  stackingFilter: string;    // route identifier
  vsm: string;               // Visual Sort Map code
  resourceLabel: string;
  resourceType: string;      // "D2C" | "Multi"
  chute: string;             // e.g. "20501" or "20220-FLAT"
  sorter: string;
}
```

### 4.3 ChuteAssignment

Output of the assignment engine.

```typescript
interface ChuteAssignment {
  chuteId: string;           // e.g. "20501" or "20501-FLAT"
  lane: number;              // target lane (5|6|7|12|19|20)
  routeCode: string;         // e.g. "TCY9->DCK6-CYC1"
  chuteType: 'D2C' | 'Multi'; // derived from chuteId suffix
  assignedAdv: number;       // ADV allocated to this chute
  volumeCategory: 'Smalls' | 'Large' | 'Mixed'; // what this chute handles
  isDuplicate: boolean;      // true if created by volume splitting
  originalChuteId?: string;  // set if isDuplicate, references the source chute
}
```

### 4.4 LaneGeometry

Parsed from the `layout_view` sheet. Defines the spatial position of each lane and its chutes on the TCY5 floor.

```typescript
interface LaneGeometry {
  lane: number;
  gridRow: number;           // row position in spatial grid
  gridCol: number;           // column position in spatial grid
  chutes: string[];          // ordered list of chute IDs in this lane
  waveGroup: string;         // wave grouping identifier
}
```

### 4.5 PreservedAssignment

Hardcoded assignments that must not be modified.

```typescript
interface PreservedAssignment {
  chuteId: string;           // e.g. "ARSC-21620"
  routeCode: string;         // e.g. "Chico"
  chuteType: 'D2C' | 'Multi';
  description: string;       // e.g. "Chico pallet build"
}

// Preserved assignments:
// - ARSC-21620: Chico (pallet build, Multi)
// - ARSC-20220-FLAT: Facebook smalls (D2C)
// - Facebook large: existing Multi chute assignment
```

### 4.6 ChangeOverviewItem

Generated when comparing old vs. new assignments.

```typescript
interface ChangeOverviewItem {
  chuteId: string;
  lane: number;
  changeType: 'PanD2C_Flip' | '5S_Square';
  description: string;       // human-readable change description
  fromState?: string;        // previous configuration
  toState?: string;          // new configuration
}
```

### 4.7 StemFile

The complete STEM-compatible output.

```typescript
interface StemFile {
  rules: SortationRule[];    // all rules (existing + new)
  metadata: {
    generatedAt: string;     // ISO timestamp
    facility: string;        // "TCY5"
    version: string;
  };
}
```

### 4.8 ValidationResult

Shared validation return type.

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
  chuteId?: string;
  lane?: number;
}

interface ValidationWarning {
  field: string;
  message: string;
  chuteId?: string;
}
```

### 4.9 CapacityViolation

Returned by volume validation.

```typescript
interface CapacityViolation {
  chuteId: string;
  lane: number;
  currentAdv: number;
  maxAdv: number;            // 1800
  routeCode: string;
  overageAmount: number;     // currentAdv - maxAdv
}
```

### 4.10 OpsChecklistItem

For the Ops coordination checklist.

```typescript
interface OpsChecklistItem {
  id: string;
  description: string;
  lane: number;
  changeType: string;
  responsibleParty: string;
  targetDate: string;        // "3/22" or "3/23"
  completed: boolean;
  isArLayout: boolean;       // true if AR floor layout update
}
```



## 5. Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SPOT parsing produces complete volume breakdowns or rejects incomplete data

*For any* SPOT worksheet row representing a route, parsing SHALL produce a SpotRoute with non-negative `totalAdv`, `smallsAdv`, `nonconAdv`, and `largeAdv` fields — or, if any field is missing/invalid, the validator SHALL return a ValidationResult with `valid === false` and at least one error referencing the incomplete route.

**Validates: Requirements 1.1, 1.3**

### Property 2: Assignments use only allowed AMZL lanes

*For any* ChuteAssignment produced by `generateAssignments`, the `lane` field SHALL be a member of `{5, 6, 7, 12, 19, 20}`.

**Validates: Requirements 2.2**

### Property 3: Excluded chutes are never assigned to lanes 5 or 6

*For any* ChuteAssignment where `lane` is 5 or 6, the `chuteId` SHALL NOT be in `{20105, 20106, 21605, 21606}`.

**Validates: Requirements 2.3**

### Property 4: FLAT suffix determines chute type and volume category

*For any* ChuteAssignment, if `chuteId` ends in `-FLAT` then `chuteType` SHALL be `'D2C'` and `volumeCategory` SHALL be `'Smalls'`; if `chuteId` does NOT end in `-FLAT` then `chuteType` SHALL be `'Multi'` and `volumeCategory` SHALL be `'Large'` or `'Mixed'`.

**Validates: Requirements 2.4**

### Property 5: Volume splitting keeps all chutes at or below 1,800 ADV and preserves total volume

*For any* set of ChuteAssignments after `splitOverCapacity` is applied, every assignment SHALL have `assignedAdv <= 1800`, and the sum of `assignedAdv` across all assignments for a given `routeCode` SHALL equal the original total ADV for that route.

**Validates: Requirements 3.1, 3.2**

### Property 6: Capacity violation warning on manual override

*For any* ChuteAssignment with `assignedAdv > 1800` that bypasses auto-splitting, `validateChuteCapacity` SHALL return a CapacityViolation referencing the affected `chuteId` and the overage amount.

**Validates: Requirements 3.3**

### Property 7: Grid cell rendering includes chute ID, route code, and ADV

*For any* ChuteAssignment, the string returned by `renderGridCell` SHALL contain the `chuteId`, `routeCode`, and string representation of `assignedAdv`.

**Validates: Requirements 4.2**

### Property 8: Chute assignments respect lane boundaries

*For any* ChuteAssignment, the `chuteId` SHALL be a member of the `chutes` array in the LaneGeometry whose `lane` matches the assignment's `lane`.

**Validates: Requirements 4.4**

### Property 9: Change overview items are complete and reflect actual diffs

*For any* pair of old and new assignment sets, every ChangeOverviewItem generated SHALL have non-empty `chuteId`, a valid `lane`, and a `changeType` of `'PanD2C_Flip'` or `'5S_Square'` — and the item SHALL correspond to an actual difference between the old and new assignments for that chute.

**Validates: Requirements 5.1, 5.2**

### Property 10: STEM file round-trip

*For any* valid set of SortationRules, generating a StemFile via `generateStemFile` and then parsing it back via `parseSortationRules` SHALL produce an equivalent set of rules.

**Validates: Requirements 6.1**

### Property 11: Existing unaffected rules are preserved in STEM output

*For any* STEM generation, every SortationRule in the existing rules whose `lane` is NOT in the set of lanes being modified SHALL appear unchanged in the output StemFile's `rules` array.

**Validates: Requirements 6.2, 4.3**

### Property 12: No unintentional duplicate chute-to-route entries in STEM

*For any* generated StemFile, if two rules share the same `chute` and `stackingFilter`, then both corresponding ChuteAssignments SHALL have `isDuplicate === true`.

**Validates: Requirements 6.3**

### Property 13: STEM validation rejects malformed files

*For any* StemFile where a rule is missing a required field (`chute`, `stackingFilter`, `lane`, `resourceType`), `validateStemFile` SHALL return a ValidationResult with `valid === false` and an error identifying the specific missing field.

**Validates: Requirements 6.4**

### Property 14: Grid and STEM consistency

*For any* Floor_Layout_Grid state and Sortation_Rules_File, if a chute-to-route mapping exists in the grid but not in the STEM rules (or vice versa), the system SHALL flag the discrepancy — and no grid assignment SHALL be saveable without a corresponding STEM entry.

**Validates: Requirements 7.2, 7.3**

### Property 15: Ops checklist covers all change overview items

*For any* finalized Change_Overview, the generated Ops checklist SHALL contain at least one OpsChecklistItem for every ChangeOverviewItem, with `description`, `lane`, `changeType`, `responsibleParty`, and `targetDate` populated.

**Validates: Requirements 8.1**

### Property 16: Incomplete checklist triggers warning

*For any* Ops checklist where at least one item has `completed === false` and the current date is at or past `targetDate`, the system SHALL produce a warning identifying the incomplete items and affected lanes.

**Validates: Requirements 8.3**

### Property 17: AR layout confirmation gates go-live

*For any* go-live attempt, if the Ops checklist does not contain a completed item with `isArLayout === true`, the system SHALL block the go-live and indicate that AR floor layout confirmation is outstanding.

**Validates: Requirements 9.1, 9.2**

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| XLSX file missing or unreadable | Display alert bar: "Unable to load TCY5_Data.xlsx. Check file path and format." Prevent all panels from rendering. |
| SPOT sheet missing required columns | `validateSpotData` returns errors. SPOT Volume panel shows inline error per missing field. Assignment engine is blocked. |
| SPOT ADV values non-numeric or negative | Validation rejects the route. Alert bar names the route and field. |
| SPAO assigns chute to disallowed lane | `generateAssignments` filters it out pre-output. If post-hoc detected, `validateChuteCapacity` flags it. |
| Chute ADV exceeds 1,800 | Auto-split via `splitOverCapacity`. If manual override, `validateChuteCapacity` returns CapacityViolation shown as warning badge on the chute cell. |
| Preserved assignment conflict | If a new assignment targets a preserved chute (Chico, Facebook), the engine skips it and logs a warning. |
| STEM file generation produces duplicates | `validateStemFile` catches unintentional duplicates. STEM Editor panel shows inline error with affected chute IDs. |
| STEM file missing required fields | `validateStemFile` rejects. Error message names the rule index and missing field. Download button disabled. |
| Grid-STEM discrepancy | Reconciliation prompt shown in alert bar listing mismatched chute IDs. Save blocked until resolved. |
| Ops checklist incomplete at launch date | Warning banner on Ops Checklist panel listing incomplete items. Go-live button disabled. |
| AR layout confirmation missing | Go-live blocked. Alert identifies "AR floor layout confirmation outstanding." |

## 7. Testing Strategy

### Unit Tests

Unit tests cover specific examples, edge cases, and integration points:

- **SPOT parser**: Parse a known XLSX fixture with the 3 TCY5 routes, assert exact ADV values match (Req 1.2 example).
- **Chute classification**: `classifyChute("20501")` → `'Multi'`, `classifyChute("20220-FLAT")` → `'D2C'`.
- **Excluded chute check**: `isExcluded("20105", 5)` → `true`, `isExcluded("20105", 7)` → `false`.
- **Preserved assignments**: After assignment generation, Chico/Facebook chutes unchanged.
- **Empty change overview**: When old and new assignments are identical for a lane, change overview states "no floor changes needed" (Req 5.3 edge case).
- **Ops checklist AR confirmation**: Checklist includes an item with `isArLayout === true` (Req 8.2 example).
- **STEM download**: Generated blob is valid and non-empty.

### Property-Based Tests

Property-based tests use **fast-check** (JavaScript PBT library) with a minimum of 100 iterations per property. Each test references its design property.

| Test | Property | Tag |
|---|---|---|
| SPOT parsing completeness | P1 | `Feature: tcy5-amzl-lane-launches, Property 1: SPOT parsing produces complete volume breakdowns or rejects incomplete data` |
| Allowed lanes only | P2 | `Feature: tcy5-amzl-lane-launches, Property 2: Assignments use only allowed AMZL lanes` |
| Excluded chutes lanes 5&6 | P3 | `Feature: tcy5-amzl-lane-launches, Property 3: Excluded chutes are never assigned to lanes 5 or 6` |
| FLAT classification | P4 | `Feature: tcy5-amzl-lane-launches, Property 4: FLAT suffix determines chute type and volume category` |
| Volume split correctness | P5 | `Feature: tcy5-amzl-lane-launches, Property 5: Volume splitting keeps all chutes at or below 1800 ADV and preserves total volume` |
| Capacity violation warning | P6 | `Feature: tcy5-amzl-lane-launches, Property 6: Capacity violation warning on manual override` |
| Grid cell content | P7 | `Feature: tcy5-amzl-lane-launches, Property 7: Grid cell rendering includes chute ID route code and ADV` |
| Lane boundary respect | P8 | `Feature: tcy5-amzl-lane-launches, Property 8: Chute assignments respect lane boundaries` |
| Change overview completeness | P9 | `Feature: tcy5-amzl-lane-launches, Property 9: Change overview items are complete and reflect actual diffs` |
| STEM round-trip | P10 | `Feature: tcy5-amzl-lane-launches, Property 10: STEM file round-trip` |
| Existing rules preserved | P11 | `Feature: tcy5-amzl-lane-launches, Property 11: Existing unaffected rules are preserved in STEM output` |
| No unintentional duplicates | P12 | `Feature: tcy5-amzl-lane-launches, Property 12: No unintentional duplicate chute-to-route entries in STEM` |
| STEM validation rejects bad files | P13 | `Feature: tcy5-amzl-lane-launches, Property 13: STEM validation rejects malformed files` |
| Grid-STEM consistency | P14 | `Feature: tcy5-amzl-lane-launches, Property 14: Grid and STEM consistency` |
| Checklist covers all changes | P15 | `Feature: tcy5-amzl-lane-launches, Property 15: Ops checklist covers all change overview items` |
| Incomplete checklist warning | P16 | `Feature: tcy5-amzl-lane-launches, Property 16: Incomplete checklist triggers warning` |
| AR go-live gate | P17 | `Feature: tcy5-amzl-lane-launches, Property 17: AR layout confirmation gates go-live` |

Each property-based test SHALL be implemented as a single `fc.assert(fc.property(...))` call with `{ numRuns: 100 }` minimum. Generators will produce random SpotRoutes, ChuteAssignments, SortationRules, and ChangeOverviewItems with valid structure but randomized values to exercise the full input space.
