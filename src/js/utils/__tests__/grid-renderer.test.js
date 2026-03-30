/**
 * Unit tests for grid-renderer.js
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
import { describe, it, expect } from 'vitest';
import { renderFloorGrid, classifyFilter } from '../grid-renderer.js';

// ── classifyFilter ──────────────────────────────────────────
describe('classifyFilter', () => {
  it('classifies CYCLE1 filters as CYCLE', () => {
    expect(classifyFilter('DSJ5-CYCLE1')).toBe('CYCLE');
    expect(classifyFilter('DCK1-CYCLE1')).toBe('CYCLE');
  });

  it('classifies CYCLE1-SMALL as CYCLE', () => {
    expect(classifyFilter('DSJ5-CYCLE1-SMALL')).toBe('CYCLE');
  });

  it('classifies -SMALL suffix as SMALL', () => {
    expect(classifyFilter('93274-SMALL')).toBe('SMALL');
    expect(classifyFilter('95379-SMALL')).toBe('SMALL');
  });

  it('classifies -LARGE suffix as LARGE', () => {
    expect(classifyFilter('93401-LARGE')).toBe('LARGE');
    expect(classifyFilter('95370-LARGE')).toBe('LARGE');
  });

  it('classifies KSMF filters', () => {
    expect(classifyFilter('DHI2-KSMF-AA')).toBe('KSMF');
    expect(classifyFilter('DHI2-KSMF-AA-SMALL-VCRI')).toBe('KSMF');
  });

  it('classifies USPS filters', () => {
    expect(classifyFilter('USPS-FCM-SMALL')).toBe('USPS');
    expect(classifyFilter('USPS-PRIORITY')).toBe('USPS');
    expect(classifyFilter('USPS-LPC-SFCA-MACH')).toBe('USPS');
  });

  it('classifies dynamic as DYNAMIC', () => {
    expect(classifyFilter('dynamic')).toBe('DYNAMIC');
  });

  it('classifies psolve as PSOLVE', () => {
    expect(classifyFilter('psolve')).toBe('PSOLVE');
  });

  it('classifies recirc as RECIRC', () => {
    expect(classifyFilter('recirc')).toBe('RECIRC');
  });

  it('classifies plain zip codes as MIXED', () => {
    expect(classifyFilter('93423')).toBe('MIXED');
    expect(classifyFilter('93435/93409')).toBe('MIXED');
  });

  it('classifies empty/null as EMPTY', () => {
    expect(classifyFilter('')).toBe('EMPTY');
    expect(classifyFilter(null)).toBe('EMPTY');
    expect(classifyFilter(undefined)).toBe('EMPTY');
  });

  it('classifies FF/USC codes as FF', () => {
    expect(classifyFilter('USC4810996945')).toBe('FF');
    expect(classifyFilter('FF')).toBe('FF');
  });
});

// ── renderFloorGrid (HTML table output) ─────────────────────
describe('renderFloorGrid', () => {
  const geometry = [
    {
      lane: 5, gridRow: 0, gridCol: 0,
      chutes: ['20501', '20502'],
      chuteDetails: [
        { chuteId: '20501', filter: '93274-SMALL', route: 'TCY5->DDU-TCY5-1_0250_03', adv: 305 },
        { chuteId: '20502', filter: '93430-SMALL', route: 'TCY5->DDU-TCY5-1_0110_01', adv: 180 },
      ],
      waveGroup: '',
    },
    {
      lane: 7, gridRow: 1, gridCol: 0,
      chutes: ['20701'],
      chuteDetails: [
        { chuteId: '20701', filter: '95340-SMALL', route: 'TCY5->DDU-TCY5-1_0250_06', adv: 273 },
      ],
      waveGroup: '',
    },
  ];

  const assignments = [
    { chuteId: '20501', lane: 5, routeCode: 'TCY9->DCK6-CYC1', chuteType: 'Multi', assignedAdv: 1200, volumeCategory: 'Large', isDuplicate: false },
  ];

  const preserved = [
    { chuteId: '20701', routeCode: 'Chico', chuteType: 'Multi', description: 'Chico pallet build' },
  ];

  it('returns HTML table markup', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    expect(html).toContain('<table');
    expect(html).toContain('</table>');
  });

  it('renders row labels and lane header from chute IDs', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    // Row labels (from geometry lane number)
    expect(html).toContain('Row 5');
    expect(html).toContain('Row 7');
    // Lane header derived from last 2 digits of chute IDs
    expect(html).toContain('Lane 1');
    expect(html).toContain('Lane 2');
  });

  it('renders assigned chutes with route code and ADV', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    expect(html).toContain('20501');
    expect(html).toContain('1200');
  });

  it('renders preserved chutes with their normal wave color', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    // Preserved chute 20701 has filter '95340-SMALL' → should get Smalls color (#2E8B57), not gold
    expect(html).toContain('#2E8B57');
  });

  it('returns fallback when geometry is empty', () => {
    const html = renderFloorGrid([], [], []);
    expect(html).toContain('No layout geometry available');
  });

  it('returns fallback when geometry is null', () => {
    const html = renderFloorGrid(null, [], []);
    expect(html).toContain('No layout geometry available');
  });

  it('renders unassigned chutes from chuteDetails', () => {
    const html = renderFloorGrid(geometry, [], []);
    expect(html).toContain('20501');
    expect(html).toContain('20502');
    expect(html).toContain('20701');
  });

  it('renders color legend', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    expect(html).toContain('Legend');
    expect(html).toContain('Smalls');
    expect(html).toContain('New AMZL');
  });

  it('highlights new AMZL assignments with red border', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    expect(html).toContain('#D62828');
  });

  it('shows explanation panel for new AMZL assignments', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    expect(html).toContain('New AMZL Assignments Detail');
    expect(html).toContain('TCY9-DCK6-CYC1');
  });

  it('shows allocation summary with color coding and methodology', () => {
    const html = renderFloorGrid(geometry, assignments, preserved);
    expect(html).toContain('Floor Layout Allocation Summary');
    expect(html).toContain('Color Coding');
    expect(html).toContain('Allocation Methodology');
    expect(html).toContain('Displacement scoring');
  });
});
