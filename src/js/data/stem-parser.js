/**
 * stem-parser.js — STEM sortation rules parser and validator
 *
 * Parses the Sortation_Rules worksheet from TCY5_Data.xlsx into SortationRule objects
 * and validates that all rules have required fields, valid lane numbers, and
 * consistent resourceType values.
 *
 * In TCY5 sortation rules, a resource label ending in `-FLAT` indicates
 * D2C (direct-to-container). All other resource labels indicate Multi
 * (multi-package pallet build).
 *
 * Requirements: 6.1, 7.1
 */

/**
 * Required fields that every SortationRule must have.
 * @type {string[]}
 */
const REQUIRED_FIELDS = ['lane', 'stackingFilter', 'chute', 'resourceType'];

/**
 * Valid resourceType values for sortation rules.
 * @type {string[]}
 */
const VALID_RESOURCE_TYPES = ['D2C', 'Multi'];

/**
 * Column-name mapping from the Sortation_Rules sheet headers to SortationRule fields.
 * Keys are the expected worksheet column headers; values are SortationRule property names.
 * @type {Record<string, string>}
 */
const COLUMN_MAP = {
  'Lane': 'lane',
  'Stacking Filter': 'stackingFilter',
  'VSM': 'vsm',
  'Resource Label': 'resourceLabel',
  'Resource Type': 'resourceType',
  'Chute': 'chute',
  'Sorter': 'sorter',
};

/**
 * Parse a Sortation_Rules worksheet into an array of SortationRule objects.
 *
 * Uses the global `XLSX.utils.sheet_to_json` (loaded via CDN) to extract rows,
 * then maps worksheet column names to SortationRule fields via COLUMN_MAP.
 * The `lane` field is coerced to a number.
 *
 * @param {object} worksheet — SheetJS worksheet object (workbook.Sheets['Sortation_Rules'])
 * @returns {Array<object>} Array of SortationRule objects
 */
export function parseSortationRules(worksheet) {
  /* global XLSX */
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  return rawRows.map((row) => {
    const rule = {};

    for (const [colHeader, fieldName] of Object.entries(COLUMN_MAP)) {
      const value = row[colHeader];

      if (fieldName === 'lane') {
        // Coerce lane to number; leave as-is if not parseable (validator catches it)
        rule[fieldName] = value != null ? Number(value) : null;
      } else {
        rule[fieldName] = value != null ? String(value) : '';
      }
    }

    return rule;
  }).filter((rule) => rule.chute && rule.chute !== '' && rule.chute !== 'null');
}

/**
 * Validate an array of SortationRule objects for completeness and correctness.
 *
 * Checks:
 * 1. Every rule has required fields (lane, stackingFilter, chute, resourceType).
 * 2. Lane numbers are positive integers.
 * 3. resourceType is 'D2C' or 'Multi'.
 *
 * @param {Array<object>} rules — parsed SortationRule array from parseSortationRules
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string, lane?: number, chuteId?: string}>, warnings: Array<{field: string, message: string, chuteId?: string}> }}
 */
export function validateStemIntegrity(rules) {
  const errors = [];
  const warnings = [];

  rules.forEach((rule, index) => {
    const ruleLabel = rule.chute || `rule at index ${index}`;

    // ── Required-field presence check ─────────────────────────
    for (const field of REQUIRED_FIELDS) {
      const value = rule[field];

      if (value == null || value === '') {
        errors.push({
          field,
          message: `Rule "${ruleLabel}" is missing required field "${field}".`,
          lane: typeof rule.lane === 'number' ? rule.lane : undefined,
          chuteId: rule.chute || undefined,
        });
      }
    }

    // ── Lane validation: must be a positive integer ───────────
    if (rule.lane != null && rule.lane !== '') {
      if (typeof rule.lane !== 'number' || Number.isNaN(rule.lane)) {
        errors.push({
          field: 'lane',
          message: `Rule "${ruleLabel}" has non-numeric lane value.`,
          chuteId: rule.chute || undefined,
        });
      } else if (!Number.isInteger(rule.lane) || rule.lane <= 0) {
        errors.push({
          field: 'lane',
          message: `Rule "${ruleLabel}" has invalid lane number (${rule.lane}). Lane must be a positive integer.`,
          lane: rule.lane,
          chuteId: rule.chute || undefined,
        });
      }
    }

    // ── resourceType validation: must be 'D2C' or 'Multi' ────
    if (rule.resourceType && !VALID_RESOURCE_TYPES.includes(rule.resourceType)) {
      errors.push({
        field: 'resourceType',
        message: `Rule "${ruleLabel}" has invalid resourceType "${rule.resourceType}". Expected "D2C" or "Multi".`,
        lane: typeof rule.lane === 'number' ? rule.lane : undefined,
        chuteId: rule.chute || undefined,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
