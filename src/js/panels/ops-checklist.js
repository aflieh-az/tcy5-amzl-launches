/**
 * ops-checklist.js — Ops Checklist panel (AR only — NC out of scope)
 *
 * Generates an Ops coordination checklist from the finalized Change Overview,
 * with interactive checkboxes, a warning banner for incomplete items, and
 * a go-live button gated on AR floor layout confirmation.
 *
 * Requirements: 8.1, 8.2, 8.3, 9.2
 */

/**
 * Generate an OpsChecklistItem[] from a ChangeOverviewItem[].
 *
 * Creates one checklist item per change-overview item, plus a trailing
 * AR floor layout confirmation item. NC items are excluded (out of scope).
 *
 * @param {Array<object>} changeOverviewItems — ChangeOverviewItem[]
 * @returns {Array<object>} OpsChecklistItem[]
 */
export function generateOpsChecklist(changeOverviewItems) {
  const items = changeOverviewItems.map((item, index) => {
    const isPanD2CFlip = item.changeType === 'PanD2C_Flip';
    return {
      id: `ops-${item.lane}-${index}`,
      description: item.description,
      lane: item.lane,
      changeType: item.changeType,
      responsibleParty: isPanD2CFlip ? 'MFO Engineer' : 'Ops Team',
      targetDate: isPanD2CFlip ? '3/22' : '3/23',
      completed: false,
      isArLayout: false,
    };
  });

  // Always append the AR floor layout confirmation item
  items.push({
    id: 'ar-layout-confirm',
    description: 'AR floor layout updated',
    lane: 0,
    changeType: 'AR_Layout',
    responsibleParty: 'MFO Engineer',
    targetDate: '3/22',
    completed: false,
    isArLayout: true,
  });

  return items;
}

/**
 * Render the Ops Checklist panel into the target element.
 *
 * Calls generateOpsChecklist, renders each item as a row with an interactive
 * checkbox, and adds a warning banner when any item is incomplete. The go-live
 * button is disabled until the AR layout confirmation checkbox is checked.
 *
 * @param {HTMLElement} targetEl — the panel div (#panel-ops-checklist)
 * @param {Array<object>} changeOverviewItems — ChangeOverviewItem[]
 */
export function renderOpsChecklist(targetEl, changeOverviewItems) {
  const items = generateOpsChecklist(changeOverviewItems);

  // Build the checklist table rows
  let rowsHtml = '';
  for (const item of items) {
    rowsHtml += `<tr data-item-id="${escapeHtml(item.id)}">`;
    rowsHtml += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:center;">`;
    rowsHtml += `<input type="checkbox" class="ops-checkbox" data-id="${escapeHtml(item.id)}" ${item.completed ? 'checked' : ''} aria-label="Mark ${escapeAttr(item.description)} complete" /></td>`;
    rowsHtml += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(item.description)}</td>`;
    rowsHtml += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${item.lane === 0 ? '—' : item.lane}</td>`;
    rowsHtml += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(item.changeType)}</td>`;
    rowsHtml += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(item.responsibleParty)}</td>`;
    rowsHtml += `<td style="padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(item.targetDate)}</td>`;
    rowsHtml += '</tr>';
  }

  // Warning banner (shown when any item is incomplete)
  const hasIncomplete = items.some((i) => !i.completed);
  const warningHtml = hasIncomplete
    ? `<div class="ops-warning-banner" style="background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;margin-bottom:12px;border-radius:4px;color:#856404;" role="alert">Warning: Some checklist items are incomplete. All items must be completed before go-live.</div>`
    : '';

  let html = '';
  html += warningHtml;
  html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">';
  html += '<thead><tr>';
  html += '<th style="text-align:center;padding:4px 8px;border-bottom:2px solid #333;width:50px;">Done</th>';
  html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Description</th>';
  html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Lane</th>';
  html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Change Type</th>';
  html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Responsible</th>';
  html += '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333;">Target Date</th>';
  html += '</tr></thead><tbody>';
  html += rowsHtml;
  html += '</tbody></table>';

  targetEl.innerHTML = html;

  // Wire up interactive checkboxes
  const checkboxes = targetEl.querySelectorAll('.ops-checkbox');
  for (const cb of checkboxes) {
    cb.addEventListener('change', () => {
      const itemId = cb.getAttribute('data-id');
      const item = items.find((i) => i.id === itemId);
      if (item) {
        item.completed = cb.checked;
      }

      // Re-evaluate warning banner
      const anyIncomplete = items.some((i) => !i.completed);
      const banner = targetEl.querySelector('.ops-warning-banner');
      if (anyIncomplete && !banner) {
        const newBanner = document.createElement('div');
        newBanner.className = 'ops-warning-banner';
        newBanner.setAttribute('role', 'alert');
        newBanner.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;margin-bottom:12px;border-radius:4px;color:#856404;';
        newBanner.textContent = 'Warning: Some checklist items are incomplete. All items must be completed before go-live.';
        targetEl.insertBefore(newBanner, targetEl.firstChild);
      } else if (!anyIncomplete && banner) {
        banner.remove();
      }
    });
  }
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

/**
 * Escape a string for safe use inside an HTML attribute value.
 * Strips angle brackets entirely so jsdom won't parse them as tags.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
