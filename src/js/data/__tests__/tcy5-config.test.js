/**
 * Unit tests for tcy5-config.js — parseLaneGeometry
 *
 * Requirements: 4.1, 4.4
 *
 * The layout sheet is a visual grid where each lane is a group of sub-rows:
 *   - Sub-row 0 (Row X label): Chute IDs across Columns 1–21
 *   - Sub-row 1: Stacking filters
 *   - Sub-row 2: Route names (optional)
 *   - Sub-row 3: ADV values (optional)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseLaneGeometry } from '../tcy5-config.js';

// ── Mock global XLSX for parseLaneGeometry ────────────────
beforeAll(() => {
  globalThis.XLSX = {
    utils: {
      /** Minimal mock: the worksheet IS the raw row array. */
      sheet_to_json: (worksheet, _opts) => worksheet,
    },
  };
});

/**
 * Helper: build a lane group (array of sub-rows) matching the real sheet format.
 * @param {object} opts
 * @param {string} opts.rowLabel — e.g. "Row 5"
 * @param {string[]} opts.chutes — chute IDs for Columns 1..N
 * @param {string[]} [opts.filters] — stacking filters for sub-row 1
 * @param {string[]} [opts.routes] — route names for sub-row 2
 * @param {number[]} [opts.advs] — ADV values for sub-row 3
 * @param {string} [opts.waveGroup] — Legend (Wave) value on chute row
 * @returns {object[]} array of sub-row objects
 */
function makeLaneGroup({ rowLabel, chutes, filters, routes, advs, waveGroup }) {
  const chuteRow = { '__EMPTY': rowLabel, '__EMPTY_1': null };
  chutes.forEach((c, i) => { chuteRow['Column ' + (i + 1)] = c; });
  if (waveGroup != null) chuteRow['Legend (Wave)'] = waveGroup;

  const rows = [chuteRow];

  if (filters) {
    const filterRow = { '__EMPTY': null, '__EMPTY_1': null };
    filters.forEach((f, i) => { filterRow['Column ' + (i + 1)] = f; });
    rows.push(filterRow);
  }

  if (routes) {
    const routeRow = { '__EMPTY': null, '__EMPTY_1': null };
    routes.forEach((r, i) => { routeRow['Column ' + (i + 1)] = r; });
    rows.push(routeRow);
  }

  if (advs) {
    const advRow = { '__EMPTY': null, '__EMPTY_1': null };
    advs.forEach((a, i) => { advRow['Column ' + (i + 1)] = a; });
    rows.push(advRow);
  }

  return rows;
}

describe('parseLaneGeometry', () => {
  it('parses a single lane group into LaneGeometry', () => {
    const worksheet = makeLaneGroup({
      rowLabel: 'Row 5',
      chutes: ['20501', '20502', '20503'],
      filters: ['DSJ5-CYCLE1', 'DCK1-CYCLE1', 'DFO3-CYCLE1'],
      waveGroup: '0',
    });
    const result = parseLaneGeometry(worksheet);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      lane: 5,
      gridRow: 0,
      gridCol: 0,
      chutes: ['20501', '20502', '20503'],
      chuteDetails: [
        { chuteId: '20501', filter: 'DSJ5-CYCLE1', route: '', adv: null },
        { chuteId: '20502', filter: 'DCK1-CYCLE1', route: '', adv: null },
        { chuteId: '20503', filter: 'DFO3-CYCLE1', route: '', adv: null },
      ],
      waveGroup: '0',
    });
  });

  it('derives lane number from chute ID prefix', () => {
    const worksheet = makeLaneGroup({
      rowLabel: 'Row 12',
      chutes: ['21201', '21202'],
      filters: ['X', 'Y'],
    });
    const result = parseLaneGeometry(worksheet);

    expect(result[0].lane).toBe(12);
  });

  it('handles lane with only 2 sub-rows (psolve)', () => {
    const worksheet = makeLaneGroup({
      rowLabel: 'Row 9',
      chutes: ['20901', '20902', '20903'],
      filters: ['psolve', 'psolve', 'psolve'],
    });
    const result = parseLaneGeometry(worksheet);

    expect(result).toHaveLength(1);
    expect(result[0].lane).toBe(9);
    expect(result[0].chutes).toEqual(['20901', '20902', '20903']);
  });

  it('parses multiple lane groups with correct gridRow indices', () => {
    const worksheet = [
      ...makeLaneGroup({
        rowLabel: 'Row 5',
        chutes: ['20501', '20502'],
        filters: ['A', 'B'],
        waveGroup: 'W1',
      }),
      ...makeLaneGroup({
        rowLabel: 'Row 7',
        chutes: ['20701', '20702', '20703'],
        filters: ['C', 'D', 'E'],
        routes: ['R1', 'R2', 'R3'],
        advs: [100, 200, 300],
        waveGroup: 'W2',
      }),
    ];
    const result = parseLaneGeometry(worksheet);

    expect(result).toHaveLength(2);
    expect(result[0].lane).toBe(5);
    expect(result[0].gridRow).toBe(0);
    expect(result[0].waveGroup).toBe('W1');
    expect(result[1].lane).toBe(7);
    expect(result[1].gridRow).toBe(1);
    expect(result[1].waveGroup).toBe('W2');
  });

  it('returns empty array for empty worksheet', () => {
    const result = parseLaneGeometry([]);
    expect(result).toEqual([]);
  });

  it('handles null Legend (Wave) — returns empty string', () => {
    const worksheet = makeLaneGroup({
      rowLabel: 'Row 3',
      chutes: ['20301'],
      filters: ['X'],
    });
    const result = parseLaneGeometry(worksheet);

    expect(result[0].waveGroup).toBe('');
  });

  it('skips null column values in chute row', () => {
    const chuteRow = {
      '__EMPTY': 'Row 1',
      '__EMPTY_1': null,
      'Column 1': '20101',
      'Column 2': '20102',
      'Column 3': null,
      'Column 4': '20104',
    };
    const filterRow = { '__EMPTY': null, 'Column 1': 'A', 'Column 2': 'B' };
    const worksheet = [chuteRow, filterRow];
    const result = parseLaneGeometry(worksheet);

    expect(result[0].chutes).toEqual(['20101', '20102', '20104']);
  });

  it('handles chutes with FLAT suffix', () => {
    const worksheet = makeLaneGroup({
      rowLabel: 'Row 16',
      chutes: ['21601-FLAT', '21602', '21603-FLAT'],
      filters: ['X', 'Y', 'Z'],
    });
    const result = parseLaneGeometry(worksheet);

    expect(result[0].chutes).toEqual(['21601-FLAT', '21602', '21603-FLAT']);
  });

  it('assigns sequential gridRow to each lane group', () => {
    const worksheet = [
      ...makeLaneGroup({ rowLabel: 'Row 1', chutes: ['20101'], filters: ['A'] }),
      ...makeLaneGroup({ rowLabel: 'Row 2', chutes: ['20201'], filters: ['B'] }),
      ...makeLaneGroup({ rowLabel: 'Row 3', chutes: ['20301'], filters: ['C'] }),
    ];
    const result = parseLaneGeometry(worksheet);

    expect(result[0].gridRow).toBe(0);
    expect(result[1].gridRow).toBe(1);
    expect(result[2].gridRow).toBe(2);
  });

  it('all entries have gridCol 0', () => {
    const worksheet = [
      ...makeLaneGroup({ rowLabel: 'Row 5', chutes: ['20501'], filters: ['A'] }),
      ...makeLaneGroup({ rowLabel: 'Row 12', chutes: ['21201'], filters: ['B'] }),
    ];
    const result = parseLaneGeometry(worksheet);

    expect(result[0].gridCol).toBe(0);
    expect(result[1].gridCol).toBe(0);
  });
});
