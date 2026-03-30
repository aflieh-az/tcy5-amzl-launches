/**
 * Unit tests for stem-editor.js panel
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3
 */

import { describe, it, expect } from 'vitest';
import { renderStemEditor, checkGridStemConsistency } from '../stem-editor.js';

function makeEl() {
  const el = document.createElement('div');
  el.id = 'panel-stem-editor';
  return el;
}

const validStemFile = {
  rules: [
    { lane: 5, stackingFilter: 'TCY9->DCK6-CYC1', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
    { lane: 6, stackingFilter: 'TCY9->DFA5-CYC1', vsm: '', resourceLabel: '', resourceType: 'D2C', chute: '20220-FLAT', sorter: '' },
    { lane: 7, stackingFilter: 'TCY9->DSR2-CYC1', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20701', sorter: '' },
  ],
  metadata: { generatedAt: '2024-01-01T00:00:00Z', facility: 'TCY5', version: '1.0.0' },
};

const matchingGridAssignments = [
  { chuteId: '20501', lane: 5, routeCode: 'TCY9->DCK6-CYC1', chuteType: 'Multi', assignedAdv: 1200, volumeCategory: 'Large', isDuplicate: false },
  { chuteId: '20220-FLAT', lane: 6, routeCode: 'TCY9->DFA5-CYC1', chuteType: 'D2C', assignedAdv: 1500, volumeCategory: 'Smalls', isDuplicate: false },
  { chuteId: '20701', lane: 7, routeCode: 'TCY9->DSR2-CYC1', chuteType: 'Multi', assignedAdv: 1000, volumeCategory: 'Large', isDuplicate: false },
];

describe('renderStemEditor', () => {
  it('renders an HTML table with correct column headers', () => {
    const el = makeEl();
    renderStemEditor(el, validStemFile, matchingGridAssignments);

    expect(el.innerHTML).toContain('Lane');
    expect(el.innerHTML).toContain('Stacking Filter');
    expect(el.innerHTML).toContain('VSM');
    expect(el.innerHTML).toContain('Resource Label');
    expect(el.innerHTML).toContain('Resource Type');
    expect(el.innerHTML).toContain('Chute');
    expect(el.innerHTML).toContain('Sorter');
  });

  it('displays all rule data in the table', () => {
    const el = makeEl();
    renderStemEditor(el, validStemFile, matchingGridAssignments);

    expect(el.innerHTML).toContain('20501');
    expect(el.innerHTML).toContain('20220-FLAT');
    expect(el.innerHTML).toContain('20701');
    expect(el.innerHTML).toContain('TCY9-&gt;DCK6-CYC1');
    expect(el.innerHTML).toContain('Multi');
    expect(el.innerHTML).toContain('D2C');
  });

  it('shows green validation banner when STEM file is valid', () => {
    const el = makeEl();
    renderStemEditor(el, validStemFile, matchingGridAssignments);

    expect(el.innerHTML).toContain('stem-validation-banner');
    expect(el.innerHTML).toContain('background:#d4edda');
    expect(el.innerHTML).toContain('valid');
  });

  it('shows red validation banner with errors when STEM file is invalid', () => {
    const invalidStemFile = {
      rules: [
        { lane: 5, stackingFilter: 'TCY9->DCK6-CYC1', vsm: '', resourceLabel: '', resourceType: '', chute: '20501', sorter: '' },
      ],
      metadata: { generatedAt: '2024-01-01T00:00:00Z', facility: 'TCY5', version: '1.0.0' },
    };
    const el = makeEl();
    renderStemEditor(el, invalidStemFile, []);

    expect(el.innerHTML).toContain('background:#f8d7da');
    expect(el.innerHTML).toContain('validation error');
  });


  it('highlights rows with errors using red background', () => {
    const invalidStemFile = {
      rules: [
        { lane: 5, stackingFilter: 'TCY9->DCK6-CYC1', vsm: '', resourceLabel: '', resourceType: '', chute: '20501', sorter: '' },
        { lane: 6, stackingFilter: 'TCY9->DFA5-CYC1', vsm: '', resourceLabel: '', resourceType: 'D2C', chute: '20220-FLAT', sorter: '' },
      ],
      metadata: { generatedAt: '2024-01-01T00:00:00Z', facility: 'TCY5', version: '1.0.0' },
    };
    const el = makeEl();
    renderStemEditor(el, invalidStemFile, []);

    // The row for chute 20501 (missing resourceType) should be highlighted
    const rows = el.querySelectorAll('tbody tr');
    expect(rows[0].getAttribute('style')).toContain('background:#f8d7da');
    // The valid row should not be highlighted
    expect(rows[1].getAttribute('style')).not.toContain('background:#f8d7da');
  });

  it('renders download button enabled when STEM file is valid', () => {
    const el = makeEl();
    renderStemEditor(el, validStemFile, matchingGridAssignments);

    const btn = el.querySelector('.stem-download-btn');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('style')).toContain('background:#28a745');
  });

  it('renders download button disabled when STEM file is invalid', () => {
    const invalidStemFile = {
      rules: [
        { lane: 5, stackingFilter: '', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
      ],
      metadata: { generatedAt: '2024-01-01T00:00:00Z', facility: 'TCY5', version: '1.0.0' },
    };
    const el = makeEl();
    renderStemEditor(el, invalidStemFile, []);

    const btn = el.querySelector('.stem-download-btn');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('style')).toContain('cursor:not-allowed');
  });

  it('shows discrepancy alert when grid and STEM are inconsistent', () => {
    const mismatchedGrid = [
      { chuteId: '99999', lane: 5, routeCode: 'TCY9->UNKNOWN', chuteType: 'Multi', assignedAdv: 500, volumeCategory: 'Large', isDuplicate: false },
    ];
    const el = makeEl();
    renderStemEditor(el, validStemFile, mismatchedGrid);

    expect(el.innerHTML).toContain('stem-discrepancy-alert');
    expect(el.innerHTML).toContain('Grid-STEM Consistency');
    expect(el.innerHTML).toContain('99999');
  });

  it('does not show discrepancy alert when grid and STEM match', () => {
    const el = makeEl();
    renderStemEditor(el, validStemFile, matchingGridAssignments);

    expect(el.innerHTML).not.toContain('stem-discrepancy-alert');
  });

  it('renders empty table body when stemFile has no rules', () => {
    const emptyStemFile = { rules: [], metadata: { generatedAt: '', facility: 'TCY5', version: '1.0.0' } };
    const el = makeEl();
    renderStemEditor(el, emptyStemFile, []);

    expect(el.innerHTML).toContain('<tbody></tbody>');
  });

  it('shows duplicate chute errors inline', () => {
    const dupStemFile = {
      rules: [
        { lane: 5, stackingFilter: 'TCY9->DCK6-CYC1', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
        { lane: 5, stackingFilter: 'TCY9->DCK6-CYC1', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
      ],
      metadata: { generatedAt: '2024-01-01T00:00:00Z', facility: 'TCY5', version: '1.0.0' },
    };
    const el = makeEl();
    renderStemEditor(el, dupStemFile, []);

    expect(el.innerHTML).toContain('Duplicate');
    // Both rows should be highlighted
    const rows = el.querySelectorAll('tbody tr');
    expect(rows[0].getAttribute('style')).toContain('background:#f8d7da');
    expect(rows[1].getAttribute('style')).toContain('background:#f8d7da');
  });
});

describe('checkGridStemConsistency', () => {
  it('returns empty array when grid and STEM match', () => {
    const result = checkGridStemConsistency(matchingGridAssignments, validStemFile.rules);
    expect(result).toEqual([]);
  });

  it('flags chute in grid but not in STEM', () => {
    const gridOnly = [
      { chuteId: '99999', lane: 5, routeCode: 'TCY9->NEW', chuteType: 'Multi', assignedAdv: 500, volumeCategory: 'Large', isDuplicate: false },
    ];
    const result = checkGridStemConsistency(gridOnly, []);

    expect(result.length).toBe(1);
    expect(result[0].source).toBe('grid');
    expect(result[0].chuteId).toBe('99999');
  });

  it('flags chute in STEM but not in grid', () => {
    const stemRules = [
      { lane: 5, stackingFilter: 'TCY9->DCK6-CYC1', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
    ];
    const result = checkGridStemConsistency([], stemRules);

    expect(result.length).toBe(1);
    expect(result[0].source).toBe('stem');
    expect(result[0].chuteId).toBe('20501');
  });

  it('flags discrepancies in both directions', () => {
    const gridAssignments = [
      { chuteId: 'GRID-ONLY', lane: 5, routeCode: 'R1', chuteType: 'Multi', assignedAdv: 500, volumeCategory: 'Large', isDuplicate: false },
    ];
    const stemRules = [
      { lane: 6, stackingFilter: 'R2', vsm: '', resourceLabel: '', resourceType: 'D2C', chute: 'STEM-ONLY', sorter: '' },
    ];
    const result = checkGridStemConsistency(gridAssignments, stemRules);

    expect(result.length).toBe(2);
    const sources = result.map((d) => d.source).sort();
    expect(sources).toEqual(['grid', 'stem']);
  });

  it('skips STEM rules with missing chute or stackingFilter', () => {
    const stemRules = [
      { lane: 5, stackingFilter: '', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '', sorter: '' },
    ];
    const result = checkGridStemConsistency([], stemRules);
    expect(result).toEqual([]);
  });
});
