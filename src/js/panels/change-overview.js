/**
 * change-overview.js — Change Overview panel
 *
 * Compares old vs. new chute assignments to produce a list of physical
 * floor changes (PanD2C flips and new 5S_Square locations), grouped by lane.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { classifyChute } from '../utils/chute-assign.js';

/**
 * Resolve a chuteType to 'D2C' or 'Multi'.
 * If the value from the data is not one of those (e.g. 'STACKING_AREA'),
 * fall back to checking the resource label for the -FLAT suffix.
 * If no resource label, fall back to the chute ID.
 */
function resolveType(chuteType, chuteId, resourceLabel) {
  if (chuteType === 'D2C' || chuteType === 'Multi') return chuteType;
  return classifyChute(resourceLabel || chuteId);
}

/**
 * Compare old and new assignments to find physical floor changes.
 *
 * For each chute present in newAssignments:
 *   - If the chute existed in oldAssignments and its chuteType changed
 *     (D2C ↔ Multi), emit a PanD2C_Flip item.
 *   - If the chute has no old assignment or the routeCode changed,
 *     emit a 5S_Square item (new staging location needed).
 *
 * @param {Array<object>} oldAssignments — ChuteAssignment[] (previous state)
 * @param {Array<object>} newAssignments — ChuteAssignment[] (proposed state)
 * @returns {Array<object>} ChangeOverviewItem[]
 */
export function generateChangeOverview(oldAssignments, newAssignments) {
  // Index old assignments by chuteId for O(1) lookup
  const oldMap = new Map();
  for (const a of oldAssignments) {
    oldMap.set(a.chuteId, a);
  }

  const changes = [];

  for (const newA of newAssignments) {
    const oldA = oldMap.get(newA.chuteId);

    if (oldA) {
      // Chute existed before — check for type flip
      const oldType = resolveType(oldA.chuteType, oldA.chuteId, oldA.resourceLabel);
      const newType = resolveType(newA.chuteType, newA.chuteId, newA.resourceLabel);

      if (oldType !== newType) {
        changes.push({
          chuteId: newA.chuteId,
          lane: newA.lane,
          changeType: 'PanD2C_Flip',
          description: `Chute ${newA.chuteId}: Changing ${oldType} to ${newType}`,
          fromState: oldType,
          toState: newType,
        });
      }

      // Check for route change → new 5S_Square needed
      if (oldA.routeCode !== newA.routeCode) {
        changes.push({
          chuteId: newA.chuteId,
          lane: newA.lane,
          changeType: '5S_Square',
          description: `Chute ${newA.chuteId} reassigned from ${oldA.routeCode} to ${newA.routeCode}`,
          fromState: oldA.routeCode,
          toState: newA.routeCode,
        });
      }
    } else {
      // Brand-new assignment — needs a 5S_Square
      changes.push({
        chuteId: newA.chuteId,
        lane: newA.lane,
        changeType: '5S_Square',
        description: `New assignment: Chute ${newA.chuteId} → ${newA.routeCode}`,
        fromState: undefined,
        toState: newA.routeCode,
      });
    }
  }

  return changes;
}

/**
 * Render the Change Overview panel into the target element.
 *
 * Groups changes by lane and displays PanD2C_Flip and 5S_Square items.
 * For lanes in allowedLanes with no changes, explicitly states
 * "No floor changes needed for Lane X".
 *
 * @param {HTMLElement} targetEl — the panel div (#panel-change-overview)
 * @param {Array<object>} oldAssignments — ChuteAssignment[] (previous state)
 * @param {Array<object>} newAssignments — ChuteAssignment[] (proposed state)
 * @param {number[]} allowedLanes — lanes to report on (e.g. [5,6,7,12,19,20])
 */
export function renderChangeOverview(targetEl, oldAssignments, newAssignments, allowedLanes) {
  const changes = generateChangeOverview(oldAssignments, newAssignments);

  // Group changes by lane
  const byLane = new Map();
  for (const item of changes) {
    if (!byLane.has(item.lane)) {
      byLane.set(item.lane, []);
    }
    byLane.get(item.lane).push(item);
  }

  let html = '';

  // Sort allowedLanes numerically for consistent display
  const sortedLanes = [...allowedLanes].sort((a, b) => a - b);

  for (const lane of sortedLanes) {
    const laneChanges = byLane.get(lane);

    html += `<div class="change-overview-lane" style="margin-bottom:16px;">`;
    html += `<h3 style="margin:0 0 8px 0;font-size:1.1em;border-bottom:1px solid #ccc;padding-bottom:4px;">Lane ${lane}</h3>`;

    if (!laneChanges || laneChanges.length === 0) {
      html += `<p style="color:#6c757d;margin:4px 0;">No floor changes needed for Lane ${lane}</p>`;
    } else {
      // Separate by change type
      const flips = laneChanges.filter((c) => c.changeType === 'PanD2C_Flip');
      const squares = laneChanges.filter((c) => c.changeType === '5S_Square');

      if (flips.length > 0) {
        html += `<h4 style="margin:8px 0 4px 0;font-size:0.95em;color:#d35400;">PanD2C Flips</h4>`;
        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">';
        html += '<thead><tr>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Chute ID</th>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">From</th>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">To</th>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Description</th>';
        html += '</tr></thead><tbody>';
        for (const f of flips) {
          html += '<tr>';
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(f.chuteId)}</td>`;
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(f.fromState || '')}</td>`;
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(f.toState || '')}</td>`;
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(f.description)}</td>`;
          html += '</tr>';
        }
        html += '</tbody></table>';
      }

      if (squares.length > 0) {
        html += `<h4 style="margin:8px 0 4px 0;font-size:0.95em;color:#2980b9;">5S Square Changes</h4>`;
        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">';
        html += '<thead><tr>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Chute ID</th>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">From</th>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">To</th>';
        html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Description</th>';
        html += '</tr></thead><tbody>';
        for (const s of squares) {
          html += '<tr>';
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(s.chuteId)}</td>`;
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(s.fromState || '—')}</td>`;
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(s.toState || '')}</td>`;
          html += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(s.description)}</td>`;
          html += '</tr>';
        }
        html += '</tbody></table>';
      }
    }

    html += '</div>';
  }

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
