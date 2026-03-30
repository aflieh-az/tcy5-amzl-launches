/**
 * stem-editor.js — STEM Editor panel
 *
 * Renders a STEM file preview table, validation status, inline errors,
 * download button, and grid-STEM consistency checking.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3
 */

import { validateStemFile, exportStemBlob } from '../utils/stem-generator.js';

/**
 * Check grid-STEM consistency by comparing gridAssignments against stemFile rules.
 *
 * Returns an array of discrepancy objects for any chute-to-route mapping that
 * exists in one source but not the other.
 *
 * @param {Array<object>} gridAssignments — ChuteAssignment[] from the assignment engine
 * @param {Array<object>} rules — SortationRule[] from the stemFile
 * @returns {Array<{chuteId: string, routeCode: string, source: 'grid'|'stem', message: string}>}
 */
export function checkGridStemConsistency(gridAssignments, rules) {
  const discrepancies = [];

  // Build sets of "chuteId::routeCode" keys for each source
  const gridKeys = new Set();
  for (const a of gridAssignments) {
    gridKeys.add(`${a.chuteId}::${a.routeCode}`);
  }

  const stemKeys = new Set();
  for (const r of rules) {
    if (r.chute && r.stackingFilter) {
      stemKeys.add(`${r.chute}::${r.stackingFilter}`);
    }
  }

  // In grid but not in STEM
  for (const a of gridAssignments) {
    const key = `${a.chuteId}::${a.routeCode}`;
    if (!stemKeys.has(key)) {
      discrepancies.push({
        chuteId: a.chuteId,
        routeCode: a.routeCode,
        source: 'grid',
        message: `Chute "${a.chuteId}" → "${a.routeCode}" exists in grid but not in STEM`,
      });
    }
  }

  // In STEM but not in grid
  for (const r of rules) {
    if (!r.chute || !r.stackingFilter) continue;
    const key = `${r.chute}::${r.stackingFilter}`;
    if (!gridKeys.has(key)) {
      discrepancies.push({
        chuteId: r.chute,
        routeCode: r.stackingFilter,
        source: 'stem',
        message: `Chute "${r.chute}" → "${r.stackingFilter}" exists in STEM but not in grid`,
      });
    }
  }

  return discrepancies;
}


/**
 * Render the STEM Editor panel into the target element.
 *
 * 1. Validates the stemFile via validateStemFile
 * 2. Renders a preview table of all rules
 * 3. Shows validation status banner (green/red)
 * 4. Highlights rows with inline errors
 * 5. Provides a download button (disabled if invalid)
 * 6. Checks grid-STEM consistency and shows reconciliation alert
 *
 * @param {HTMLElement} targetEl — the panel div (#panel-stem-editor)
 * @param {object} stemFile — StemFile { rules, metadata } from generateStemFile
 * @param {Array<object>} gridAssignments — ChuteAssignment[] from the assignment engine
 */
export function renderStemEditor(targetEl, stemFile, gridAssignments) {
  const validation = validateStemFile(stemFile);
  const rules = stemFile.rules || [];
  const discrepancies = checkGridStemConsistency(gridAssignments, rules);

  // Build a set of error row indices for inline highlighting
  const errorRowIndices = buildErrorRowIndices(validation.errors, rules);

  let html = '';

  // ── Validation status banner ────────────────────────────────
  html += renderValidationBanner(validation);

  // ── Grid-STEM consistency alert ─────────────────────────────
  if (discrepancies.length > 0) {
    html += renderDiscrepancyAlert(discrepancies);
  }

  // ── STEM rules preview table ────────────────────────────────
  html += renderRulesTable(rules, validation.errors, errorRowIndices);

  // ── Download button ─────────────────────────────────────────
  html += renderDownloadButton(validation.valid);

  targetEl.innerHTML = html;

  // Wire up download button click handler
  const btn = targetEl.querySelector('.stem-download-btn');
  if (btn && validation.valid) {
    btn.addEventListener('click', () => {
      const blob = exportStemBlob(stemFile);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TCY5_STEM_${stemFile.metadata?.facility || 'TCY5'}.tsv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

/**
 * Build a Set of row indices that have validation errors.
 *
 * @param {Array<object>} errors — validation errors
 * @param {Array<object>} rules — SortationRule[]
 * @returns {Set<number>}
 */
function buildErrorRowIndices(errors, rules) {
  const indices = new Set();

  for (const err of errors) {
    // Match by chuteId if available
    if (err.chuteId) {
      rules.forEach((rule, i) => {
        if (rule.chute === err.chuteId) indices.add(i);
      });
    }

    // Also try to extract indices from duplicate error messages
    const indexMatch = err.message?.match(/rules (\d+) and (\d+)/);
    if (indexMatch) {
      indices.add(Number(indexMatch[1]));
      indices.add(Number(indexMatch[2]));
    }
  }

  return indices;
}

/**
 * Render the validation status banner.
 * @param {object} validation — { valid, errors, warnings }
 * @returns {string} HTML
 */
function renderValidationBanner(validation) {
  if (validation.valid) {
    return `<div class="stem-validation-banner" style="background:#d4edda;color:#155724;padding:10px 16px;border-radius:4px;margin-bottom:12px;border:1px solid #c3e6cb;">
      ✅ STEM file is valid — ready for download
    </div>`;
  }

  let html = `<div class="stem-validation-banner" style="background:#f8d7da;color:#721c24;padding:10px 16px;border-radius:4px;margin-bottom:12px;border:1px solid #f5c6cb;">
    ❌ STEM file has ${validation.errors.length} validation error${validation.errors.length !== 1 ? 's' : ''}:
    <ul style="margin:6px 0 0 0;padding-left:20px;">`;

  for (const err of validation.errors) {
    html += `<li>${escapeHtml(err.message)}</li>`;
  }

  html += '</ul></div>';
  return html;
}

/**
 * Render the grid-STEM discrepancy alert section.
 * @param {Array<object>} discrepancies
 * @returns {string} HTML
 */
function renderDiscrepancyAlert(discrepancies) {
  let html = `<div class="stem-discrepancy-alert" style="background:#fff3cd;color:#856404;padding:10px 16px;border-radius:4px;margin-bottom:12px;border:1px solid #ffeeba;">
    ⚠️ Grid-STEM Consistency: ${discrepancies.length} discrepanc${discrepancies.length !== 1 ? 'ies' : 'y'} found. Reconcile before proceeding.
    <ul style="margin:6px 0 0 0;padding-left:20px;">`;

  for (const d of discrepancies) {
    html += `<li>${escapeHtml(d.message)}</li>`;
  }

  html += '</ul></div>';
  return html;
}

/**
 * Render the STEM rules preview table.
 * @param {Array<object>} rules — SortationRule[]
 * @param {Array<object>} errors — validation errors
 * @param {Set<number>} errorRowIndices — indices of rows with errors
 * @returns {string} HTML
 */
function renderRulesTable(rules, errors, errorRowIndices) {
  let html = '<table class="stem-rules-table" style="width:100%;border-collapse:collapse;margin-bottom:12px;">';
  html += '<thead><tr>';
  html += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Lane</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Stacking Filter</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">VSM</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Resource Label</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Resource Type</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Chute</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Sorter</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const hasError = errorRowIndices.has(i);
    const rowStyle = hasError ? 'background:#f8d7da;' : '';

    html += `<tr style="${rowStyle}">`;
    html += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${rule.lane ?? ''}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(String(rule.stackingFilter ?? ''))}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(String(rule.vsm ?? ''))}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(String(rule.resourceLabel ?? ''))}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(String(rule.resourceType ?? ''))}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(String(rule.chute ?? ''))}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(String(rule.sorter ?? ''))}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

/**
 * Render the download button.
 * @param {boolean} isValid — whether the STEM file passed validation
 * @returns {string} HTML
 */
function renderDownloadButton(isValid) {
  const disabledAttr = isValid ? '' : 'disabled';
  const style = isValid
    ? 'background:#28a745;color:#fff;padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-size:1em;'
    : 'background:#6c757d;color:#fff;padding:8px 20px;border:none;border-radius:4px;cursor:not-allowed;font-size:1em;opacity:0.65;';

  return `<button class="stem-download-btn" ${disabledAttr} style="${style}">Download STEM File</button>`;
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
