/**
 * alert-bar.js — Alert bar component
 *
 * Shows/hides a warning, error, or info alert bar with appropriate styling.
 * Used for validation messages and discrepancy flags.
 *
 * Requirements: 1.3, 3.3, 7.2
 */

/**
 * Show an alert message in the given container.
 *
 * @param {HTMLElement} container - Target element (e.g. #alert-bar)
 * @param {string} message - Alert text
 * @param {'error'|'warning'|'info'} [type='error'] - Alert severity
 */
export function showAlert(container, message, type = 'error') {
  if (!container) return;

  // Clear previous type classes
  container.classList.remove('alert-error', 'alert-warning', 'alert-info');
  container.classList.add(`alert-${type}`);
  container.textContent = message;
  container.style.display = 'block';
  container.setAttribute('role', 'alert');
}

/**
 * Hide the alert bar and clear its content.
 *
 * @param {HTMLElement} container - Target element (e.g. #alert-bar)
 */
export function clearAlert(container) {
  if (!container) return;

  container.classList.remove('alert-error', 'alert-warning', 'alert-info');
  container.textContent = '';
  container.style.display = 'none';
  container.removeAttribute('role');
}
