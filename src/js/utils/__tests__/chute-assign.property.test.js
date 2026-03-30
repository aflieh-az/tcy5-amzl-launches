/**
 * Property-based tests for chute-assign.js — Properties 2, 3, 4
 *
 * Uses fast-check with minimum 100 iterations per property.
 * Validates: Requirements 2.2, 2.3, 2.4
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  classifyChute,
  isExcluded,
  generateAssignments,
} from '../chute-assign.js';
import {
  ALLOWED_AMZL_LANES,
} from '../../data/tcy5-config.js';

// ── Generators ──────────────────────────────────────────────

/** Generate a random chute ID — either plain numeric or with -FLAT suffix. */
const arbChuteId = fc.oneof(
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}$/),
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}-FLAT$/),
);

/** Generate a random route with valid ADV values. */
const arbRoute = fc.record({
  parentStackingFilter: fc.stringMatching(/^[A-Z]{3}\d->[A-Z]{3}\d-CYC\d$/),
  smallsAdv: fc.integer({ min: 0, max: 5000 }),
  largeAdv: fc.integer({ min: 0, max: 5000 }),
  nonconAdv: fc.integer({ min: 0, max: 500 }),
});

/** Generate a chutesPerLane config using only allowed lanes. */
const arbChutesPerLane = fc
  .tuple(
    ...ALLOWED_AMZL_LANES.map((lane) =>
      fc.array(arbChuteId, { minLength: 1, maxLength: 6 }).map((chutes) => [lane, chutes]),
    ),
  )
  .map((entries) => Object.fromEntries(entries));

/** Build a full config object from a chutesPerLane map. */
const arbConfig = arbChutesPerLane.map((chutesPerLane) => ({
  ALLOWED_AMZL_LANES,
  EXCLUDED_CHUTES_LANE_5_6: [],
  PRESERVED_ASSIGNMENTS: [],
  chutesPerLane,
}));

// ── Property 2: Assignments use only allowed AMZL lanes ─────

describe('Property 2: Assignments use only allowed AMZL lanes', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any ChuteAssignment produced by generateAssignments, the lane field
   * SHALL be a member of {6, 7, 12, 19, 20}.
   */
  it('every assignment lane is in ALLOWED_AMZL_LANES', () => {
    fc.assert(
      fc.property(
        fc.array(arbRoute, { minLength: 1, maxLength: 4 }),
        arbConfig,
        (routes, config) => {
          const assignments = generateAssignments(routes, [], config);
          assignments.forEach((a) => {
            expect(ALLOWED_AMZL_LANES).toContain(a.lane);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: Excluded chutes are never assigned ──────────

describe('Property 3: Excluded chutes are never assigned', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any ChuteAssignment, the chuteId SHALL NOT be in the exclusion list.
   */
  it('no excluded chute appears in assignments', () => {
    // Build configs that deliberately include excluded chutes
    const testExcluded = ['EXCL-001', 'EXCL-002'];
    const arbConfigWithExcluded = arbChutesPerLane.map((base) => {
      const withExcluded = { ...base };
      // Inject excluded chutes into lanes
      withExcluded[6] = [...(base[6] || []), ...testExcluded];
      withExcluded[7] = [...(base[7] || []), ...testExcluded];
      return {
        ALLOWED_AMZL_LANES,
        EXCLUDED_CHUTES_LANE_5_6: testExcluded,
        PRESERVED_ASSIGNMENTS: [],
        chutesPerLane: withExcluded,
      };
    });

    fc.assert(
      fc.property(
        fc.array(arbRoute, { minLength: 1, maxLength: 4 }),
        arbConfigWithExcluded,
        (routes, config) => {
          const assignments = generateAssignments(routes, [], config);
          assignments.forEach((a) => {
            expect(testExcluded).not.toContain(a.chuteId);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 4: FLAT suffix determines chute type and volume category ──

describe('Property 4: FLAT suffix determines chute type and volume category', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any ChuteAssignment:
   *   - chuteId ends in -FLAT → chuteType === 'D2C' AND volumeCategory === 'Smalls'
   *   - chuteId does NOT end in -FLAT → chuteType === 'Multi' AND volumeCategory in {'Large', 'Mixed'}
   */
  it('FLAT suffix classification holds for all generated assignments', () => {
    fc.assert(
      fc.property(
        fc.array(arbRoute, { minLength: 1, maxLength: 4 }),
        arbConfig,
        (routes, config) => {
          const assignments = generateAssignments(routes, [], config);
          assignments.forEach((a) => {
            if (String(a.chuteId).endsWith('-FLAT')) {
              expect(a.chuteType).toBe('D2C');
              expect(a.volumeCategory).toBe('Smalls');
            } else {
              expect(a.chuteType).toBe('Multi');
              expect(['Large', 'Mixed']).toContain(a.volumeCategory);
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Direct test of classifyChute with random strings.
   */
  it('classifyChute returns D2C for -FLAT suffix and Multi otherwise', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (raw) => {
        const result = classifyChute(raw);
        if (raw.endsWith('-FLAT')) {
          expect(result).toBe('D2C');
        } else {
          expect(result).toBe('Multi');
        }
      }),
      { numRuns: 100 },
    );
  });
});
