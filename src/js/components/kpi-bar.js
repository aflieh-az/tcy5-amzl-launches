/**
 * kpi-bar.js — KPI summary cards component
 *
 * Renders KPI summary cards showing total routes, total chutes assigned,
 * and volume utilization into a container element.
 *
 * Requirements: 1.3
 */

/**
 * Render KPI summary cards into the given container.
 *
 * @param {HTMLElement} container - Target element (e.g. #kpi-bar)
 * @param {{ totalRoutes: number, totalChutesAssigned: number, volumeUtilization: number }} data
 */
export function renderKpiBar(container, data) {
  if (!container) return;

  const cards = [
    { label: 'New Lanes Added', value: data.newLanesAdded ?? 0, description: 'New AMZL routes launched' },
    { label: 'Chutes Used', value: data.totalChutesAssigned ?? 0, description: 'Chutes assigned to new routes' },
    { label: 'Total New ADV', value: (data.totalAdv ?? 0).toLocaleString(), description: 'Daily volume added to floor' },
  ];

  container.innerHTML = cards
    .map(
      (card) =>
        `<div class="kpi-card" role="status" aria-label="${card.label}">` +
        `<span class="kpi-label">${card.label}</span>` +
        `<span class="kpi-value">${card.value}</span>` +
        `<span class="kpi-desc" style="font-size:0.75em;opacity:0.7;display:block;margin-top:2px;">${card.description}</span>` +
        `</div>`
    )
    .join('');
}
