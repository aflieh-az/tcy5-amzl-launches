/**
 * Property-based tests for volume splitting and capacity validation — Properties 5, 6
 *
 * Uses fast-check with minimum 100 iterations per property.
 * Validates: Requirements 3.1, 3.2, 3.3
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { splitOverCapacity } from '../chute-assign.js';
import { validateChuteCapacity } from '../volume-validator.js';
import { ALLOWED_AMZL_LANES } from '../../data/tcy5-config.js';

// ── Generators ──────────────────────────────────────────────

/** Pick a random lane from the allowed set. */
const arbLane = fc.constantFrom(...ALLOWED_AMZL_LANES);

/** Generate a random chute ID — plain numeric or with -FLAT suffix. */
const arbChuteId = fc.oneof(
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}$/),
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}-FLAT$/),
);

/** Generate a random route code. */
const arbRouteCode = fc.stringMatching(/^[A-Z]{3}\d->[A-Z]{3}\d-CYC\d$/);

/** Generate a ChuteAssignment with a random assignedAdv (some above 1800). */
const arbAssignment = fc.record({
  chuteId: arbChuteId,
  lane: arbLane,
  routeCode: arbRouteCode,
  chuteType: fc.constantFrom('D2C', 'Multi'),
  assignedAdv: fc.integer({ min: 1, max: 10000 }),
  volumeCategory: fc.constantFrom('Smalls', 'Large', 'Mixed'),
  isDuplicate: fc.constant(false),
  originalChuteId: fc.constant(undefined),
});

/**
 * Generate a ChuteAssignment guaranteed to exceed 1800 ADV,
 * simulating a manual override that bypasses auto-splitting.
 */
const arbOverCapacityAssignment = fc.record({
  chuteId: arbChuteId,
  lane: arbLane,
  routeCode: arbRouteCode,
  chuteType: fc.constantFrom('D2C', 'Multi'),
  assignedAdv: fc.integer({ min: 1801, max: 10000 }),
  volumeCategory: fc.constantFrom('Smalls', 'Large', 'Mixed'),
  isDuplicate: fc.constant(false),
  originalChuteId: fc.constant(undefined),
});


// ── Property 5: Volume splitting keeps all chutes at or below 1,800 ADV and preserves total volume ──

describe('Property 5: Volume splitting keeps all chutes at or below 1800 ADV and preserves total volume', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For any set of ChuteAssignments after splitOverCapacity is applied,
   * every assignment SHALL have assignedAdv <= 1800, and the sum of
   * assignedAdv across all assignments SHALL equal the original total.
   */
  it('every split assignment is at or below 1800 ADV', () => {
    fc.assert(
      fc.property(
        fc.array(arbAssignment, { minLength: 1, maxLength: 10 }),
        (assignments) => {
          const result = splitOverCapacity(assignments, 1800);
          result.forEach((a) => {
            expect(a.assignedAdv).toBeLessThanOrEqual(1800);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('total ADV is preserved after splitting', () => {
    fc.assert(
      fc.property(
        fc.array(arbAssignment, { minLength: 1, maxLength: 10 }),
        (assignments) => {
          const originalTotal = assignments.reduce((sum, a) => sum + a.assignedAdv, 0);
          const result = splitOverCapacity(assignments, 1800);
          const splitTotal = result.reduce((sum, a) => sum + a.assignedAdv, 0);
          expect(splitTotal).toBe(originalTotal);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 6: Capacity violation warning on manual override ──

describe('Property 6: Capacity violation warning on manual override', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any ChuteAssignment with assignedAdv > 1800 that bypasses
   * auto-splitting, validateChuteCapacity SHALL return a CapacityViolation
   * referencing the affected chuteId and the correct overage amount.
   */
  it('returns a violation for every over-capacity chute', () => {
    fc.assert(
      fc.property(
        fc.array(arbOverCapacityAssignment, { minLength: 1, maxLength: 10 }),
        (assignments) => {
          const violations = validateChuteCapacity(assignments);
          expect(violations).toHaveLength(assignments.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each violation has correct chuteId and overageAmount', () => {
    fc.assert(
      fc.property(
        fc.array(arbOverCapacityAssignment, { minLength: 1, maxLength: 10 }),
        (assignments) => {
          const violations = validateChuteCapacity(assignments);
          for (let i = 0; i < assignments.length; i++) {
            const a = assignments[i];
            const v = violations[i];
            expect(v.chuteId).toBe(a.chuteId);
            expect(v.overageAmount).toBe(a.assignedAdv - 1800);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
