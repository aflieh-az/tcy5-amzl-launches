/**
 * spot-volume.js — SPOT Volume panel
 *
 * Renders an ADV table for the 3 new AMZL routes with validation status.
 * Shows inline errors and a warning banner when SPOT data is incomplete.
 *
 * Requirements: 1.1, 1.2, 1.3
 */

import { NEW_ROUTES } from '../data/tcy5-config.js';

/**
 * The 3 required parentStackingFilter values.
 * @type {string[]}
 */
const REQUIRED_FILTERS = NEW_ROUTES.map((r) => r.parentStackingFilter);

/**
 * Render the SPOT Volume panel.
 *
 * @param {HTMLElement} targetEl — the panel div (#panel-spot-volume)
 * @param {Array<object>} routes — SpotRoute[] from parseSpotSheet
 * @param {{ valid: boolean, errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}> }} validationResult
 */
export function renderSpotVolume(targetEl, routes, validationResult) {
  const { valid, errors } = validationResult;

  // Build a lookup by parentStackingFilter for the 3 required routes
  const routeMap = new Map();
  for (const route of routes) {
    if (REQUIRED_FILTERS.includes(route.parentStackingFilter)) {
      routeMap.set(route.parentStackingFilter, route);
    }
  }

  // Collect per-route errors for status display
  const routeErrors = new Map();
  for (const err of errors) {
    // Extract route name from error message pattern: Route "X" ...
    const match = err.message.match(/Route "([^"]+)"/);
    if (match) {
      const key = match[1];
      if (!routeErrors.has(key)) routeErrors.set(key, []);
      routeErrors.get(key).push(err.message);
    }
  }

  let html = '';

  // Warning banner when data is invalid
  if (!valid) {
    html += '<div class="spot-warning-banner" role="alert" style="background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;margin-bottom:12px;border-radius:4px;color:#856404;">';
    html += '<strong>⚠ SPOT data is incomplete or invalid.</strong> Resolve errors below before proceeding.';
    html += '</div>';
  }

  // ADV table
  html += '<table class="spot-volume-table" style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr>';
  html += '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Route</th>';
  html += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Total ADV</th>';
  html += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Smalls ADV</th>';
  html += '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Large ADV</th>';
  html += '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333;">Status</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (const filter of REQUIRED_FILTERS) {
    const route = routeMap.get(filter);
    const errs = routeErrors.get(filter) || [];
    const hasRoute = !!route;
    const hasErrors = errs.length > 0 || !hasRoute;

    html += '<tr>';
    html += `<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(filter)}</td>`;
    html += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${hasRoute ? route.totalAdv : '—'}</td>`;
    html += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${hasRoute ? route.smallsAdv : '—'}</td>`;
    html += `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;">${hasRoute ? route.largeAdv : '—'}</td>`;

    if (hasErrors) {
      html += '<td style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;color:#dc3545;font-weight:bold;">✗</td>';
    } else {
      html += '<td style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;color:#28a745;font-weight:bold;">✓</td>';
    }
    html += '</tr>';

    // Inline error messages for this route
    if (hasErrors) {
      const messages = errs.length > 0
        ? errs
        : [`Required route "${filter}" is absent from SPOT data.`];
      for (const msg of messages) {
        html += '<tr class="spot-error-row">';
        html += `<td colspan="5" style="padding:2px 8px 6px 24px;color:#dc3545;font-size:0.9em;border-bottom:1px solid #ddd;">${escapeHtml(msg)}</td>`;
        html += '</tr>';
      }
    }
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
