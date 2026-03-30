/**
 * Unit tests for spao-assignments.js panel
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.3
 */

import { describe, it, expect } from 'vitest';
import { renderSpaoAssignments } from '../spao-assignments.js';

function makeEl() {
  const el = document.createElement('div');
  el.id = 'panel-spao-assignments';
  return el;
}

const sampleAssignments = [
  { chuteId: '20501', lane: 5, routeCode: 'TCY9->DCK6-CYC1', chuteType: 'Multi', assignedAdv: 1200, volumeCategory: 'Large', isDuplicate: false },
  { chuteId: '20220-FLAT', lane: 6, routeCode: 'TCY9->DFA5-CYC1', chuteType: 'D2C', assignedAdv: 1500, volumeCategory: 'Smalls', isDuplicate: false },
  { chuteId: '20501-DUP1', lane: 5, routeCode: 'TCY9->DCK6-CYC1', chuteType: 'Multi', assignedAdv: 900, volumeCategory: 'Large', isDuplicate: true, originalChuteId: '20501' },
];

const noViolations = [];

describe('renderSpaoAssignments', () => {
  it('renders an HTML table with correct column headers', () => {
    const el = makeEl();
    renderSpaoAssignments(el, sampleAssignments, noViolations);

    expect(el.innerHTML).toContain('<table');
    expect(el.innerHTML).toContain('Chute ID');
    expect(el.innerHTML).toContain('Lane');
    expect(el.innerHTML).toContain('Route');
    expect(el.innerHTML).toContain('Chute Type');
    expect(el.innerHTML).toContain('ADV');
    expect(el.innerHTML).toContain('Duplicate');
  });

  it('displays assignment data for all rows', () => {
    const el = makeEl();
    renderSpaoAssignments(el, sampleAssignments, noViolations);

    expect(el.innerHTML).toContain('20501');
    expect(el.innerHTML).toContain('20220-FLAT');
    expect(el.innerHTML).toContain('1200');
    expect(el.innerHTML).toContain('1500');
    expect(el.innerHTML).toContain('TCY9-&gt;DCK6-CYC1');
    expect(el.innerHTML).toContain('TCY9-&gt;DFA5-CYC1');
    expect(el.innerHTML).toContain('Multi');
    expect(el.innerHTML).toContain('D2C');
  });

  it('shows "Yes" for duplicate assignments and "No" for non-duplicates', () => {
    const el = makeEl();
    renderSpaoAssignments(el, sampleAssignments, noViolations);

    const html = el.innerHTML;
    const yesCount = (html.match(/>Yes</g) || []).length;
    const noCount = (html.match(/>No</g) || []).length;
    expect(yesCount).toBe(1);
    expect(noCount).toBe(2);
  });

  it('highlights rows with capacity violations using yellow/orange background', () => {
    const el = makeEl();
    const violations = [
      { chuteId: '20501', lane: 5, currentAdv: 2000, maxAdv: 1800, routeCode: 'TCY9->DCK6-CYC1', overageAmount: 200 },
    ];
    renderSpaoAssignments(el, sampleAssignments, violations);

    // The row for chuteId 20501 should have the warning background
    expect(el.innerHTML).toContain('background:#fff3cd');
  });

  it('shows warning badge with overage amount on violated rows', () => {
    const el = makeEl();
    const violations = [
      { chuteId: '20501', lane: 5, currentAdv: 2000, maxAdv: 1800, routeCode: 'TCY9->DCK6-CYC1', overageAmount: 200 },
    ];
    renderSpaoAssignments(el, sampleAssignments, violations);

    expect(el.innerHTML).toContain('spao-warning-badge');
    expect(el.innerHTML).toContain('+200');
  });

  it('does not show warning badges when there are no violations', () => {
    const el = makeEl();
    renderSpaoAssignments(el, sampleAssignments, noViolations);

    expect(el.innerHTML).not.toContain('spao-warning-badge');
    expect(el.innerHTML).not.toContain('background:#fff3cd');
  });

  it('renders an empty table body when assignments is empty', () => {
    const el = makeEl();
    renderSpaoAssignments(el, [], noViolations);

    expect(el.innerHTML).toContain('<table');
    expect(el.innerHTML).toContain('<tbody></tbody>');
  });

  it('only highlights the specific violated chute, not others', () => {
    const el = makeEl();
    const violations = [
      { chuteId: '20220-FLAT', lane: 6, currentAdv: 1900, maxAdv: 1800, routeCode: 'TCY9->DFA5-CYC1', overageAmount: 100 },
    ];
    renderSpaoAssignments(el, sampleAssignments, violations);

    // Count warning badges — should be exactly 1
    const badgeCount = (el.innerHTML.match(/spao-warning-badge/g) || []).length;
    expect(badgeCount).toBe(1);
    expect(el.innerHTML).toContain('+100');
  });
});
