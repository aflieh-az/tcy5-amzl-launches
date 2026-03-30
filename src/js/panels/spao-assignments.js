/**
 * spao-assignments.js — SPAO Assignments panel
 *
 * Renders a chute-to-route recommendation table from the assignment engine output.
 * Highlights capacity violations with warning badges.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.3
 */

/**
 * Render the SPAO Assignments panel.
 *
 * @param {HTMLElement} targetEl — the panel div (#panel-spao-assignments)
 * @param {Array<object>} assignments — ChuteAssignment[] from the assignment engine (after splitOverCapacity)
 * @param {Array<object>} violations — CapacityViolation[] from validateChuteCapacity
 */
export function renderSpaoAssignments(targetEl, assignments, violations) {
  // Build a lookup of violations by chuteId for fast access
  const violationMap = new Map();
  for (const v of violations) {
    violationMap.set(v.chuteId, v);
  }

  let html = '';

  html += '<table class="spao-assignments-table" style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Chute ID</th>';
  html += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Lane</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Route</th>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Chute Type</th>';
  html += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">ADV</th>';
  html += '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333;">Duplicate</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (const a of assignments) {
    const violation = violationMap.get(a.chuteId);
    const rowStyle = violation
      ? 'background:#fff3cd;'
      : '';

    html += `<tr style="${rowStyle}">`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(a.chuteId)}</td>`;
    html += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${a.lane}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(a.routeCode)}</td>`;
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(a.chuteType)}</td>`;

    // ADV cell — append warning badge if violation exists
    html += '<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">';
    html += `${a.assignedAdv}`;
    if (violation) {
      html += ` <span class="spao-warning-badge" style="background:#e67e22;color:#fff;padding:1px 6px;border-radius:3px;font-size:0.85em;">+${violation.overageAmount}</span>`;
    }
    html += '</td>';

    html += `<td style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;">${a.isDuplicate ? 'Yes' : 'No'}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';

  targetEl.innerHTML = html;
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
