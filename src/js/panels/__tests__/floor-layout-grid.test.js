/**
 * Unit tests for floor-layout-grid.js panel
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect } from 'vitest';
import { renderFloorLayoutGrid } from '../floor-layout-grid.js';

function makeEl() {
  const el = document.createElement('div');
  el.id = 'panel-floor-layout-grid';
  return el;
}

const geometry = [
  {
    lane: 5, gridRow: 0, gridCol: 0,
    chutes: ['20501', '20502'],
    chuteDetails: [
      { chuteId: '20501', filter: '93274-SMALL', route: 'TCY5->DDU', adv: 305 },
      { chuteId: '20502', filter: '93430-SMALL', route: 'TCY5->DDU', adv: 180 },
    ],
    waveGroup: '',
  },
  {
    lane: 6, gridRow: 1, gridCol: 0,
    chutes: ['20601'],
    chuteDetails: [
      { chuteId: '20601', filter: '93619-SMALL', route: 'TCY5->DDU', adv: 295 },
    ],
    waveGroup: '',
  },
];

const assignments = [
  { chuteId: '20501', lane: 5, routeCode: 'TCY9->DCK6-CYC1', chuteType: 'Multi', assignedAdv: 900, volumeCategory: 'Large', isDuplicate: false },
];

const preserved = [
  { chuteId: 'ARSC-21620', routeCode: 'Chico', chuteType: 'Multi', description: 'Chico pallet build' },
];

describe('renderFloorLayoutGrid', () => {
  it('sets innerHTML with HTML table markup from renderFloorGrid', () => {
    const el = makeEl();
    renderFloorLayoutGrid(el, geometry, assignments, preserved);
    expect(el.innerHTML).toContain('<table');
    expect(el.innerHTML).toContain('</table>');
  });

  it('renders chute IDs from geometry', () => {
    const el = makeEl();
    renderFloorLayoutGrid(el, geometry, assignments, preserved);
    expect(el.innerHTML).toContain('20501');
    expect(el.innerHTML).toContain('20502');
    expect(el.innerHTML).toContain('20601');
  });

  it('renders assigned route code and ADV', () => {
    const el = makeEl();
    renderFloorLayoutGrid(el, geometry, assignments, preserved);
    expect(el.innerHTML).toContain('TCY9-DCK6-CYC1');
    expect(el.innerHTML).toContain('900');
  });

  it('renders empty-state when geometry is empty', () => {
    const el = makeEl();
    renderFloorLayoutGrid(el, [], assignments, preserved);
    expect(el.innerHTML).toContain('No layout geometry available');
  });

  it('renders row labels', () => {
    const el = makeEl();
    renderFloorLayoutGrid(el, geometry, assignments, preserved);
    expect(el.innerHTML).toContain('Row 5');
    expect(el.innerHTML).toContain('Row 6');
  });
});
