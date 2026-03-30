/**
 * Property-based tests for grid-renderer.js — Property 8
 *
 * Uses fast-check with minimum 100 iterations per property.
 * Validates: Requirements 4.4
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { renderFloorGrid } from '../grid-renderer.js';

// ── Helpers ─────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Generators ──────────────────────────────────────────────

const arbChuteId = fc.stringMatching(/^[A-Z0-9]{1,4}-?\d{3,6}(-FLAT)?$/)
  .filter((s) => s.length > 0);

const arbRouteCode = fc.stringMatching(/^[A-Z]{3}\d->[A-Z]{3}\d-CYC\d$/)
  .filter((s) => s.length > 0);

const arbAdv = fc.integer({ min: 1, max: 9999 });

const arbLane = fc.constantFrom(5, 6, 7, 12, 19, 20);

// ── Property 8: Chute assignments respect lane boundaries ───

describe('Property 8: Chute assignments respect lane boundaries', () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * For any ChuteAssignment, the chuteId SHALL be a member of the chutes
   * array in the LaneGeometry whose lane matches the assignment's lane.
   *
   * We generate geometry with known chutes per lane (including chuteDetails),
   * create assignments only for those chutes, and verify the HTML output
   * contains each chute ID and lane label.
   */
  it('each assigned chute appears in the HTML output of renderFloorGrid', () => {
    // Generator: build geometry with 1-3 lanes, each with 1-4 chutes
    const arbFilter = fc.constantFrom('93274-SMALL', '93430-LARGE', 'dynamic', 'psolve', '95340-SMALL');

    const arbGeometryAndAssignments = fc
      .array(
        fc.record({
          lane: arbLane,
          chutes: fc.array(arbChuteId, { minLength: 1, maxLength: 4 }),
        }),
        { minLength: 1, maxLength: 3 },
      )
      // Deduplicate lanes — keep only the first occurrence of each lane number
      .map((entries) => {
        const seen = new Set();
        return entries.filter((e) => {
          if (seen.has(e.lane)) return false;
          seen.add(e.lane);
          return true;
        });
      })
      .filter((entries) => entries.length > 0)
      .chain((laneEntries) => {
        // Build geometry objects with grid positions and chuteDetails
        const geometryArbs = laneEntries.map((entry, idx) =>
          fc.tuple(
            ...entry.chutes.map((cid) =>
              fc.record({
                chuteId: fc.constant(cid),
                filter: arbFilter,
                route: fc.constant(''),
                adv: fc.constant(null),
              })
            )
          ).map((details) => ({
            lane: entry.lane,
            gridRow: 0,
            gridCol: idx,
            chutes: entry.chutes,
            chuteDetails: details,
            waveGroup: '',
          }))
        );

        return fc.tuple(...geometryArbs).chain((geometry) => {
          // Build assignments that only reference chutes existing in their lane
          const assignmentArbs = [];
          for (const geo of geometry) {
            for (const chuteId of geo.chutes) {
              assignmentArbs.push(
                fc.record({
                  chuteId: fc.constant(chuteId),
                  lane: fc.constant(geo.lane),
                  routeCode: arbRouteCode,
                  chuteType: fc.constantFrom('D2C', 'Multi'),
                  assignedAdv: arbAdv,
                  volumeCategory: fc.constantFrom('Smalls', 'Large', 'Mixed'),
                  isDuplicate: fc.constant(false),
                }),
              );
            }
          }

          if (assignmentArbs.length === 0) {
            return fc.constant({ geometry, assignments: [] });
          }

          return fc.tuple(...assignmentArbs).map((assignments) => ({
            geometry,
            assignments,
          }));
        });
      });

    fc.assert(
      fc.property(arbGeometryAndAssignments, ({ geometry, assignments }) => {
        const html = renderFloorGrid(geometry, assignments, []);

        // Output must be an HTML table
        expect(html).toContain('<table');

        // Every assigned chute ID must appear in the HTML (escaped)
        for (const a of assignments) {
          expect(html).toContain(escapeXml(a.chuteId));
        }

        // Every chute in geometry must appear in the HTML (even unassigned ones)
        for (const geo of geometry) {
          for (const chuteId of geo.chutes) {
            expect(html).toContain(escapeXml(chuteId));
          }
        }

        // Verify row labels are present (lanes are columns, rows are labeled "Row X")
        for (const geo of geometry) {
          expect(html).toContain(`Row ${geo.lane}`);
        }
      }),
      { numRuns: 100 },
    );
  });
});
