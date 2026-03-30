/**
 * chute-assign.js — Chute assignment engine for TCY5 AMZL lane launches
 *
 * Implements Thomas Peterson's AR site lane launch methodology:
 * Score candidate chutes by displacement cost, prefer dynamic/empty slots,
 * keep new routes contiguous within lanes, respect AR floor constraints.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.3
 */

import {
  ALLOWED_AMZL_LANES,
  EXCLUDED_CHUTES_LANE_5_6,
  MAX_CHUTE_ADV,
  PRESERVED_ASSIGNMENTS,
  NEW_ROUTES,
  RESERVED_LANES,
  EXCLUDED_ROWS,
  HIGH_VOLUME_EXCLUDED_ROWS,
} from '../data/tcy5-config.js';

/**
 * Classify a chute as D2C or Multi based on its resource label.
 *
 * In TCY5 AMZL sortation rules, a resource label ending in `-FLAT`
 * indicates a D2C (direct-to-container) chute. All other labels are Multi
 * (multi-package pallet build). The chute ID carries the same `-FLAT`
 * suffix as the resource label, so either value can be passed here.
 *
 * @param {string} chuteIdOrLabel — chute identifier or resource label (e.g. "20501" or "20220-FLAT")
 * @returns {'D2C'|'Multi'} — 'D2C' if the value ends in `-FLAT`, else 'Multi'
 */
export function classifyChute(chuteIdOrLabel) {
  return String(chuteIdOrLabel).endsWith('-FLAT') ? 'D2C' : 'Multi';
}

/**
 * Check whether a chute is excluded from assignment.
 *
 * @param {string} chuteId — chute identifier
 * @param {number} lane — target lane number (kept for API compat)
 * @returns {boolean} true if the chute should be skipped
 */
export function isExcluded(chuteId, lane) {
  return EXCLUDED_CHUTES_LANE_5_6.includes(String(chuteId));
}


/**
 * Displacement cost categories for Thomas Peterson's scoring.
 * Lower score = better candidate for swapping.
 *
 * At an AR (Amazon Robotics) site, robotic drive units deliver totes to
 * chute positions. Dynamic/empty slots are often near induction points,
 * so placing high-volume routes there causes drive congestion. Instead,
 * we prefer displacing low-ADV DDU D2C chutes that are in better floor
 * positions — those displaced routes get consolidated or moved to the
 * freed-up dynamic slots.
 *
 *  0 — low-ADV (<200): best candidates, minimal volume to relocate
 *  1 — psolve: problem-solve overflow, easily relocated
 *  2 — mid-ADV (200-500): moderate displacement, still worth it
 *  3 — dynamic/empty: available but often near induction (congestion risk)
 *  4 — high-ADV (>500): significant displacement, avoid if possible
 *  5 — cycle/recirc: core sort infrastructure, never swap
 *
 * @param {object} chuteDetail — { chuteId, filter, route, adv } from geometry
 * @returns {{ score: number, reason: string }}
 */
export function scoreChuteDisplacement(chuteDetail) {
  const filter = (chuteDetail.filter || '').toUpperCase();
  const adv = chuteDetail.adv != null ? Number(chuteDetail.adv) : 0;

  // Cycle routes and recirc — core AR infrastructure, never swap
  if (filter.includes('CYCLE1') || filter === 'RECIRC') {
    return { score: 5, reason: 'Core cycle/recirc infrastructure — do not swap' };
  }

  // KSMF, USPS, FF — specialized programs, avoid swapping
  if (filter.includes('KSMF') || filter.includes('USPS') || filter.includes('LPC-') ||
      filter.startsWith('FF') || filter.startsWith('USC') || filter.startsWith('USA') || filter.startsWith('UST')) {
    return { score: 5, reason: 'Specialized program chute (KSMF/USPS/FF) — do not swap' };
  }

  // P-solve — overflow handling, easily relocated
  if (filter === 'PSOLVE') {
    return { score: 1, reason: 'P-solve chute — low-priority overflow, easily relocated' };
  }

  // Dynamic or empty — available but near induction, congestion risk for high-volume
  if (!filter || filter === 'DYNAMIC' || filter === '') {
    return { score: 3, reason: 'Dynamic/empty slot — available but near induction, congestion risk' };
  }

  // ADV-based scoring for zip-code / smalls / large DDU routes
  // Low-ADV DDU chutes are the best candidates — minimal volume to relocate,
  // better floor positions away from induction
  if (adv <= 0 || isNaN(adv)) {
    return { score: 3, reason: 'No recorded volume — treated as dynamic slot' };
  }
  if (adv < 200) {
    return { score: 0, reason: `Low-ADV DDU chute (${Math.round(adv)} ADV) — best candidate, minimal displacement` };
  }
  if (adv <= 500) {
    return { score: 2, reason: `Mid-ADV DDU chute (${Math.round(adv)} ADV) — moderate displacement` };
  }
  return { score: 4, reason: `High-ADV chute (${Math.round(adv)} ADV) — significant displacement, avoid` };
}


/**
 * Generate chute-to-route assignments for the new AMZL routes using
 * Thomas Peterson's AR site lane launch methodology.
 *
 * Strategy:
 * 1. Build a candidate pool of all chutes on allowed lanes
 * 2. Filter out preserved, excluded, and core infrastructure chutes
 * 3. Score each candidate by displacement cost
 * 4. For each new route, greedily pick the lowest-cost candidates
 *    preferring contiguous placement on the same lane
 * 5. D2C chutes (resource label ends in -FLAT) → Smalls volume, Multi chutes → Large/Mixed
 *
 * @param {Array<object>} routes — SpotRoute[] from SPOT parser
 * @param {Array<object>} existingRules — SortationRule[] from STEM parser
 * @param {object} config — assignment configuration
 * @param {number[]} config.ALLOWED_AMZL_LANES
 * @param {string[]} config.EXCLUDED_CHUTES_LANE_5_6
 * @param {Array<object>} config.PRESERVED_ASSIGNMENTS
 * @param {Record<number, string[]>} config.chutesPerLane
 * @param {Array<object>} [config.geometry] — LaneGeometry[] with chuteDetails for scoring
 * @returns {Array<object>} ChuteAssignment[]
 */
export function generateAssignments(routes, existingRules, config) {
  const allowedLanes = config.ALLOWED_AMZL_LANES || ALLOWED_AMZL_LANES;
  const excludedChutes = config.EXCLUDED_CHUTES_LANE_5_6 || EXCLUDED_CHUTES_LANE_5_6;
  const preserved = config.PRESERVED_ASSIGNMENTS || PRESERVED_ASSIGNMENTS;
  const chutesPerLane = config.chutesPerLane || {};
  const geometry = config.geometry || [];
  const reservedLanes = new Set(config.RESERVED_LANES || RESERVED_LANES);
  const excludedRows = new Set(config.EXCLUDED_ROWS || EXCLUDED_ROWS);
  const highVolExcludedRows = new Set(config.HIGH_VOLUME_EXCLUDED_ROWS || HIGH_VOLUME_EXCLUDED_ROWS);

  // Build preserved set
  const preservedIds = new Set(preserved.map((p) => p.chuteId));

  // Build chuteDetail lookup from geometry
  const detailMap = new Map();
  for (const lane of geometry) {
    if (lane.chuteDetails) {
      for (const d of lane.chuteDetails) {
        detailMap.set(d.chuteId, d);
      }
    }
  }

  // Track which chutes have already been assigned in this run
  const usedChutes = new Set();

  const assignments = [];

  // Filter to only new AMZL routes (those matching NEW_ROUTES patterns)
  // If no NEW_ROUTES match, fall back to processing all routes
  const newRouteFilters = new Set(NEW_ROUTES.map((r) => r.parentStackingFilter));
  const routesToAssign = routes.filter((r) => newRouteFilters.has(r.parentStackingFilter));
  const targetRoutes = routesToAssign.length > 0 ? routesToAssign : routes;

  // Sort routes by total ADV descending — assign highest-volume routes first
  // so they get the best (lowest-cost) chute candidates
  const sortedRoutes = [...targetRoutes].sort((a, b) => {
    const totalA = (a.smallsAdv || 0) + (a.largeAdv || 0) + (a.nonconAdv || 0);
    const totalB = (b.smallsAdv || 0) + (b.largeAdv || 0) + (b.nonconAdv || 0);
    return totalB - totalA;
  });

  // Row center for drive congestion optimization.
  // AR drives converge on middle rows — high-volume routes go there,
  // low-volume routes go on outer rows to spread traffic.
  const ROW_CENTER = 8.5; // midpoint of rows 1-16
  const totalRoutes = sortedRoutes.length;

  for (let routeIndex = 0; routeIndex < sortedRoutes.length; routeIndex++) {
    const route = sortedRoutes[routeIndex];
    const routeCode = route.parentStackingFilter;
    let remainingSmalls = route.smallsAdv || 0;
    let remainingLarge = (route.largeAdv || 0) + (route.nonconAdv || 0);

    // Build scored candidate list for this route
    const candidates = [];
    for (const lane of allowedLanes) {
      // Skip reserved lanes (e.g. lane 21 reserved for FPD)
      if (reservedLanes.has(lane)) continue;
      const laneChutes = chutesPerLane[lane] || [];
      for (const chuteId of laneChutes) {
        // Skip preserved
        if (preservedIds.has(chuteId)) continue;
        // Skip excluded
        if (excludedChutes.includes(String(chuteId))) continue;
        // Skip chutes in excluded rows (e.g. row 9 = psolve only)
        const rowNum = parseInt(String(chuteId).substring(0, 3), 10) - 200;
        if (excludedRows.has(rowNum)) continue;
        // Hard constraint: high-volume routes (routeIndex 0) cannot go in outer rows (14-16)
        if (routeIndex === 0 && highVolExcludedRows.has(rowNum)) continue;
        // Skip already used
        if (usedChutes.has(chuteId)) continue;

        const chuteType = classifyChute(chuteId);
        const detail = detailMap.get(chuteId);

        // Score displacement cost
        const { score } = detail
          ? scoreChuteDisplacement(detail)
          : { score: 0 }; // no detail = treat as available

        // Skip core infrastructure (score 5) — never swap cycle/recirc/KSMF/USPS/FF
        if (score >= 5) continue;

        candidates.push({ chuteId, lane, chuteType, score, rowNum, detail });
      }
    }

    // Sort candidates: displacement score → row-position preference → lane.
    // Row-position preference: high-volume routes (low routeIndex) prefer
    // middle rows (close to ROW_CENTER), low-volume routes (high routeIndex)
    // prefer outer rows (far from ROW_CENTER).
    // volumeWeight: 0 = highest volume (prefer center), 1 = lowest volume (prefer outside)
    const volumeWeight = totalRoutes > 1 ? routeIndex / (totalRoutes - 1) : 0;

    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      // Row distance from center
      const distA = Math.abs((a.rowNum || 0) - ROW_CENTER);
      const distB = Math.abs((b.rowNum || 0) - ROW_CENTER);
      // volumeWeight 0 → prefer small distance (center), 1 → prefer large distance (outside)
      // Blend: effective = dist * (1 - 2*weight), so weight=0 sorts ascending, weight=1 sorts descending
      const effA = distA * (1 - 2 * volumeWeight);
      const effB = distB * (1 - 2 * volumeWeight);
      if (effA !== effB) return effA - effB;
      return a.lane - b.lane;
    });

    // Assign smalls to D2C chutes (-FLAT resource label), large to Multi chutes
    for (const c of candidates) {
      if (remainingSmalls <= 0 && remainingLarge <= 0) break;

      let assignedAdv = 0;
      let volumeCategory;

      if (c.chuteType === 'D2C' && remainingSmalls > 0) {
        volumeCategory = 'Smalls';
        assignedAdv = Math.min(remainingSmalls, MAX_CHUTE_ADV);
        remainingSmalls -= assignedAdv;
      } else if (c.chuteType === 'Multi' && remainingLarge > 0) {
        volumeCategory = 'Large';
        assignedAdv = Math.min(remainingLarge, MAX_CHUTE_ADV);
        remainingLarge -= assignedAdv;
      } else if (c.chuteType === 'Multi' && remainingSmalls > 0) {
        // Multi chutes can handle smalls overflow if no FLAT available
        volumeCategory = 'Mixed';
        assignedAdv = Math.min(remainingSmalls, MAX_CHUTE_ADV);
        remainingSmalls -= assignedAdv;
      }

      if (assignedAdv <= 0) continue;

      usedChutes.add(c.chuteId);
      assignments.push({
        chuteId: c.chuteId,
        lane: c.lane,
        routeCode,
        chuteType: c.chuteType,
        assignedAdv,
        volumeCategory,
        isDuplicate: false,
        originalChuteId: undefined,
      });
    }
  }

  return assignments;
}


/**
 * Split any assignment exceeding maxAdv into multiple chutes, distributing
 * volume evenly. Preserves total ADV per route.
 *
 * @param {Array<object>} assignments — ChuteAssignment[] from generateAssignments
 * @param {number} [maxAdv=1800] — maximum ADV per chute before splitting
 * @returns {Array<object>} ChuteAssignment[] with over-capacity chutes split
 */
export function splitOverCapacity(assignments, maxAdv = MAX_CHUTE_ADV) {
  const result = [];

  for (const assignment of assignments) {
    if (assignment.assignedAdv <= maxAdv) {
      result.push(assignment);
      continue;
    }

    // Calculate how many chutes we need to split into
    const numChutes = Math.ceil(assignment.assignedAdv / maxAdv);
    const totalAdv = assignment.assignedAdv;
    const baseAdv = Math.floor(totalAdv / numChutes);
    let remainder = totalAdv - baseAdv * numChutes;

    for (let i = 0; i < numChutes; i++) {
      // Distribute remainder one unit at a time to the first chutes
      const adv = baseAdv + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;

      result.push({
        chuteId: i === 0 ? assignment.chuteId : `${assignment.chuteId}-DUP${i}`,
        lane: assignment.lane,
        routeCode: assignment.routeCode,
        chuteType: assignment.chuteType,
        assignedAdv: adv,
        volumeCategory: assignment.volumeCategory,
        isDuplicate: i > 0,
        originalChuteId: i > 0 ? assignment.chuteId : undefined,
      });
    }
  }

  return result;
}
