/**
 * Property-based tests for grid-STEM consistency — Property 14
 *
 * Uses fast-check with minimum 100 iterations per property.
 * Validates: Requirements 7.2, 7.3
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkGridStemConsistency } from '../stem-editor.js';
import { ALLOWED_AMZL_LANES } from '../../data/tcy5-config.js';

// ── Generators ──────────────────────────────────────────────

/** Generate a chute ID — plain numeric or with -FLAT suffix. */
const arbChuteId = fc.oneof(
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}$/),
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}-FLAT$/),
);

/** Generate a lane from the allowed set. */
const arbLane = fc.constantFrom(...ALLOWED_AMZL_LANES);

/** Generate a route code. */
const arbRouteCode = fc.stringMatching(/^[A-Z]{3}\d->[A-Z]{3}\d-CYC\d$/);

/** Generate a ChuteAssignment (grid side). */
const arbChuteAssignment = fc.record({
  chuteId: arbChuteId,
  lane: arbLane,
  routeCode: arbRouteCode,
  chuteType: fc.constantFrom('D2C', 'Multi'),
  assignedAdv: fc.integer({ min: 1, max: 3000 }),
  volumeCategory: fc.constantFrom('Smalls', 'Large', 'Mixed'),
  isDuplicate: fc.boolean(),
});

/** Generate a matching SortationRule from a ChuteAssignment. */
function assignmentToRule(assignment) {
  return {
    lane: assignment.lane,
    stackingFilter: assignment.routeCode,
    vsm: '',
    resourceLabel: '',
    resourceType: assignment.chuteType,
    chute: assignment.chuteId,
    sorter: '',
  };
}

/** Generate a standalone SortationRule (STEM side). */
const arbSortationRule = fc.record({
  lane: arbLane,
  stackingFilter: arbRouteCode,
  vsm: fc.constant(''),
  resourceLabel: fc.constant(''),
  resourceType: fc.constantFrom('D2C', 'Multi'),
  chute: arbChuteId,
  sorter: fc.constant(''),
});

// ── Property 14: Grid and STEM consistency ──────────────────

describe('Property 14: Grid and STEM consistency', () => {
  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * When grid assignments and STEM rules have matching chute+route pairs,
   * no discrepancies are flagged.
   */
  it('matching grid assignments and STEM rules produce no discrepancies', () => {
    fc.assert(
      fc.property(
        fc.array(arbChuteAssignment, { minLength: 1, maxLength: 15 }),
        (assignments) => {
          // Deduplicate by chuteId::routeCode to avoid duplicate key collisions
          const seen = new Set();
          const uniqueAssignments = assignments.filter((a) => {
            const key = `${a.chuteId}::${a.routeCode}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const rules = uniqueAssignments.map(assignmentToRule);
          const discrepancies = checkGridStemConsistency(uniqueAssignments, rules);

          expect(discrepancies).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * When a chute-to-route exists in grid but not in STEM, it is flagged
   * with source='grid'.
   */
  it('flags grid-only entries with source="grid"', () => {
    fc.assert(
      fc.property(
        fc.array(arbChuteAssignment, { minLength: 1, maxLength: 10 }),
        (gridAssignments) => {
          // Pass empty STEM rules — every grid entry should be flagged
          const discrepancies = checkGridStemConsistency(gridAssignments, []);

          expect(discrepancies.length).toBe(gridAssignments.length);
          for (const d of discrepancies) {
            expect(d.source).toBe('grid');
            expect(d.chuteId).toBeTruthy();
            expect(d.routeCode).toBeTruthy();
            expect(d.message).toContain('grid');
            expect(d.message).toContain('not in STEM');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * When a chute-to-route exists in STEM but not in grid, it is flagged
   * with source='stem'.
   */
  it('flags STEM-only entries with source="stem"', () => {
    fc.assert(
      fc.property(
        fc.array(arbSortationRule, { minLength: 1, maxLength: 10 }),
        (stemRules) => {
          // Filter to rules with non-empty chute and stackingFilter
          // (the function skips rules with missing chute/stackingFilter)
          const validRules = stemRules.filter(
            (r) => r.chute && r.stackingFilter,
          );
          if (validRules.length === 0) return; // skip vacuous case

          const discrepancies = checkGridStemConsistency([], validRules);

          expect(discrepancies.length).toBe(validRules.length);
          for (const d of discrepancies) {
            expect(d.source).toBe('stem');
            expect(d.chuteId).toBeTruthy();
            expect(d.routeCode).toBeTruthy();
            expect(d.message).toContain('STEM');
            expect(d.message).toContain('not in grid');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * Generate random grid assignments and matching STEM rules — no
   * discrepancies should be found.
   */
  it('random matching pairs produce zero discrepancies', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            chuteId: arbChuteId,
            lane: arbLane,
            routeCode: arbRouteCode,
            chuteType: fc.constantFrom('D2C', 'Multi'),
            assignedAdv: fc.integer({ min: 1, max: 3000 }),
            volumeCategory: fc.constantFrom('Smalls', 'Large', 'Mixed'),
            isDuplicate: fc.boolean(),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (assignments) => {
          // Deduplicate
          const seen = new Set();
          const unique = assignments.filter((a) => {
            const key = `${a.chuteId}::${a.routeCode}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const rules = unique.map(assignmentToRule);

          // Shuffle rules to ensure order doesn't matter
          const shuffled = [...rules].reverse();
          const discrepancies = checkGridStemConsistency(unique, shuffled);

          expect(discrepancies).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * Generate random grid assignments with extra entries not in STEM —
   * those extras are flagged with source='grid'.
   */
  it('extra grid entries beyond STEM are flagged', () => {
    fc.assert(
      fc.property(
        fc.record({
          shared: fc.array(arbChuteAssignment, { minLength: 0, maxLength: 8 }),
          extras: fc.array(arbChuteAssignment, { minLength: 1, maxLength: 5 }),
        }),
        ({ shared, extras }) => {
          // Deduplicate shared assignments
          const seenShared = new Set();
          const uniqueShared = shared.filter((a) => {
            const key = `${a.chuteId}::${a.routeCode}`;
            if (seenShared.has(key)) return false;
            seenShared.add(key);
            return true;
          });

          // Ensure extras don't overlap with shared
          const uniqueExtras = extras.filter((a) => {
            const key = `${a.chuteId}::${a.routeCode}`;
            return !seenShared.has(key);
          });
          if (uniqueExtras.length === 0) return; // skip vacuous case

          // STEM rules only cover the shared assignments
          const stemRules = uniqueShared.map(assignmentToRule);

          // Grid has shared + extras
          const gridAssignments = [...uniqueShared, ...uniqueExtras];

          const discrepancies = checkGridStemConsistency(gridAssignments, stemRules);

          // Every extra should be flagged as source='grid'
          const gridFlagged = discrepancies.filter((d) => d.source === 'grid');
          for (const extra of uniqueExtras) {
            const found = gridFlagged.some(
              (d) => d.chuteId === extra.chuteId && d.routeCode === extra.routeCode,
            );
            expect(found).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
