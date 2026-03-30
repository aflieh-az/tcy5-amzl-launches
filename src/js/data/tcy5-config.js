/**
 * tcy5-config.js — TCY5 facility constants, route definitions, and layout parser
 *
 * Holds hardcoded configuration for the TCY5 AMZL lane launch:
 * allowed lanes, excluded chutes, volume cap, preserved assignments,
 * the 3 new route definitions with known ADV breakdowns, and
 * parseLaneGeometry for reading the layout_view tab.
 *
 * Requirements: 2.2, 2.3, 3.1, 4.1, 4.3, 4.4
 */

/**
 * Lanes (columns) eligible for new AMZL assignments on the TCY5 floor.
 * Lanes are column positions in the layout grid (1-21).
 * Lane 6 (column 6) is the primary target; 7, 12, 19, 20 are overflow.
 * Lane 6 is listed first so the displacement-score sort (which
 * breaks ties by lane order) naturally prefers it.
 */
export const ALLOWED_AMZL_LANES = [6, 7, 12, 19, 20];

/**
 * Lanes (columns) reserved for other programs — never assign new AMZL routes here.
 * Lane 21 (column 21): reserved for FPD (open spots will be used for FPD chutes).
 */
export const RESERVED_LANES = [21];

/**
 * Rows excluded from AMZL assignment entirely.
 * Row 9 is psolve-only — no new routes may be placed on any chute in row 9.
 * Chute IDs in row 9 have prefix "209" (first 3 digits = 200 + row number).
 */
export const EXCLUDED_ROWS = [9];

/**
 * Rows excluded from high-volume route assignment (drive congestion).
 * Rows 14-16 are the outermost rows — placing high-ADV routes here
 * causes AR drive congestion because drives travel the longest paths.
 * Only the highest-volume route (routeIndex 0) is blocked from these rows.
 */
export const HIGH_VOLUME_EXCLUDED_ROWS = [14, 15, 16];

/** Chutes excluded from assignment (none currently). */
export const EXCLUDED_CHUTES_LANE_5_6 = [];

/** Maximum ADV any single chute may carry before requiring a split. */
export const MAX_CHUTE_ADV = 1800;

/**
 * Assignments that must never be overwritten by the assignment engine.
 * @type {Array<{chuteId: string, routeCode: string, chuteType: 'D2C'|'Multi', description: string}>}
 */
export const PRESERVED_ASSIGNMENTS = [
  {
    chuteId: 'ARSC-21620',
    routeCode: 'Chico',
    chuteType: 'Multi',
    description: 'Chico pallet build',
  },
  {
    chuteId: 'ARSC-20220-FLAT',
    routeCode: 'Facebook smalls',
    chuteType: 'D2C',
    description: 'Facebook smalls direct-to-container',
  },
  {
    chuteId: 'ARSC-20220',
    routeCode: 'Facebook large',
    chuteType: 'Multi',
    description: 'Facebook large pallet build',
  },
];

/**
 * The 3 new AMZL routes originating from TCY9 with known ADV breakdowns.
 * @type {Array<{parentStackingFilter: string, sortScheme: string, programType: string, totalAdv: number, smallsAdv: number, nonconAdv: number, largeAdv: number}>}
 */
export const NEW_ROUTES = [
  {
    parentStackingFilter: 'TCY9->DCK6-CYC1',
    sortScheme: 'TCY9',
    programType: 'AMZL',
    totalAdv: 1987,
    smallsAdv: 1418,
    nonconAdv: 58,
    largeAdv: 511,
  },
  {
    parentStackingFilter: 'TCY9->DFA5-CYC1',
    sortScheme: 'TCY9',
    programType: 'AMZL',
    totalAdv: 2476,
    smallsAdv: 1943,
    nonconAdv: 24,
    largeAdv: 509,
  },
  {
    parentStackingFilter: 'TCY9->DSR2-CYC1',
    sortScheme: 'TCY9',
    programType: 'AMZL',
    totalAdv: 3033,
    smallsAdv: 2231,
    nonconAdv: 98,
    largeAdv: 704,
  },
];

/**
 * Parse a layout worksheet into an array of LaneGeometry objects.
 *
 * The layout sheet is a visual grid where each lane is a group of sub-rows:
 *   - Sub-row 0 (Row X label): Chute IDs across Columns 1–21
 *   - Sub-row 1: Stacking filters / parent names
 *   - Sub-row 2: Route names (may be absent for special lanes like psolve)
 *   - Sub-row 3: ADV values (may be absent for special lanes)
 *
 * Lane number is derived from the first chute ID prefix: parseInt(id.substring(0,3)) - 200.
 * Grid row is the 0-based index of the Row group. Grid col is always 0 (single-column layout).
 *
 * @param {object} layoutSheet — SheetJS worksheet object (workbook.Sheets['layout'])
 * @returns {Array<{lane: number, gridRow: number, gridCol: number, chutes: string[], waveGroup: string}>}
 */
export function parseLaneGeometry(layoutSheet) {
  /* global XLSX */
  const rawRows = XLSX.utils.sheet_to_json(layoutSheet, { defval: null });

  // Identify column keys for chute positions (Column 1 .. Column 21)
  const colKeys = [];
  for (let c = 1; c <= 21; c++) {
    colKeys.push('Column ' + c);
  }

  // Group rows by "Row X" labels — each label starts a new lane group
  const laneGroups = [];
  let currentGroup = null;

  for (let i = 0; i < rawRows.length; i++) {
    const label = rawRows[i]['__EMPTY'];
    if (label != null && String(label).startsWith('Row')) {
      if (currentGroup) laneGroups.push(currentGroup);
      currentGroup = { startIdx: i, rows: [rawRows[i]] };
    } else if (currentGroup) {
      currentGroup.rows.push(rawRows[i]);
    }
  }
  if (currentGroup) laneGroups.push(currentGroup);

  return laneGroups.map((group, groupIdx) => {
    const chuteRow = group.rows[0]; // sub-row 0: chute IDs
    const filterRow = group.rows[1] || {};
    const routeRow = group.rows[2] || {};
    const advRow = group.rows[3] || {};

    // Extract per-chute data from Column 1..21
    const chutes = [];
    const chuteDetails = [];
    for (const key of colKeys) {
      const cid = chuteRow[key];
      if (cid != null && String(cid).trim() !== '') {
        const chuteId = String(cid).trim();
        chutes.push(chuteId);

        const rawFilter = filterRow[key];
        const rawRoute = routeRow[key];
        const rawAdv = advRow[key];

        chuteDetails.push({
          chuteId,
          filter: rawFilter != null ? String(rawFilter).trim() : '',
          route: rawRoute != null ? String(rawRoute).trim() : '',
          adv: rawAdv != null ? Number(rawAdv) : null,
        });
      }
    }

    // Derive lane number from first chute ID (e.g. "20501" → lane 5)
    let lane = groupIdx + 1; // fallback
    if (chutes.length > 0) {
      const prefix = parseInt(chutes[0].substring(0, 3), 10);
      if (!isNaN(prefix)) {
        lane = prefix - 200;
      }
    }

    // Wave group from the Legend (Wave) column on the chute row, if present
    const rawWave = chuteRow['Legend (Wave)'];
    const waveGroup = rawWave != null ? String(rawWave) : '';

    return {
      lane,
      gridRow: groupIdx,
      gridCol: 0,
      chutes,
      chuteDetails,
      waveGroup,
    };
  });
}
