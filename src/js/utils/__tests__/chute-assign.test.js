/**
 * Unit tests for chute-assign.js
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.3
 */
import { describe, it, expect } from 'vitest';
import {
  classifyChute,
  isExcluded,
  generateAssignments,
  splitOverCapacity,
  scoreChuteDisplacement,
} from '../chute-assign.js';

// ── scoreChuteDisplacement ──────────────────────────────────
describe('scoreChuteDisplacement', () => {
  it('scores low-ADV DDU chutes (<200) as 0 (best candidate)', () => {
    expect(scoreChuteDisplacement({ filter: '93274-SMALL', adv: 150 }).score).toBe(0);
  });

  it('scores psolve chutes as 1', () => {
    expect(scoreChuteDisplacement({ filter: 'psolve', adv: 50 }).score).toBe(1);
  });

  it('scores mid-ADV DDU chutes (200-500) as 2', () => {
    expect(scoreChuteDisplacement({ filter: '93274-SMALL', adv: 305 }).score).toBe(2);
  });

  it('scores dynamic/empty chutes as 3 (congestion risk near induction)', () => {
    expect(scoreChuteDisplacement({ filter: 'dynamic', adv: 0 }).score).toBe(3);
    expect(scoreChuteDisplacement({ filter: '', adv: null }).score).toBe(3);
    expect(scoreChuteDisplacement({ filter: null, adv: 0 }).score).toBe(3);
  });

  it('scores high-ADV chutes (>500) as 4', () => {
    expect(scoreChuteDisplacement({ filter: '93274-SMALL', adv: 800 }).score).toBe(4);
  });

  it('scores cycle/recirc as 5 (never swap)', () => {
    expect(scoreChuteDisplacement({ filter: 'DSJ5-CYCLE1', adv: 200 }).score).toBe(5);
    expect(scoreChuteDisplacement({ filter: 'recirc', adv: 100 }).score).toBe(5);
  });

  it('scores KSMF/USPS/FF as 5 (never swap)', () => {
    expect(scoreChuteDisplacement({ filter: 'DHI2-KSMF-AA', adv: 100 }).score).toBe(5);
    expect(scoreChuteDisplacement({ filter: 'USPS-FCM-SMALL', adv: 100 }).score).toBe(5);
    expect(scoreChuteDisplacement({ filter: 'FF', adv: 100 }).score).toBe(5);
  });

  it('returns a human-readable reason string', () => {
    const result = scoreChuteDisplacement({ filter: 'dynamic', adv: 0 });
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ── classifyChute ───────────────────────────────────────────
describe('classifyChute', () => {
  it('returns D2C for chute IDs ending in -FLAT', () => {
    expect(classifyChute('20220-FLAT')).toBe('D2C');
    expect(classifyChute('ARSC-20220-FLAT')).toBe('D2C');
  });

  it('returns Multi for chute IDs not ending in -FLAT', () => {
    expect(classifyChute('20501')).toBe('Multi');
    expect(classifyChute('ARSC-21620')).toBe('Multi');
    expect(classifyChute('20220-FLAT-X')).toBe('Multi');
  });
});

// ── isExcluded ──────────────────────────────────────────────
describe('isExcluded', () => {
  it('returns false when exclusion list is empty', () => {
    expect(isExcluded('20105', 5)).toBe(false);
    expect(isExcluded('20106', 6)).toBe(false);
    expect(isExcluded('21605', 5)).toBe(false);
    expect(isExcluded('21606', 6)).toBe(false);
  });

  it('returns false for any chute on any lane', () => {
    expect(isExcluded('20501', 5)).toBe(false);
    expect(isExcluded('99999', 6)).toBe(false);
    expect(isExcluded('20105', 7)).toBe(false);
  });
});


// ── generateAssignments ─────────────────────────────────────
describe('generateAssignments', () => {
  const baseConfig = {
    ALLOWED_AMZL_LANES: [6, 7],
    EXCLUDED_CHUTES_LANE_5_6: ['20106'],
    PRESERVED_ASSIGNMENTS: [{ chuteId: 'ARSC-21620', routeCode: 'Chico', chuteType: 'Multi' }],
    chutesPerLane: {
      6: ['20106', '20601', '20601-FLAT'],
      7: ['20701', '20701-FLAT'],
    },
  };

  const routes = [
    {
      parentStackingFilter: 'TCY9->DCK6-CYC1',
      smallsAdv: 500,
      largeAdv: 300,
      nonconAdv: 50,
    },
  ];

  it('assigns FLAT chutes to Smalls and non-FLAT to Large', () => {
    const result = generateAssignments(routes, [], baseConfig);
    const flat = result.filter((a) => a.chuteType === 'D2C');
    const multi = result.filter((a) => a.chuteType === 'Multi');

    flat.forEach((a) => expect(a.volumeCategory).toBe('Smalls'));
    multi.forEach((a) => expect(['Large', 'Mixed']).toContain(a.volumeCategory));
  });

  it('only assigns to allowed lanes', () => {
    const result = generateAssignments(routes, [], baseConfig);
    result.forEach((a) => expect([6, 7]).toContain(a.lane));
  });

  it('skips excluded chutes', () => {
    const result = generateAssignments(routes, [], baseConfig);
    const lane6 = result.filter((a) => a.lane === 6);
    lane6.forEach((a) => expect(a.chuteId).not.toBe('20106'));
  });

  it('never overwrites preserved assignments', () => {
    const configWithPreserved = {
      ...baseConfig,
      chutesPerLane: {
        6: ['ARSC-21620', '20601'],
        7: ['20701'],
      },
    };
    const result = generateAssignments(routes, [], configWithPreserved);
    expect(result.find((a) => a.chuteId === 'ARSC-21620')).toBeUndefined();
  });

  it('returns empty array when no routes provided', () => {
    expect(generateAssignments([], [], baseConfig)).toEqual([]);
  });

  it('skips chutes when no volume remains', () => {
    const tinyRoute = [
      { parentStackingFilter: 'R1', smallsAdv: 0, largeAdv: 0, nonconAdv: 0 },
    ];
    const result = generateAssignments(tinyRoute, [], baseConfig);
    expect(result).toEqual([]);
  });

  it('prefers low-ADV DDU chutes over dynamic slots when geometry is provided', () => {
    const configWithGeometry = {
      ALLOWED_AMZL_LANES: [6],
      EXCLUDED_CHUTES_LANE_5_6: [],
      PRESERVED_ASSIGNMENTS: [],
      chutesPerLane: { 6: ['C-HIGH', 'C-DYN', 'C-LOW'] },
      geometry: [{
        lane: 6,
        chuteDetails: [
          { chuteId: 'C-HIGH', filter: '93274-SMALL', adv: 800 },
          { chuteId: 'C-DYN', filter: 'dynamic', adv: 0 },
          { chuteId: 'C-LOW', filter: '93274-SMALL', adv: 100 },
        ],
      }],
    };
    const result = generateAssignments(routes, [], configWithGeometry);
    // Should pick the low-ADV DDU chute first (score 0), not dynamic (score 3)
    expect(result[0].chuteId).toBe('C-LOW');
  });

  it('skips cycle/recirc chutes (score 5) even when available', () => {
    const configWithCycle = {
      ALLOWED_AMZL_LANES: [6],
      EXCLUDED_CHUTES_LANE_5_6: [],
      PRESERVED_ASSIGNMENTS: [],
      chutesPerLane: { 6: ['C-CYCLE', 'C-OK'] },
      geometry: [{
        lane: 6,
        chuteDetails: [
          { chuteId: 'C-CYCLE', filter: 'DSJ5-CYCLE1', adv: 200 },
          { chuteId: 'C-OK', filter: 'dynamic', adv: 0 },
        ],
      }],
    };
    const result = generateAssignments(routes, [], configWithCycle);
    // Should never assign to the cycle chute
    expect(result.find((a) => a.chuteId === 'C-CYCLE')).toBeUndefined();
  });

  it('assigns high-volume routes to middle rows and low-volume to outer rows', () => {
    // Create chutes across multiple rows on lane 6:
    // Row 2 (outer): 20206, Row 8 (middle): 20806, Row 14 (outer): 21406
    const configRowPref = {
      ALLOWED_AMZL_LANES: [6],
      EXCLUDED_CHUTES_LANE_5_6: [],
      PRESERVED_ASSIGNMENTS: [],
      chutesPerLane: { 6: ['20206', '20806', '21406'] },
      geometry: [{
        lane: 6,
        chuteDetails: [
          { chuteId: '20206', filter: 'dynamic', adv: 0 },
          { chuteId: '20806', filter: 'dynamic', adv: 0 },
          { chuteId: '21406', filter: 'dynamic', adv: 0 },
        ],
      }],
    };
    // Two routes: high-volume first, low-volume second
    const twoRoutes = [
      { parentStackingFilter: 'TCY9->DSR2-CYC1', smallsAdv: 0, largeAdv: 1500, nonconAdv: 0 },
      { parentStackingFilter: 'TCY9->DCK6-CYC1', smallsAdv: 0, largeAdv: 500, nonconAdv: 0 },
    ];
    const result = generateAssignments(twoRoutes, [], configRowPref);
    // High-volume route (DSR2) should get middle row 8
    const dsr2 = result.find((a) => a.routeCode === 'TCY9->DSR2-CYC1');
    expect(dsr2).toBeDefined();
    expect(dsr2.chuteId).toBe('20806');
    // Low-volume route (DCK6) should get an outer row (2 or 14)
    const dck6 = result.find((a) => a.routeCode === 'TCY9->DCK6-CYC1');
    expect(dck6).toBeDefined();
    expect(['20206', '21406']).toContain(dck6.chuteId);
  });

  it('blocks highest-volume route from rows 14-16 (hard constraint)', () => {
    // Only chutes available are on rows 14, 15, 16 and row 8
    const configHardBlock = {
      ALLOWED_AMZL_LANES: [6],
      EXCLUDED_CHUTES_LANE_5_6: [],
      PRESERVED_ASSIGNMENTS: [],
      HIGH_VOLUME_EXCLUDED_ROWS: [14, 15, 16],
      chutesPerLane: { 6: ['21406', '21506', '21606', '20806'] },
      geometry: [{
        lane: 6,
        chuteDetails: [
          { chuteId: '21406', filter: 'dynamic', adv: 0 },
          { chuteId: '21506', filter: 'dynamic', adv: 0 },
          { chuteId: '21606', filter: 'dynamic', adv: 0 },
          { chuteId: '20806', filter: 'dynamic', adv: 0 },
        ],
      }],
    };
    // Single high-volume route — must NOT land on rows 14-16
    const highVolRoute = [
      { parentStackingFilter: 'TCY9->DSR2-CYC1', smallsAdv: 0, largeAdv: 1500, nonconAdv: 0 },
    ];
    const result = generateAssignments(highVolRoute, [], configHardBlock);
    expect(result.length).toBeGreaterThan(0);
    // All assignments for the highest-volume route must be on row 8, not 14/15/16
    for (const a of result) {
      const row = parseInt(String(a.chuteId).substring(0, 3), 10) - 200;
      expect([14, 15, 16]).not.toContain(row);
    }
  });
});

// ── splitOverCapacity ───────────────────────────────────────
describe('splitOverCapacity', () => {
  it('does not split assignments at or below maxAdv', () => {
    const input = [
      { chuteId: 'C1', assignedAdv: 1800, routeCode: 'R1', isDuplicate: false },
    ];
    const result = splitOverCapacity(input, 1800);
    expect(result).toHaveLength(1);
    expect(result[0].assignedAdv).toBe(1800);
    expect(result[0].isDuplicate).toBe(false);
  });

  it('splits an assignment exceeding maxAdv into multiple chutes', () => {
    const input = [
      { chuteId: 'C1', assignedAdv: 3600, routeCode: 'R1', lane: 5, chuteType: 'Multi', volumeCategory: 'Large', isDuplicate: false },
    ];
    const result = splitOverCapacity(input, 1800);
    expect(result.length).toBeGreaterThan(1);
    result.slice(1).forEach((a) => {
      expect(a.isDuplicate).toBe(true);
      expect(a.originalChuteId).toBe('C1');
    });
  });

  it('preserves total ADV per route after splitting', () => {
    const input = [
      { chuteId: 'C1', assignedAdv: 4000, routeCode: 'R1', lane: 5, chuteType: 'Multi', volumeCategory: 'Large', isDuplicate: false },
      { chuteId: 'C2', assignedAdv: 1500, routeCode: 'R1', lane: 5, chuteType: 'D2C', volumeCategory: 'Smalls', isDuplicate: false },
    ];
    const totalBefore = input.reduce((s, a) => s + a.assignedAdv, 0);
    const result = splitOverCapacity(input, 1800);
    const totalAfter = result.reduce((s, a) => s + a.assignedAdv, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it('ensures all split chutes are at or below maxAdv', () => {
    const input = [
      { chuteId: 'C1', assignedAdv: 5400, routeCode: 'R1', lane: 7, chuteType: 'Multi', volumeCategory: 'Large', isDuplicate: false },
    ];
    const result = splitOverCapacity(input, 1800);
    result.forEach((a) => expect(a.assignedAdv).toBeLessThanOrEqual(1800));
  });

  it('uses default maxAdv of 1800 when not specified', () => {
    const input = [
      { chuteId: 'C1', assignedAdv: 2000, routeCode: 'R1', lane: 5, chuteType: 'Multi', volumeCategory: 'Large', isDuplicate: false },
    ];
    const result = splitOverCapacity(input);
    expect(result.length).toBe(2);
    result.forEach((a) => expect(a.assignedAdv).toBeLessThanOrEqual(1800));
  });
});
