/**
 * Property-based tests for stem-generator.js — Properties 10, 11, 12, 13
 *
 * Uses fast-check with minimum 100 iterations per property.
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateStemFile,
  validateStemFile,
} from '../stem-generator.js';
import { ALLOWED_AMZL_LANES } from '../../data/tcy5-config.js';

// ── Generators ──────────────────────────────────────────────

/** Generate a valid lane number (positive integer). */
const arbLane = fc.integer({ min: 1, max: 20 });

/** Generate a non-empty string suitable for stackingFilter / route codes. */
const arbStackingFilter = fc.stringMatching(/^[A-Z][A-Z0-9->]{2,20}$/);

/** Generate a chute ID — plain numeric or with -FLAT suffix. */
const arbChuteId = fc.oneof(
  fc.stringMatching(/^\d{3,6}$/),
  fc.stringMatching(/^\d{3,6}-FLAT$/),
);

/** Generate a valid resourceType. */
const arbResourceType = fc.constantFrom('D2C', 'Multi');

/** Generate a complete, valid SortationRule. */
const arbSortationRule = fc.record({
  lane: arbLane,
  stackingFilter: arbStackingFilter,
  vsm: fc.constant(''),
  resourceLabel: fc.constant(''),
  resourceType: arbResourceType,
  chute: arbChuteId,
  sorter: fc.constant(''),
});

/** Generate a ChuteAssignment (input to generateStemFile). */
const arbChuteAssignment = fc.record({
  chuteId: arbChuteId,
  lane: fc.constantFrom(...ALLOWED_AMZL_LANES),
  routeCode: arbStackingFilter,
  chuteType: arbResourceType,
  assignedAdv: fc.integer({ min: 1, max: 5000 }),
  volumeCategory: fc.constantFrom('Smalls', 'Large', 'Mixed'),
  isDuplicate: fc.constant(false),
});

/** Generate a PreservedAssignment. */
const arbPreservedAssignment = fc.record({
  chuteId: fc.stringMatching(/^ARSC-\d{5}$/),
  routeCode: fc.stringMatching(/^[A-Z][a-z]{3,10}$/),
  chuteType: arbResourceType,
  description: fc.string({ minLength: 1, maxLength: 30 }),
});


// ── Property 10: STEM file round-trip ───────────────────────

describe('Property 10: STEM file round-trip', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any valid set of SortationRules, generating a StemFile via
   * generateStemFile and inspecting the output rules SHALL produce
   * an equivalent set of rules to what was put in.
   *
   * We verify: generate rules → generateStemFile(rules, [], []) →
   * output.rules contains all input rules with matching fields.
   */
  it('rules passed as existing with no new assignments round-trip through generateStemFile', () => {
    fc.assert(
      fc.property(
        fc.array(arbSortationRule, { minLength: 1, maxLength: 20 }),
        (inputRules) => {
          // No new assignments, no preserved — existing rules should pass through
          const stemFile = generateStemFile(inputRules, [], []);

          // Every input rule should appear in the output
          for (const input of inputRules) {
            const match = stemFile.rules.find(
              (r) =>
                r.lane === input.lane &&
                r.stackingFilter === input.stackingFilter &&
                r.chute === input.chute &&
                r.resourceType === input.resourceType,
            );
            expect(match).toBeDefined();
          }

          // Output should have exactly the same count as input
          expect(stemFile.rules).toHaveLength(inputRules.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('new assignments appear as SortationRules in the output', () => {
    fc.assert(
      fc.property(
        fc.array(arbChuteAssignment, { minLength: 1, maxLength: 10 }),
        (assignments) => {
          const stemFile = generateStemFile([], assignments, []);

          for (const a of assignments) {
            const match = stemFile.rules.find(
              (r) =>
                r.chute === a.chuteId &&
                r.stackingFilter === a.routeCode &&
                r.lane === a.lane &&
                r.resourceType === a.chuteType,
            );
            expect(match).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 11: Existing unaffected rules are preserved in STEM output ──

describe('Property 11: Existing unaffected rules are preserved in STEM output', () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any STEM generation, every SortationRule in the existing rules
   * whose lane is NOT in the set of lanes being modified SHALL appear
   * unchanged in the output StemFile's rules array.
   */
  it('unaffected lane rules pass through unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(arbSortationRule, { minLength: 1, maxLength: 15 }),
        fc.array(arbChuteAssignment, { minLength: 1, maxLength: 5 }),
        (existingRules, newAssignments) => {
          const affectedLanes = new Set(newAssignments.map((a) => a.lane));

          const stemFile = generateStemFile(existingRules, newAssignments, []);

          // Every existing rule on an unaffected lane should be in the output
          const unaffectedRules = existingRules.filter(
            (r) => !affectedLanes.has(r.lane),
          );

          for (const rule of unaffectedRules) {
            const match = stemFile.rules.find(
              (r) =>
                r.lane === rule.lane &&
                r.stackingFilter === rule.stackingFilter &&
                r.chute === rule.chute &&
                r.resourceType === rule.resourceType,
            );
            expect(match).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('affected lane existing rules are replaced, not preserved', () => {
    fc.assert(
      fc.property(
        fc.array(arbChuteAssignment, { minLength: 1, maxLength: 5 }),
        (newAssignments) => {
          const affectedLanes = new Set(newAssignments.map((a) => a.lane));

          // Create existing rules specifically on affected lanes
          const existingOnAffected = [...affectedLanes].map((lane) => ({
            lane,
            stackingFilter: 'OLD-ROUTE-TO-REPLACE',
            vsm: '',
            resourceLabel: '',
            resourceType: 'Multi',
            chute: `old-chute-${lane}`,
            sorter: '',
          }));

          const stemFile = generateStemFile(existingOnAffected, newAssignments, []);

          // Old rules on affected lanes should NOT appear in output
          for (const old of existingOnAffected) {
            const found = stemFile.rules.find(
              (r) =>
                r.chute === old.chute &&
                r.stackingFilter === old.stackingFilter,
            );
            expect(found).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 12: No unintentional duplicate chute-to-route entries in STEM ──

describe('Property 12: No unintentional duplicate chute-to-route entries in STEM', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * A StemFile with unique chute+stackingFilter combinations should
   * pass validation. A StemFile with intentional duplicates (same
   * chute+stackingFilter) should be caught by validateStemFile.
   */
  it('unique chute+stackingFilter combinations pass validation', () => {
    fc.assert(
      fc.property(
        fc.array(arbSortationRule, { minLength: 1, maxLength: 15 }),
        (rules) => {
          // Deduplicate by chute+stackingFilter to guarantee uniqueness
          const seen = new Set();
          const uniqueRules = rules.filter((r) => {
            const key = `${r.chute}::${r.stackingFilter}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const file = { rules: uniqueRules, metadata: {} };
          const result = validateStemFile(file);

          // No duplicate errors should exist
          const dupErrors = result.errors.filter((e) =>
            e.message.includes('Duplicate'),
          );
          expect(dupErrors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('duplicate chute+stackingFilter entries are caught by validation', () => {
    fc.assert(
      fc.property(
        arbSortationRule,
        (rule) => {
          // Create a file with the same rule duplicated
          const file = {
            rules: [
              { ...rule },
              { ...rule },
            ],
            metadata: {},
          };
          const result = validateStemFile(file);

          const dupErrors = result.errors.filter((e) =>
            e.message.includes('Duplicate'),
          );
          expect(dupErrors.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 13: STEM validation rejects malformed files ────

describe('Property 13: STEM validation rejects malformed files', () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any StemFile where a rule is missing a required field
   * (chute, stackingFilter, lane, resourceType), validateStemFile
   * SHALL return valid === false with an error identifying the
   * specific missing field.
   */
  const requiredFields = ['chute', 'stackingFilter', 'lane', 'resourceType'];

  it('removing any single required field causes validation failure', () => {
    fc.assert(
      fc.property(
        arbSortationRule,
        fc.constantFrom(...requiredFields),
        (rule, fieldToRemove) => {
          const malformed = { ...rule };

          // Null out the chosen required field
          if (fieldToRemove === 'lane') {
            malformed.lane = null;
          } else {
            malformed[fieldToRemove] = '';
          }

          const file = { rules: [malformed], metadata: {} };
          const result = validateStemFile(file);

          expect(result.valid).toBe(false);
          expect(
            result.errors.some((e) => e.field === fieldToRemove),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('removing multiple required fields produces errors for each', () => {
    fc.assert(
      fc.property(
        arbSortationRule,
        fc.subarray(requiredFields, { minLength: 2 }),
        (rule, fieldsToRemove) => {
          const malformed = { ...rule };

          for (const field of fieldsToRemove) {
            if (field === 'lane') {
              malformed.lane = null;
            } else {
              malformed[field] = '';
            }
          }

          const file = { rules: [malformed], metadata: {} };
          const result = validateStemFile(file);

          expect(result.valid).toBe(false);

          for (const field of fieldsToRemove) {
            expect(
              result.errors.some((e) => e.field === field),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a fully valid rule passes validation', () => {
    fc.assert(
      fc.property(
        arbSortationRule,
        (rule) => {
          const file = { rules: [rule], metadata: {} };
          const result = validateStemFile(file);

          // No missing-field errors (there could be duplicate errors if
          // somehow generated, but a single rule can't duplicate itself)
          const missingFieldErrors = result.errors.filter((e) =>
            e.message.includes('missing required field'),
          );
          expect(missingFieldErrors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
