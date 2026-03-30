/**
 * Unit tests for stem-parser.js — parseSortationRules & validateStemIntegrity
 *
 * Requirements: 6.1, 7.1
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { parseSortationRules, validateStemIntegrity } from '../stem-parser.js';

// ── Mock global XLSX for parseSortationRules ────────────────
beforeAll(() => {
  globalThis.XLSX = {
    utils: {
      /**
       * Minimal mock of sheet_to_json: the worksheet IS the raw row array.
       */
      sheet_to_json: (worksheet, _opts) => worksheet,
    },
  };
});

// ── Helper: build a raw worksheet row matching Sortation_Rules headers ──
function makeRawRow(overrides = {}) {
  return {
    'Lane': 5,
    'Stacking Filter': 'TCY9->DCK6-CYC1',
    'VSM': 'VSM-001',
    'Resource Label': 'Label-A',
    'Resource Type': 'D2C',
    'Chute': '20501-FLAT',
    'Sorter': 'Sorter-1',
    ...overrides,
  };
}

describe('parseSortationRules', () => {
  it('maps worksheet columns to SortationRule fields', () => {
    const worksheet = [makeRawRow()];
    const rules = parseSortationRules(worksheet);

    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({
      lane: 5,
      stackingFilter: 'TCY9->DCK6-CYC1',
      vsm: 'VSM-001',
      resourceLabel: 'Label-A',
      resourceType: 'D2C',
      chute: '20501-FLAT',
      sorter: 'Sorter-1',
    });
  });

  it('coerces lane to number', () => {
    const worksheet = [makeRawRow({ 'Lane': '12' })];
    const rules = parseSortationRules(worksheet);
    expect(rules[0].lane).toBe(12);
    expect(typeof rules[0].lane).toBe('number');
  });

  it('handles null values — lane becomes null, strings become empty', () => {
    const worksheet = [makeRawRow({ 'Lane': null, 'VSM': null })];
    const rules = parseSortationRules(worksheet);
    expect(rules[0].lane).toBeNull();
    expect(rules[0].vsm).toBe('');
  });

  it('parses multiple rows', () => {
    const worksheet = [
      makeRawRow({ 'Lane': 5, 'Chute': '20501-FLAT' }),
      makeRawRow({ 'Lane': 7, 'Chute': '20701', 'Resource Type': 'Multi' }),
    ];
    const rules = parseSortationRules(worksheet);
    expect(rules).toHaveLength(2);
    expect(rules[0].lane).toBe(5);
    expect(rules[1].lane).toBe(7);
    expect(rules[1].resourceType).toBe('Multi');
  });
});

describe('validateStemIntegrity', () => {
  it('returns valid for well-formed rules', () => {
    const rules = [
      { lane: 5, stackingFilter: 'TCY9->DCK6-CYC1', chute: '20501-FLAT', resourceType: 'D2C', vsm: 'V1', resourceLabel: 'L1', sorter: 'S1' },
      { lane: 7, stackingFilter: 'TCY9->DFA5-CYC1', chute: '20701', resourceType: 'Multi', vsm: 'V2', resourceLabel: 'L2', sorter: 'S2' },
    ];
    const result = validateStemIntegrity(rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects rules missing required fields', () => {
    const rules = [
      { lane: null, stackingFilter: '', chute: '', resourceType: '', vsm: '', resourceLabel: '', sorter: '' },
    ];
    const result = validateStemIntegrity(rules);
    expect(result.valid).toBe(false);
    // All 4 required fields are missing/empty
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects non-positive lane numbers', () => {
    const rules = [
      { lane: 0, stackingFilter: 'X', chute: 'C1', resourceType: 'D2C', vsm: '', resourceLabel: '', sorter: '' },
      { lane: -3, stackingFilter: 'Y', chute: 'C2', resourceType: 'Multi', vsm: '', resourceLabel: '', sorter: '' },
    ];
    const result = validateStemIntegrity(rules);
    expect(result.valid).toBe(false);
    const laneErrors = result.errors.filter((e) => e.field === 'lane');
    expect(laneErrors.length).toBe(2);
  });

  it('rejects fractional lane numbers', () => {
    const rules = [
      { lane: 5.5, stackingFilter: 'X', chute: 'C1', resourceType: 'D2C', vsm: '', resourceLabel: '', sorter: '' },
    ];
    const result = validateStemIntegrity(rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'lane')).toBe(true);
  });

  it('rejects invalid resourceType values', () => {
    const rules = [
      { lane: 5, stackingFilter: 'X', chute: 'C1', resourceType: 'Unknown', vsm: '', resourceLabel: '', sorter: '' },
    ];
    const result = validateStemIntegrity(rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'resourceType')).toBe(true);
  });

  it('accepts both D2C and Multi as valid resourceType', () => {
    const rules = [
      { lane: 1, stackingFilter: 'A', chute: 'C1', resourceType: 'D2C', vsm: '', resourceLabel: '', sorter: '' },
      { lane: 2, stackingFilter: 'B', chute: 'C2', resourceType: 'Multi', vsm: '', resourceLabel: '', sorter: '' },
    ];
    const result = validateStemIntegrity(rules);
    expect(result.valid).toBe(true);
  });

  it('includes lane and chuteId in error objects when available', () => {
    const rules = [
      { lane: 5, stackingFilter: 'X', chute: 'C1', resourceType: 'BadType', vsm: '', resourceLabel: '', sorter: '' },
    ];
    const result = validateStemIntegrity(rules);
    const err = result.errors.find((e) => e.field === 'resourceType');
    expect(err.lane).toBe(5);
    expect(err.chuteId).toBe('C1');
  });

  it('returns ValidationResult shape with valid, errors, warnings', () => {
    const result = validateStemIntegrity([]);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result.valid).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
