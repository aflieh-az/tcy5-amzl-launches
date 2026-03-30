/**
 * Property-based tests for change-overview.js — Properties 9, 15
 *
 * Uses fast-check with minimum 100 iterations per property.
 * Validates: Requirements 5.1, 5.2, 8.1
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateChangeOverview } from '../change-overview.js';
import { ALLOWED_AMZL_LANES } from '../../data/tcy5-config.js';

// ── Generators ──────────────────────────────────────────────

/** Generate a random chute ID — either plain numeric or with -FLAT suffix. */
const arbChuteId = fc.oneof(
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}$/),
  fc.stringMatching(/^[A-Z]{0,4}-?\d{3,6}-FLAT$/),
);

/** Generate a lane from the allowed set. */
const arbLane = fc.constantFrom(...ALLOWED_AMZL_LANES);

/** Generate a route code. */
const arbRouteCode = fc.stringMatching(/^[A-Z]{3}\d->[A-Z]{3}\d-CYC\d$/);

/** Generate a ChuteAssignment-like object. */
const arbAssignment = fc.record({
  chuteId: arbChuteId,
  lane: arbLane,
  routeCode: arbRouteCode,
  chuteType: fc.constantFrom('D2C', 'Multi'),
  assignedAdv: fc.integer({ min: 1, max: 3000 }),
  volumeCategory: fc.constantFrom('Smalls', 'Large', 'Mixed'),
  isDuplicate: fc.boolean(),
});

/**
 * Generate a pair of old and new assignment arrays with some overlapping
 * chuteIds (to trigger type/route changes) and some unique to new (brand-new).
 */
const arbAssignmentPair = fc
  .record({
    sharedIds: fc.array(arbChuteId, { minLength: 1, maxLength: 8 }),
    newOnlyIds: fc.array(arbChuteId, { minLength: 0, maxLength: 5 }),
    lane: arbLane,
    oldRouteCode: arbRouteCode,
    newRouteCode: arbRouteCode,
    oldType: fc.constantFrom('D2C', 'Multi'),
    newType: fc.constantFrom('D2C', 'Multi'),
  })
  .map(({ sharedIds, newOnlyIds, lane, oldRouteCode, newRouteCode, oldType, newType }) => {
    const oldAssignments = sharedIds.map((id) => ({
      chuteId: id,
      lane,
      routeCode: oldRouteCode,
      chuteType: oldType,
      assignedAdv: 500,
      volumeCategory: oldType === 'D2C' ? 'Smalls' : 'Large',
      isDuplicate: false,
    }));

    const newAssignments = [
      ...sharedIds.map((id) => ({
        chuteId: id,
        lane,
        routeCode: newRouteCode,
        chuteType: newType,
        assignedAdv: 600,
        volumeCategory: newType === 'D2C' ? 'Smalls' : 'Large',
        isDuplicate: false,
      })),
      ...newOnlyIds.map((id) => ({
        chuteId: id,
        lane,
        routeCode: newRouteCode,
        chuteType: newType,
        assignedAdv: 400,
        volumeCategory: newType === 'D2C' ? 'Smalls' : 'Large',
        isDuplicate: false,
      })),
    ];

    return { oldAssignments, newAssignments, sharedIds, newOnlyIds, oldRouteCode, newRouteCode, oldType, newType };
  });

// ── Property 9: Change overview items are complete and reflect actual diffs ──

describe('Property 9: Change overview items are complete and reflect actual diffs', () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * For any pair of old and new assignment sets, every ChangeOverviewItem
   * generated SHALL have non-empty chuteId, a valid lane (positive number),
   * and a changeType of 'PanD2C_Flip' or '5S_Square'.
   */
  it('every change item has non-empty chuteId, positive lane, and valid changeType', () => {
    fc.assert(
      fc.property(arbAssignmentPair, ({ oldAssignments, newAssignments }) => {
        const changes = generateChangeOverview(oldAssignments, newAssignments);

        for (const item of changes) {
          // Non-empty chuteId
          expect(item.chuteId).toBeTruthy();
          expect(typeof item.chuteId).toBe('string');
          expect(item.chuteId.length).toBeGreaterThan(0);

          // Valid lane (positive number)
          expect(typeof item.lane).toBe('number');
          expect(item.lane).toBeGreaterThan(0);

          // Valid changeType
          expect(['PanD2C_Flip', '5S_Square']).toContain(item.changeType);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * Every ChangeOverviewItem SHALL correspond to an actual difference between
   * the old and new assignments for that chute — either a type change
   * (PanD2C_Flip) or a route change / new assignment (5S_Square).
   */
  it('every change item corresponds to an actual diff between old and new', () => {
    fc.assert(
      fc.property(arbAssignmentPair, ({ oldAssignments, newAssignments }) => {
        const changes = generateChangeOverview(oldAssignments, newAssignments);

        // Build lookup of old assignments by chuteId
        const oldMap = new Map();
        for (const a of oldAssignments) {
          oldMap.set(a.chuteId, a);
        }

        for (const item of changes) {
          const oldA = oldMap.get(item.chuteId);
          const newA = newAssignments.find((a) => a.chuteId === item.chuteId);

          // The item must reference a chute that exists in newAssignments
          expect(newA).toBeDefined();

          if (item.changeType === 'PanD2C_Flip') {
            // Must have an old assignment with a different chuteType
            expect(oldA).toBeDefined();
            expect(oldA.chuteType).not.toBe(newA.chuteType);
          } else if (item.changeType === '5S_Square') {
            // Either brand-new (no old) or route changed
            if (oldA) {
              expect(oldA.routeCode).not.toBe(newA.routeCode);
            }
            // If no oldA, it's a brand-new assignment — valid 5S_Square
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * When old and new assignments are identical (same chuteId, type, route),
   * no change items should be generated.
   */
  it('produces no changes when old and new assignments are identical', () => {
    fc.assert(
      fc.property(
        fc.array(arbAssignment, { minLength: 1, maxLength: 10 }),
        (assignments) => {
          const changes = generateChangeOverview(assignments, assignments);
          expect(changes).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 15: Ops checklist covers all change overview items ──

describe('Property 15: Ops checklist covers all change overview items', () => {
  /**
   * **Validates: Requirements 8.1**
   *
   * Every change item produced by generateChangeOverview must have all
   * required fields for downstream checklist generation: chuteId, lane,
   * changeType, and description. Every description must be non-empty.
   */
  it('every change item has all required fields for checklist generation', () => {
    fc.assert(
      fc.property(arbAssignmentPair, ({ oldAssignments, newAssignments }) => {
        const changes = generateChangeOverview(oldAssignments, newAssignments);

        for (const item of changes) {
          // Required fields for OpsChecklistItem generation
          expect(item).toHaveProperty('chuteId');
          expect(item).toHaveProperty('lane');
          expect(item).toHaveProperty('changeType');
          expect(item).toHaveProperty('description');

          // chuteId must be non-empty string
          expect(typeof item.chuteId).toBe('string');
          expect(item.chuteId.length).toBeGreaterThan(0);

          // lane must be a positive number
          expect(typeof item.lane).toBe('number');
          expect(item.lane).toBeGreaterThan(0);

          // changeType must be valid
          expect(['PanD2C_Flip', '5S_Square']).toContain(item.changeType);

          // description must be non-empty string
          expect(typeof item.description).toBe('string');
          expect(item.description.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.1**
   *
   * For any set of changes, every unique chuteId that has an actual diff
   * must appear in at least one ChangeOverviewItem — ensuring no change
   * is silently dropped before checklist generation.
   */
  it('every actual diff produces at least one change item', () => {
    fc.assert(
      fc.property(arbAssignmentPair, ({ oldAssignments, newAssignments }) => {
        const changes = generateChangeOverview(oldAssignments, newAssignments);

        const oldMap = new Map();
        for (const a of oldAssignments) {
          oldMap.set(a.chuteId, a);
        }

        // For each new assignment, if there's an actual diff, it must appear in changes
        for (const newA of newAssignments) {
          const oldA = oldMap.get(newA.chuteId);
          const hasTypeDiff = oldA && oldA.chuteType !== newA.chuteType;
          const hasRouteDiff = oldA && oldA.routeCode !== newA.routeCode;
          const isNew = !oldA;

          if (hasTypeDiff || hasRouteDiff || isNew) {
            const itemsForChute = changes.filter((c) => c.chuteId === newA.chuteId);
            expect(itemsForChute.length).toBeGreaterThanOrEqual(1);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
