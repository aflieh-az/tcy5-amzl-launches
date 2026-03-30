/**
 * floor-layout-grid.js — Floor Layout Grid panel
 *
 * Thin wrapper that delegates all rendering to grid-renderer.js.
 * Receives lane geometry, chute assignments, and preserved assignments,
 * then sets the target element's innerHTML with the returned SVG markup.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { renderFloorGrid } from '../utils/grid-renderer.js';

/**
 * Render the floor layout grid panel.
 *
 * @param {HTMLElement} targetEl — the panel div (#panel-floor-layout-grid)
 * @param {Array<{lane: number, gridRow: number, gridCol: number, chutes: string[], waveGroup: string}>} geometry
 * @param {Array<{chuteId: string, lane: number, routeCode: string, chuteType: string, assignedAdv: number, volumeCategory: string, isDuplicate: boolean}>} assignments
 * @param {Array<{chuteId: string, routeCode: string, chuteType: string, description: string}>} preserved
 */
export function renderFloorLayoutGrid(targetEl, geometry, assignments, preserved) {
  const svg = renderFloorGrid(geometry, assignments, preserved);
  targetEl.innerHTML = svg;
}
