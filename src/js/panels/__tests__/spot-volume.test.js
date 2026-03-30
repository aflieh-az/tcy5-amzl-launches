/**
 * Unit tests for spot-volume.js panel
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { describe, it, expect } from 'vitest';
import { renderSpotVolume } from '../spot-volume.js';

function makeEl() {
  const el = document.createElement('div');
  el.id = 'panel-spot-volume';
  return el;
}

const validRoutes = [
  { parentStackingFilter: 'TCY9->DCK6-CYC1', totalAdv: 1987, smallsAdv: 1418, nonconAdv: 58, largeAdv: 511 },
  { parentStackingFilter: 'TCY9->DFA5-CYC1', totalAdv: 2476, smallsAdv: 1943, nonconAdv: 24, largeAdv: 509 },
  { parentStackingFilter: 'TCY9->DSR2-CYC1', totalAdv: 3033, smallsAdv: 2231, nonconAdv: 98, largeAdv: 704 },
];

const validResult = { valid: true, errors: [], warnings: [] };

describe('renderSpotVolume', () => {
  it('renders an HTML table with route data', () => {
    const el = makeEl();
    renderSpotVolume(el, validRoutes, validResult);

    expect(el.innerHTML).toContain('<table');
    expect(el.innerHTML).toContain('Route');
    expect(el.innerHTML).toContain('Total ADV');
    expect(el.innerHTML).toContain('Smalls ADV');
    expect(el.innerHTML).toContain('Large ADV');
  });

  it('displays ADV values for all 3 routes', () => {
    const el = makeEl();
    renderSpotVolume(el, validRoutes, validResult);

    // DCK6
    expect(el.innerHTML).toContain('1987');
    expect(el.innerHTML).toContain('1418');
    expect(el.innerHTML).toContain('511');
    // DFA5
    expect(el.innerHTML).toContain('2476');
    expect(el.innerHTML).toContain('1943');
    expect(el.innerHTML).toContain('509');
    // DSR2
    expect(el.innerHTML).toContain('3033');
    expect(el.innerHTML).toContain('2231');
    expect(el.innerHTML).toContain('704');
  });

  it('shows green check for valid routes', () => {
    const el = makeEl();
    renderSpotVolume(el, validRoutes, validResult);

    // All 3 routes should have green checks
    const checks = el.innerHTML.match(/✓/g);
    expect(checks).toHaveLength(3);
  });

  it('shows red error marker for routes with validation errors', () => {
    const el = makeEl();
    const errResult = {
      valid: false,
      errors: [{ field: 'totalAdv', message: 'Route "TCY9->DCK6-CYC1" is missing required field "totalAdv".' }],
      warnings: [],
    };
    renderSpotVolume(el, validRoutes, errResult);

    expect(el.innerHTML).toContain('✗');
    // The other 2 routes should still be valid
    const checks = el.innerHTML.match(/✓/g);
    expect(checks).toHaveLength(2);
  });

  it('displays warning banner when validation fails', () => {
    const el = makeEl();
    const errResult = {
      valid: false,
      errors: [{ field: 'totalAdv', message: 'Route "TCY9->DCK6-CYC1" is missing required field "totalAdv".' }],
      warnings: [],
    };
    renderSpotVolume(el, validRoutes, errResult);

    expect(el.innerHTML).toContain('spot-warning-banner');
    expect(el.innerHTML).toContain('SPOT data is incomplete or invalid');
  });

  it('does not display warning banner when validation passes', () => {
    const el = makeEl();
    renderSpotVolume(el, validRoutes, validResult);

    expect(el.innerHTML).not.toContain('spot-warning-banner');
  });

  it('shows inline error messages from validationResult.errors', () => {
    const el = makeEl();
    const errResult = {
      valid: false,
      errors: [
        { field: 'totalAdv', message: 'Route "TCY9->DFA5-CYC1" is missing required field "totalAdv".' },
        { field: 'smallsAdv', message: 'Route "TCY9->DFA5-CYC1" has negative value (-5) for "smallsAdv".' },
      ],
      warnings: [],
    };
    renderSpotVolume(el, validRoutes, errResult);

    expect(el.innerHTML).toContain('missing required field');
    expect(el.innerHTML).toContain('negative value');
  });

  it('shows error status for missing routes', () => {
    const el = makeEl();
    // Only provide 2 of 3 routes
    const partialRoutes = validRoutes.slice(0, 2);
    const errResult = {
      valid: false,
      errors: [{ field: 'parentStackingFilter', message: 'Required route "TCY9->DSR2-CYC1" is absent from SPOT data.' }],
      warnings: [],
    };
    renderSpotVolume(el, partialRoutes, errResult);

    // Missing route should show dash values and error marker
    expect(el.innerHTML).toContain('✗');
    expect(el.innerHTML).toContain('absent from SPOT data');
  });

  it('displays route parentStackingFilter names', () => {
    const el = makeEl();
    renderSpotVolume(el, validRoutes, validResult);

    expect(el.innerHTML).toContain('TCY9-&gt;DCK6-CYC1');
    expect(el.innerHTML).toContain('TCY9-&gt;DFA5-CYC1');
    expect(el.innerHTML).toContain('TCY9-&gt;DSR2-CYC1');
  });

  it('renders dash values for absent routes', () => {
    const el = makeEl();
    const errResult = {
      valid: false,
      errors: [{ field: 'parentStackingFilter', message: 'Required route "TCY9->DSR2-CYC1" is absent from SPOT data.' }],
      warnings: [],
    };
    renderSpotVolume(el, validRoutes.slice(0, 2), errResult);

    // The DSR2 row should show dashes
    const html = el.innerHTML;
    // Count dashes — the missing route should have 3 dashes (total, smalls, large)
    expect(html).toContain('—');
  });
});
