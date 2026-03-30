import { describe, it, expect } from 'vitest';
import { validateChuteCapacity, computeChuteAdv } from '../volume-validator.js';

describe('computeChuteAdv', () => {
  it('returns the assignedAdv from the assignment', () => {
    expect(computeChuteAdv({ assignedAdv: 1200 })).toBe(1200);
  });

  it('returns 0 when assignedAdv is 0', () => {
    expect(computeChuteAdv({ assignedAdv: 0 })).toBe(0);
  });
});

describe('validateChuteCapacity', () => {
  it('returns empty array when all assignments are at or below 1800', () => {
    const assignments = [
      { chuteId: '20501', lane: 5, routeCode: 'TCY9->DCK6-CYC1', assignedAdv: 1800 },
      { chuteId: '20502', lane: 6, routeCode: 'TCY9->DFA5-CYC1', assignedAdv: 900 },
    ];
    expect(validateChuteCapacity(assignments)).toEqual([]);
  });

  it('returns a CapacityViolation for a chute exceeding 1800 ADV', () => {
    const assignments = [
      { chuteId: '20501', lane: 7, routeCode: 'TCY9->DSR2-CYC1', assignedAdv: 2200 },
    ];
    const violations = validateChuteCapacity(assignments);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      chuteId: '20501',
      lane: 7,
      currentAdv: 2200,
      maxAdv: 1800,
      routeCode: 'TCY9->DSR2-CYC1',
      overageAmount: 400,
    });
  });

  it('returns violations only for over-capacity chutes in a mixed set', () => {
    const assignments = [
      { chuteId: '20501', lane: 5, routeCode: 'R1', assignedAdv: 1500 },
      { chuteId: '20502', lane: 6, routeCode: 'R2', assignedAdv: 2000 },
      { chuteId: '20503', lane: 7, routeCode: 'R3', assignedAdv: 1800 },
      { chuteId: '20504', lane: 12, routeCode: 'R4', assignedAdv: 1801 },
    ];
    const violations = validateChuteCapacity(assignments);
    expect(violations).toHaveLength(2);
    expect(violations[0].chuteId).toBe('20502');
    expect(violations[0].overageAmount).toBe(200);
    expect(violations[1].chuteId).toBe('20504');
    expect(violations[1].overageAmount).toBe(1);
  });

  it('returns empty array for an empty assignments list', () => {
    expect(validateChuteCapacity([])).toEqual([]);
  });
});
