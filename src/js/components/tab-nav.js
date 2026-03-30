/**
 * tab-nav.js — Tab navigation component
 *
 * Wires click handlers on tab buttons to show/hide panels and manages
 * active state with aria-selected for accessibility.
 *
 * Requirements: (UI shell)
 */

/**
 * Initialise tab navigation.
 *
 * @param {HTMLElement} navContainer  - Element containing `.tab-btn` buttons (e.g. #tab-nav)
 * @param {HTMLElement} panelContainer - Element containing `.panel` divs (e.g. #panel-container)
 */
export function initTabNav(navContainer, panelContainer) {
  if (!navContainer || !panelContainer) return;

  const buttons = navContainer.querySelectorAll('.tab-btn');
  const panels = panelContainer.querySelectorAll('.panel');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Deactivate all
      buttons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      panels.forEach((p) => p.classList.remove('active'));

      // Activate selected
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      const target = panelContainer.querySelector(`#panel-${btn.dataset.panel}`);
      if (target) target.classList.add('active');
    });
  });
}
