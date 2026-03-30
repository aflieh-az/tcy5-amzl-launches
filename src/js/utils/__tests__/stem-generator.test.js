/**
 * Unit tests for stem-generator.js
 *
 * Tests generateStemFile, validateStemFile, and exportStemBlob.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 7.1
 */

import { describe, it, expect } from 'vitest';
import {
  generateStemFile,
  validateStemFile,
  exportStemBlob,
} from '../stem-generator.js';

// ── Fixtures ──────────────────────────────────────────────────

const existingRules = [
  { lane: 1, stackingFilter: 'ROUTE-A', vsm: 'V1', resourceLabel: 'RL1', resourceType: 'Multi', chute: '10101', sorter: 'S1' },
  { lane: 2, stackingFilter: 'ROUTE-B', vsm: 'V2', resourceLabel: 'RL2', resourceType: 'D2C', chute: '10201-FLAT', sorter: 'S1' },
  { lane: 5, stackingFilter: 'OLD-ROUTE', vsm: 'V3', resourceLabel: 'RL3', resourceType: 'Multi', chute: '20501', sorter: 'S1' },
];

const newAssignments = [
  { chuteId: '20501', lane: 5, routeCode: 'TCY9->DCK6-CYC1', chuteType: 'Multi', assignedAdv: 1500, volumeCategory: 'Large', isDuplicate: false },
  { chuteId: '20601-FLAT', lane: 5, routeCode: 'TCY9->DCK6-CYC1', chuteType: 'D2C', assignedAdv: 1200, volumeCategory: 'Smalls', isDuplicate: false },
];

const preservedAssignments = [
  { chuteId: 'ARSC-21620', routeCode: 'Chico', chuteType: 'Multi', description: 'Chico pallet build' },
];

// ── generateStemFile ──────────────────────────────────────────

describe('generateStemFile', () => {
  it('merges existing unaffected rules, new assignments, and preserved assignments', () => {
    const result = generateStemFile(existingRules, newAssignments, preservedAssignments);

    expect(result.rules).toBeDefined();
    expect(result.metadata.facility).toBe('TCY5');
    expect(result.metadata.version).toBe('1.0.0');
    expect(result.metadata.generatedAt).toBeTruthy();
  });

  it('preserves existing rules for unaffected lanes', () => {
    const result = generateStemFile(existingRules, newAssignments, preservedAssignments);

    // Lane 1 and 2 are unaffected — their rules should pass through
    const lane1Rules = result.rules.filter((r) => r.lane === 1);
    expect(lane1Rules).toHaveLength(1);
    expect(lane1Rules[0].stackingFilter).toBe('ROUTE-A');

    const lane2Rules = result.rules.filter((r) => r.lane === 2);
    expect(lane2Rules).toHaveLength(1);
    expect(lane2Rules[0].stackingFilter).toBe('ROUTE-B');
  });

  it('replaces existing rules for affected lanes with new assignments', () => {
    const result = generateStemFile(existingRules, newAssignments, preservedAssignments);

    // Lane 5 is affected — old rule (OLD-ROUTE) should be gone, new ones present
    const lane5Rules = result.rules.filter((r) => r.lane === 5);
    expect(lane5Rules.every((r) => r.stackingFilter !== 'OLD-ROUTE')).toBe(true);
    expect(lane5Rules.some((r) => r.chute === '20501')).toBe(true);
    expect(lane5Rules.some((r) => r.chute === '20601-FLAT')).toBe(true);
  });

  it('always includes preserved assignments', () => {
    const result = generateStemFile(existingRules, newAssignments, preservedAssignments);

    const chicoRule = result.rules.find((r) => r.chute === 'ARSC-21620');
    expect(chicoRule).toBeDefined();
    expect(chicoRule.stackingFilter).toBe('Chico');
    expect(chicoRule.resourceType).toBe('Multi');
  });

  it('converts new assignments to SortationRule format', () => {
    const result = generateStemFile(existingRules, newAssignments, preservedAssignments);

    const newRule = result.rules.find((r) => r.chute === '20501' && r.stackingFilter === 'TCY9->DCK6-CYC1');
    expect(newRule).toBeDefined();
    expect(newRule.lane).toBe(5);
    expect(newRule.resourceType).toBe('Multi');
  });

  it('handles empty new assignments (no affected lanes)', () => {
    const result = generateStemFile(existingRules, [], preservedAssignments);

    // All existing rules for non-preserved chutes should remain
    const nonPreservedExisting = existingRules.filter(
      (r) => r.chute !== 'ARSC-21620'
    );
    for (const rule of nonPreservedExisting) {
      expect(result.rules.some((r) => r.chute === rule.chute && r.stackingFilter === rule.stackingFilter)).toBe(true);
    }
  });
});

// ── validateStemFile ──────────────────────────────────────────

describe('validateStemFile', () => {
  it('returns valid for a well-formed StemFile', () => {
    const file = generateStemFile(existingRules, newAssignments, preservedAssignments);
    const result = validateStemFile(file);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches missing required fields', () => {
    const file = {
      rules: [
        { lane: 5, stackingFilter: '', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
      ],
    };
    const result = validateStemFile(file);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'stackingFilter')).toBe(true);
  });

  it('catches missing chute field', () => {
    const file = {
      rules: [
        { lane: 5, stackingFilter: 'ROUTE-A', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '', sorter: '' },
      ],
    };
    const result = validateStemFile(file);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'chute')).toBe(true);
  });

  it('catches missing lane field', () => {
    const file = {
      rules: [
        { lane: null, stackingFilter: 'ROUTE-A', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
      ],
    };
    const result = validateStemFile(file);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'lane')).toBe(true);
  });

  it('catches unintentional duplicate chute+stackingFilter', () => {
    const file = {
      rules: [
        { lane: 5, stackingFilter: 'ROUTE-A', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
        { lane: 5, stackingFilter: 'ROUTE-A', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
      ],
    };
    const result = validateStemFile(file);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('allows different chutes with the same stackingFilter', () => {
    const file = {
      rules: [
        { lane: 5, stackingFilter: 'ROUTE-A', vsm: '', resourceLabel: '', resourceType: 'Multi', chute: '20501', sorter: '' },
        { lane: 5, stackingFilter: 'ROUTE-A', vsm: '', resourceLabel: '', resourceType: 'D2C', chute: '20502-FLAT', sorter: '' },
      ],
    };
    const result = validateStemFile(file);

    expect(result.valid).toBe(true);
  });
});

// ── exportStemBlob ────────────────────────────────────────────

describe('exportStemBlob', () => {
  it('returns a Blob with TSV content type', () => {
    const file = generateStemFile(existingRules, newAssignments, preservedAssignments);
    const blob = exportStemBlob(file);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/tab-separated-values');
  });

  it('includes header row and all rules as TSV', async () => {
    const file = {
      rules: [
        { lane: 5, stackingFilter: 'ROUTE-A', vsm: 'V1', resourceLabel: 'RL1', resourceType: 'Multi', chute: '20501', sorter: 'S1' },
      ],
      metadata: { generatedAt: '2024-01-01T00:00:00Z', facility: 'TCY5', version: '1.0.0' },
    };

    const blob = exportStemBlob(file);
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    const lines = text.split('\n');

    // Header
    expect(lines[0]).toBe('Lane\tStacking Filter\tVSM\tResource Label\tResource Type\tChute\tSorter');
    // Data row
    expect(lines[1]).toBe('5\tROUTE-A\tV1\tRL1\tMulti\t20501\tS1');
  });

  it('handles empty rules array', async () => {
    const file = { rules: [], metadata: { generatedAt: '', facility: 'TCY5', version: '1.0.0' } };
    const blob = exportStemBlob(file);
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    const lines = text.split('\n');

    // Only header
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Lane');
  });
});
