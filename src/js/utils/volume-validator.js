/**
 * volume-validator.js — Volume validation for TCY5 AMZL chute assignments
 *
 * Validates that chute assignments respect the 1,800 ADV capacity cap and
 * surfaces CapacityViolation objects for any chute that exceeds the limit.
 *
 * Requirements: 3.1, 3.3
 */

import { MAX_CHUTE_ADV } from '../data/tcy5-config.js';

/**
 * Return the ADV number for a single chute assignment.
 *
 * @param {object} assignment — ChuteAssignment
 * @returns {number} the assignedAdv value
 */
export function computeChuteAdv(assignment) {
  return assignment.assignedAdv;
}

/**
 * Validate that no chute assignment exceeds the maximum ADV capacity.
 *
 * @param {Array<object>} assignments — ChuteAssignment[]
 * @returns {Array<object>} CapacityViolation[] — one entry per over-capacity chute
 */
export function validateChuteCapacity(assignments) {
  const violations = [];

  for (const assignment of assignments) {
    const adv = computeChuteAdv(assignment);

    if (adv > MAX_CHUTE_ADV) {
      violations.push({
        chuteId: assignment.chuteId,
        lane: assignment.lane,
        currentAdv: adv,
        maxAdv: MAX_CHUTE_ADV,
        routeCode: assignment.routeCode,
        overageAmount: adv - MAX_CHUTE_ADV,
      });
    }
  }

  return violations;
}
