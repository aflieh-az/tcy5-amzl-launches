/**
 * change-overview.test.js — Unit tests for the Change Overview panel
 *
 * Tests generateChangeOverview logic and renderChangeOverview HTML output.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateChangeOverview, renderChangeOverview } from '../change-overview.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssignment(overrides = {}) {
  return {
    chuteId: '20501',
    lane: 7,
    routeCode: 'TCY9->DCK6-CYC1',
    chuteType: 'Multi',
    assignedAdv: 500,
    volumeCategory: 'Large',
    isDuplicate: false,
    ...overrides,
  };
}

function makeDom() {
  const el = document.createElement('div');
  el.id = 'panel-change-overview';
  return el;
}

// ---------------------------------------------------------------------------
// generateChangeOverview
// ---------------------------------------------------------------------------

describe('generateChangeOverview', () => {
  it('returns empty array when old and new are identical', () => {
    const a = [makeAssignment()];
    const result = generateChangeOverview(a, a);
    expect(result).toEqual([]);
  });

  it('detects PanD2C_Flip when chuteType changes D2C → Multi', () => {
    const old = [makeAssignment({ chuteId: 'C1', chuteType: 'D2C', routeCode: 'R1' })];
    const nw = [makeAssignment({ chuteId: 'C1', chuteType: 'Multi', routeCode: 'R1' })];
    const result = generateChangeOverview(old, nw);

    const flip = result.find((r) => r.changeType === 'PanD2C_Flip');
    expect(flip).toBeDefined();
    expect(flip.chuteId).toBe('C1');
    expect(flip.fromState).toBe('D2C');
    expect(flip.toState).toBe('Multi');
  });

  it('detects PanD2C_Flip when chuteType changes Multi → D2C', () => {
    const old = [makeAssignment({ chuteId: 'C2', chuteType: 'Multi', routeCode: 'R1' })];
    const nw = [makeAssignment({ chuteId: 'C2', chuteType: 'D2C', routeCode: 'R1' })];
    const result = generateChangeOverview(old, nw);

    const flip = result.find((r) => r.changeType === 'PanD2C_Flip');
    expect(flip).toBeDefined();
    expect(flip.fromState).toBe('Multi');
    expect(flip.toState).toBe('D2C');
  });

  it('detects 5S_Square for brand-new assignment (no old entry)', () => {
    const old = [];
    const nw = [makeAssignment({ chuteId: 'C3', routeCode: 'R2' })];
    const result = generateChangeOverview(old, nw);

    expect(result).toHaveLength(1);
    expect(result[0].changeType).toBe('5S_Square');
    expect(result[0].chuteId).toBe('C3');
    expect(result[0].fromState).toBeUndefined();
    expect(result[0].toState).toBe('R2');
  });

  it('detects 5S_Square when route changes on existing chute', () => {
    const old = [makeAssignment({ chuteId: 'C4', routeCode: 'OLD_ROUTE' })];
    const nw = [makeAssignment({ chuteId: 'C4', routeCode: 'NEW_ROUTE' })];
    const result = generateChangeOverview(old, nw);

    const sq = result.find((r) => r.changeType === '5S_Square');
    expect(sq).toBeDefined();
    expect(sq.fromState).toBe('OLD_ROUTE');
    expect(sq.toState).toBe('NEW_ROUTE');
  });

  it('emits both PanD2C_Flip and 5S_Square when type AND route change', () => {
    const old = [makeAssignment({ chuteId: 'C5', chuteType: 'D2C', routeCode: 'R_OLD' })];
    const nw = [makeAssignment({ chuteId: 'C5', chuteType: 'Multi', routeCode: 'R_NEW' })];
    const result = generateChangeOverview(old, nw);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.changeType).sort()).toEqual(['5S_Square', 'PanD2C_Flip']);
  });

  it('every item has required fields', () => {
    const old = [makeAssignment({ chuteId: 'X1', chuteType: 'D2C', routeCode: 'A' })];
    const nw = [
      makeAssignment({ chuteId: 'X1', chuteType: 'Multi', routeCode: 'B', lane: 5 }),
      makeAssignment({ chuteId: 'X2', routeCode: 'C', lane: 12 }),
    ];
    const result = generateChangeOverview(old, nw);

    for (const item of result) {
      expect(item.chuteId).toBeTruthy();
      expect(typeof item.lane).toBe('number');
      expect(['PanD2C_Flip', '5S_Square']).toContain(item.changeType);
      expect(item.description).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// renderChangeOverview
// ---------------------------------------------------------------------------

describe('renderChangeOverview', () => {
  let el;
  beforeEach(() => {
    el = makeDom();
  });

  it('shows "No floor changes needed" for lanes with no changes', () => {
    renderChangeOverview(el, [], [], [5, 6]);
    expect(el.innerHTML).toContain('No floor changes needed for Lane 5');
    expect(el.innerHTML).toContain('No floor changes needed for Lane 6');
  });

  it('renders PanD2C_Flip table for a lane with flips', () => {
    const old = [makeAssignment({ chuteId: 'C1', chuteType: 'D2C', routeCode: 'R1', lane: 7 })];
    const nw = [makeAssignment({ chuteId: 'C1', chuteType: 'Multi', routeCode: 'R1', lane: 7 })];
    renderChangeOverview(el, old, nw, [7]);

    expect(el.innerHTML).toContain('PanD2C Flips');
    expect(el.innerHTML).toContain('C1');
    expect(el.innerHTML).toContain('D2C');
    expect(el.innerHTML).toContain('Multi');
  });

  it('renders 5S Square table for a lane with new assignments', () => {
    const nw = [makeAssignment({ chuteId: 'C2', routeCode: 'R2', lane: 12 })];
    renderChangeOverview(el, [], nw, [12]);

    expect(el.innerHTML).toContain('5S Square Changes');
    expect(el.innerHTML).toContain('C2');
    expect(el.innerHTML).toContain('R2');
  });

  it('groups changes by lane and renders lanes in numeric order', () => {
    const nw = [
      makeAssignment({ chuteId: 'A', lane: 20, routeCode: 'R1' }),
      makeAssignment({ chuteId: 'B', lane: 5, routeCode: 'R2' }),
    ];
    renderChangeOverview(el, [], nw, [20, 5]);

    const lane5Pos = el.innerHTML.indexOf('Lane 5');
    const lane20Pos = el.innerHTML.indexOf('Lane 20');
    expect(lane5Pos).toBeLessThan(lane20Pos);
  });

  it('escapes HTML in chute IDs and descriptions', () => {
    const nw = [makeAssignment({ chuteId: '<script>alert(1)</script>', lane: 7, routeCode: 'R' })];
    renderChangeOverview(el, [], nw, [7]);

    expect(el.innerHTML).not.toContain('<script>');
    expect(el.innerHTML).toContain('&lt;script&gt;');
  });
});
