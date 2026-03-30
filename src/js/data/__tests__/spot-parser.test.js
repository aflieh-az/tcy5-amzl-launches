/**
 * Property-based tests for spot-parser.js — validateSpotData
 *
 * Property 1: SPOT parsing produces complete volume breakdowns or rejects incomplete data
 * Validates: Requirements 1.1, 1.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateSpotData } from '../spot-parser.js';

// The 3 required parentStackingFilter values
const REQUIRED_FILTERS = [
  'TCY9->DCK6-CYC1',
  'TCY9->DFA5-CYC1',
  'TCY9->DSR2-CYC1',
];

const ADV_FIELDS = ['totalAdv', 'smallsAdv', 'nonconAdv', 'largeAdv'];

/**
 * Generator: a fully valid SpotRoute with non-negative numeric ADV fields
 * and one of the required parentStackingFilter values.
 */
const validRouteArb = (filter) =>
  fc.record({
    sortScheme: fc.constant('TCY9'),
    sortCenter: fc.constant('TCY5'),
    parentStackingFilter: fc.constant(filter),
    sundayRouteName: fc.string({ minLength: 1, maxLength: 10 }),
    routeName: fc.string({ minLength: 1, maxLength: 10 }),
    wave: fc.string({ minLength: 1, maxLength: 5 }),
    routeStatus: fc.constant('Active'),
    startDate: fc.constant('2025-03-01'),
    endDate: fc.constant('2025-12-31'),
    programType: fc.constant('AMZL'),
    totalAdv: fc.nat({ max: 50000 }),
    smallsAdv: fc.nat({ max: 50000 }),
    nonconAdv: fc.nat({ max: 50000 }),
    largeAdv: fc.nat({ max: 50000 }),
  });

/**
 * Generator: a complete set of 3 valid routes covering all required filters.
 */
const validRouteSetArb = fc.tuple(
  validRouteArb(REQUIRED_FILTERS[0]),
  validRouteArb(REQUIRED_FILTERS[1]),
  validRouteArb(REQUIRED_FILTERS[2])
).map(([a, b, c]) => [a, b, c]);

/**
 * Generator: a route with at least one invalid ADV field.
 * Picks a random ADV field and sets it to null, undefined, a string, or negative.
 */
const invalidAdvValueArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
  fc.constant('not-a-number'),
  fc.integer({ min: -100000, max: -1 }),
  fc.constant(NaN)
);

const routeWithBadAdvArb = (filter) =>
  fc.tuple(
    validRouteArb(filter),
    fc.constantFrom(...ADV_FIELDS),
    invalidAdvValueArb
  ).map(([route, field, badValue]) => {
    const corrupted = { ...route };
    corrupted[field] = badValue;
    return corrupted;
  });

describe('Property 1: SPOT parsing produces complete volume breakdowns or rejects incomplete data', () => {
  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * Sub-property 1a: When all 3 required routes are present with valid,
   * non-negative, numeric ADV fields, validateSpotData returns valid === true.
   */
  it('valid routes with non-negative ADV fields produce valid === true', () => {
    fc.assert(
      fc.property(validRouteSetArb, (routes) => {
        const result = validateSpotData(routes);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * Sub-property 1b: When any route has a missing, non-numeric, or negative
   * ADV field, validateSpotData returns valid === false with at least one error.
   */
  it('routes with invalid ADV fields produce valid === false with errors', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          routeWithBadAdvArb(REQUIRED_FILTERS[0]),
          validRouteArb(REQUIRED_FILTERS[1]),
          validRouteArb(REQUIRED_FILTERS[2])
        ),
        ([badRoute, goodRoute1, goodRoute2]) => {
          const result = validateSpotData([badRoute, goodRoute1, goodRoute2]);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * Sub-property 1c: When a required route is missing from the input,
   * validateSpotData returns valid === false with an error referencing
   * the missing route's parentStackingFilter.
   */
  it('missing required routes produce valid === false with error identifying the absent route', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 1, 2),
        fc.tuple(
          validRouteArb(REQUIRED_FILTERS[0]),
          validRouteArb(REQUIRED_FILTERS[1]),
          validRouteArb(REQUIRED_FILTERS[2])
        ),
        (dropIndex, [r0, r1, r2]) => {
          const allRoutes = [r0, r1, r2];
          const missingFilter = REQUIRED_FILTERS[dropIndex];
          const routes = allRoutes.filter((_, i) => i !== dropIndex);

          const result = validateSpotData(routes);
          expect(result.valid).toBe(false);

          const hasErrorForMissing = result.errors.some(
            (e) => e.message.includes(missingFilter)
          );
          expect(hasErrorForMissing).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * Sub-property 1d: For any valid route set, every route's ADV fields
   * are non-negative numbers in the validated output.
   */
  it('valid routes always have non-negative numeric ADV fields', () => {
    fc.assert(
      fc.property(validRouteSetArb, (routes) => {
        const result = validateSpotData(routes);
        if (result.valid) {
          for (const route of routes) {
            for (const field of ADV_FIELDS) {
              expect(typeof route[field]).toBe('number');
              expect(route[field]).toBeGreaterThanOrEqual(0);
              expect(Number.isNaN(route[field])).toBe(false);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
