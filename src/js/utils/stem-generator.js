/**
 * stem-generator.js — STEM file generation, validation, and export
 *
 * Merges existing sortation rules with new chute assignments and preserved
 * assignments into a complete StemFile. Validates the result for missing fields
 * and unintentional duplicates. Exports as a TSV Blob for download.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 7.1
 */

import { PRESERVED_ASSIGNMENTS } from '../data/tcy5-config.js';

/**
 * Convert a ChuteAssignment to a SortationRule.
 *
 * The resourceLabel is set to the chuteId — in TCY5 sortation rules,
 * a resource label ending in `-FLAT` indicates D2C (direct-to-container).
 *
 * @param {object} assignment — ChuteAssignment from the assignment engine
 * @returns {object} SortationRule
 */
function assignmentToRule(assignment) {
  return {
    lane: assignment.lane,
    stackingFilter: assignment.routeCode,
    vsm: '',
    resourceLabel: assignment.chuteId,
    resourceType: assignment.chuteType,
    chute: assignment.chuteId,
    sorter: '',
  };
}

/**
 * Convert a PreservedAssignment to a SortationRule.
 *
 * @param {object} preserved — PreservedAssignment from tcy5-config
 * @returns {object} SortationRule
 */
function preservedToRule(preserved) {
  return {
    lane: 0,
    stackingFilter: preserved.routeCode,
    vsm: '',
    resourceLabel: preserved.chuteId,
    resourceType: preserved.chuteType,
    chute: preserved.chuteId,
    sorter: '',
  };
}

/**
 * Generate a complete StemFile by merging existing rules, new assignments,
 * and preserved assignments.
 *
 * - Determines "affected lanes" from the new assignments' lane values
 * - For affected lanes: replaces existing rules with new assignment rules
 * - For unaffected lanes: keeps existing rules as-is
 * - Preserved assignments are always included
 *
 * @param {Array<object>} existingRules — SortationRule[] from the current STEM
 * @param {Array<object>} newAssignments — ChuteAssignment[] from the assignment engine
 * @param {Array<object>} preservedAssignments — PreservedAssignment[] (defaults to PRESERVED_ASSIGNMENTS)
 * @returns {object} StemFile { rules, metadata }
 */
export function generateStemFile(existingRules, newAssignments, preservedAssignments) {
  const preserved = preservedAssignments || PRESERVED_ASSIGNMENTS;

  // Determine which lanes are affected by new assignments
  const affectedLanes = new Set(newAssignments.map((a) => a.lane));

  // Build a set of preserved chute IDs for deduplication
  const preservedChuteIds = new Set(preserved.map((p) => p.chuteId));

  // Keep existing rules for unaffected lanes, excluding preserved chutes
  // (preserved chutes are added separately to avoid duplicates)
  const unaffectedRules = existingRules.filter(
    (rule) => !affectedLanes.has(rule.lane) && !preservedChuteIds.has(rule.chute)
  ).map((rule) => ({ ...rule, _source: 'existing' }));

  // Convert new assignments to SortationRule format
  const newRules = newAssignments.map((a) => ({ ...assignmentToRule(a), _source: 'new' }));

  // Convert preserved assignments to SortationRule format
  const preservedRules = preserved.map((p) => ({ ...preservedToRule(p), _source: 'preserved' }));

  const rules = [...unaffectedRules, ...newRules, ...preservedRules];

  return {
    rules,
    metadata: {
      generatedAt: new Date().toISOString(),
      facility: 'TCY5',
      version: '1.0.0',
    },
  };
}

/**
 * Required fields that every SortationRule in a StemFile must have.
 * @type {string[]}
 */
const STEM_REQUIRED_FIELDS = ['chute', 'stackingFilter', 'lane', 'resourceType'];

/**
 * Validate a StemFile for missing required fields and unintentional duplicates.
 *
 * @param {object} file — StemFile to validate
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string, chuteId?: string, lane?: number}>, warnings: Array<{field: string, message: string, chuteId?: string}> }}
 */
export function validateStemFile(file) {
  const errors = [];
  const warnings = [];
  const rules = file.rules || [];

  // Check each rule for missing required fields
  rules.forEach((rule, index) => {
    const ruleLabel = rule.chute || `rule at index ${index}`;

    for (const field of STEM_REQUIRED_FIELDS) {
      const value = rule[field];
      if (value == null || value === '') {
        errors.push({
          field,
          message: `Rule "${ruleLabel}" is missing required field "${field}".`,
          chuteId: rule.chute || undefined,
          lane: typeof rule.lane === 'number' ? rule.lane : undefined,
        });
      }
    }
  });

  // Check for unintentional duplicates: same chute + stackingFilter
  // Only flag duplicates where at least one rule is newly generated
  // (pre-existing duplicates from the source STEM file are acceptable)
  const seen = new Map(); // key: "chute::stackingFilter" → { index, source }

  rules.forEach((rule, index) => {
    if (!rule.chute || !rule.stackingFilter) return;

    const key = `${rule.chute}::${rule.stackingFilter}`;

    if (seen.has(key)) {
      const first = seen.get(key);
      // Only flag if at least one of the two rules is newly generated
      // Rules without _source are treated as new (strict by default)
      const firstIsExisting = first.source === 'existing';
      const currentIsExisting = rule._source === 'existing';

      if (!(firstIsExisting && currentIsExisting)) {
        errors.push({
          field: 'chute',
          message: `Duplicate chute-to-route entry: chute "${rule.chute}" with stackingFilter "${rule.stackingFilter}" appears at rules ${first.index} and ${index}.`,
          chuteId: rule.chute,
          lane: typeof rule.lane === 'number' ? rule.lane : undefined,
        });
      }
    } else {
      seen.set(key, { index, source: rule._source || 'existing' });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Export a StemFile as a downloadable Blob in STEM-compatible TSV format.
 *
 * Columns: Lane, Stacking Filter, VSM, Resource Label, Resource Type, Chute, Sorter
 *
 * @param {object} file — StemFile to export
 * @returns {Blob} TSV blob with type 'text/tab-separated-values'
 */
export function exportStemBlob(file) {
  const header = ['Lane', 'Stacking Filter', 'VSM', 'Resource Label', 'Resource Type', 'Chute', 'Sorter'];
  const rules = file.rules || [];

  const rows = rules.map((rule) =>
    [
      rule.lane ?? '',
      rule.stackingFilter ?? '',
      rule.vsm ?? '',
      rule.resourceLabel ?? '',
      rule.resourceType ?? '',
      rule.chute ?? '',
      rule.sorter ?? '',
    ].join('\t')
  );

  const tsv = [header.join('\t'), ...rows].join('\n');

  return new Blob([tsv], { type: 'text/tab-separated-values' });
}
