/**
 * spot-parser.js — SPOT volume data parser and validator
 *
 * Parses the SPOT_Data worksheet from TCY5_Data.xlsx into SpotRoute objects
 * and validates that all 3 required routes have complete, non-negative ADV data.
 *
 * Requirements: 1.1, 1.2, 1.3
 */

import { NEW_ROUTES } from './tcy5-config.js';

/**
 * Required parentStackingFilter values for the 3 new AMZL routes.
 * @type {string[]}
 */
const REQUIRED_ROUTES = NEW_ROUTES.map((r) => r.parentStackingFilter);

/**
 * ADV fields that must be present, numeric, and non-negative on every route.
 * @type {string[]}
 */
const ADV_FIELDS = ['totalAdv', 'smallsAdv', 'nonconAdv', 'largeAdv'];

/**
 * Column-name mapping from the SPOT_Data sheet headers to SpotRoute fields.
 * Keys are the expected worksheet column headers; values are SpotRoute property names.
 * @type {Record<string, string>}
 */
const COLUMN_MAP = {
  'Sort Scheme': 'sortScheme',
  'Sort Center': 'sortCenter',
  'Parent Stacking Filter': 'parentStackingFilter',
  'Sunday Route Name': 'sundayRouteName',
  'Route Name': 'routeName',
  'Wave': 'wave',
  'Route Status': 'routeStatus',
  'Start Date': 'startDate',
  'End Date': 'endDate',
  'Program Type': 'programType',
  'Total ADV': 'totalAdv',
  'Smalls ADV': 'smallsAdv',
  'Noncon ADV': 'nonconAdv',
  'Large ADV': 'largeAdv',
};

/**
 * Parse a SPOT_Data worksheet into an array of SpotRoute objects.
 *
 * Uses the global `XLSX.utils.sheet_to_json` (loaded via CDN) to extract rows,
 * then maps worksheet column names to SpotRoute fields via COLUMN_MAP.
 *
 * @param {object} worksheet — SheetJS worksheet object (workbook.Sheets['SPOT_Data'])
 * @returns {Array<object>} Array of SpotRoute objects
 */
export function parseSpotSheet(worksheet) {
  /* global XLSX */
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  return rawRows.map((row) => {
    const route = {};

    for (const [colHeader, fieldName] of Object.entries(COLUMN_MAP)) {
      const value = row[colHeader];

      if (ADV_FIELDS.includes(fieldName)) {
        // Coerce ADV fields to numbers; leave as-is if not parseable (validator catches it)
        route[fieldName] = value != null ? Number(value) : null;
      } else {
        route[fieldName] = value != null ? String(value) : '';
      }
    }

    return route;
  });
}


/**
 * Validate an array of SpotRoute objects for completeness and correctness.
 *
 * Checks:
 * 1. Every route has all 4 ADV fields present, numeric, and non-negative.
 * 2. All 3 required routes (DCK6-CYC1, DFA5-CYC1, DSR2-CYC1) are present.
 *
 * @param {Array<object>} routes — parsed SpotRoute array from parseSpotSheet
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}> }}
 */
export function validateSpotData(routes) {
  const errors = [];
  const warnings = [];

  // ── Per-route ADV validation ──────────────────────────────
  routes.forEach((route, index) => {
    const routeLabel = route.parentStackingFilter || `row ${index}`;

    for (const field of ADV_FIELDS) {
      const value = route[field];

      if (value == null || value === '') {
        errors.push({
          field,
          message: `Route "${routeLabel}" is missing required field "${field}".`,
        });
      } else if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push({
          field,
          message: `Route "${routeLabel}" has non-numeric value for "${field}".`,
        });
      } else if (value < 0) {
        errors.push({
          field,
          message: `Route "${routeLabel}" has negative value (${value}) for "${field}".`,
        });
      }
    }
  });

  // ── Required-route presence check ─────────────────────────
  const presentFilters = new Set(routes.map((r) => r.parentStackingFilter));

  for (const required of REQUIRED_ROUTES) {
    if (!presentFilters.has(required)) {
      errors.push({
        field: 'parentStackingFilter',
        message: `Required route "${required}" is absent from SPOT data.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
