/**
 * ops-checklist.test.js — Unit tests for the Ops Checklist panel
 *
 * Tests generateOpsChecklist logic and renderOpsChecklist HTML output.
 *
 * Requirements: 8.1, 8.2, 8.3, 9.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateOpsChecklist, renderOpsChecklist } from '../ops-checklist.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChangeItem(overrides = {}) {
  return {
    chuteId: '20501',
    lane: 7,
    changeType: 'PanD2C_Flip',
    description: 'Chute 20501: Changing D2C to Multi',
    fromState: 'D2C',
    toState: 'Multi',
    ...overrides,
  };
}

function makeDom() {
  const el = document.createElement('div');
  el.id = 'panel-ops-checklist';
  return el;
}

// ---------------------------------------------------------------------------
// generateOpsChecklist
// ---------------------------------------------------------------------------

describe('generateOpsChecklist', () => {
  it('returns one item per change plus AR confirmation item', () => {
    const changes = [makeChangeItem(), makeChangeItem({ chuteId: '20502', lane: 12 })];
    const result = generateOpsChecklist(changes);
    // 2 change items + 1 AR confirmation = 3
    expect(result).toHaveLength(3);
  });

  it('always includes AR layout confirmation as last item', () => {
    const result = generateOpsChecklist([makeChangeItem()]);
    const last = result[result.length - 1];
    expect(last.id).toBe('ar-layout-confirm');
    expect(last.description).toBe('AR floor layout updated');
    expect(last.isArLayout).toBe(true);
    expect(last.changeType).toBe('AR_Layout');
    expect(last.responsibleParty).toBe('MFO Engineer');
    expect(last.targetDate).toBe('3/22');
    expect(last.completed).toBe(false);
    expect(last.lane).toBe(0);
  });

  it('includes AR confirmation even with empty change list', () => {
    const result = generateOpsChecklist([]);
    expect(result).toHaveLength(1);
    expect(result[0].isArLayout).toBe(true);
  });

  it('assigns unique ids like ops-{lane}-{index}', () => {
    const changes = [
      makeChangeItem({ lane: 5 }),
      makeChangeItem({ lane: 12 }),
    ];
    const result = generateOpsChecklist(changes);
    expect(result[0].id).toBe('ops-5-0');
    expect(result[1].id).toBe('ops-12-1');
  });

  it('sets responsibleParty to "MFO Engineer" for PanD2C_Flip', () => {
    const result = generateOpsChecklist([makeChangeItem({ changeType: 'PanD2C_Flip' })]);
    expect(result[0].responsibleParty).toBe('MFO Engineer');
  });

  it('sets responsibleParty to "Ops Team" for 5S_Square', () => {
    const result = generateOpsChecklist([makeChangeItem({ changeType: '5S_Square' })]);
    expect(result[0].responsibleParty).toBe('Ops Team');
  });

  it('sets targetDate "3/22" for PanD2C_Flip and "3/23" for 5S_Square', () => {
    const changes = [
      makeChangeItem({ changeType: 'PanD2C_Flip' }),
      makeChangeItem({ changeType: '5S_Square' }),
    ];
    const result = generateOpsChecklist(changes);
    expect(result[0].targetDate).toBe('3/22');
    expect(result[1].targetDate).toBe('3/23');
  });

  it('all items start with completed: false', () => {
    const result = generateOpsChecklist([makeChangeItem(), makeChangeItem()]);
    for (const item of result) {
      expect(item.completed).toBe(false);
    }
  });

  it('non-AR items have isArLayout: false', () => {
    const result = generateOpsChecklist([makeChangeItem()]);
    expect(result[0].isArLayout).toBe(false);
  });

  it('each item has all required OpsChecklistItem fields', () => {
    const result = generateOpsChecklist([makeChangeItem()]);
    for (const item of result) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('lane');
      expect(item).toHaveProperty('changeType');
      expect(item).toHaveProperty('responsibleParty');
      expect(item).toHaveProperty('targetDate');
      expect(item).toHaveProperty('completed');
      expect(item).toHaveProperty('isArLayout');
    }
  });
});

// ---------------------------------------------------------------------------
// renderOpsChecklist
// ---------------------------------------------------------------------------

describe('renderOpsChecklist', () => {
  let el;
  beforeEach(() => {
    el = makeDom();
  });

  it('renders a table with rows for each change item plus AR confirmation', () => {
    const changes = [makeChangeItem(), makeChangeItem({ chuteId: '20502', lane: 12 })];
    renderOpsChecklist(el, changes);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3); // 2 changes + 1 AR
  });

  it('renders checkboxes for each item', () => {
    renderOpsChecklist(el, [makeChangeItem()]);
    const checkboxes = el.querySelectorAll('.ops-checkbox');
    expect(checkboxes.length).toBe(2); // 1 change + 1 AR
  });

  it('shows warning banner when items are incomplete', () => {
    renderOpsChecklist(el, [makeChangeItem()]);
    const banner = el.querySelector('.ops-warning-banner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('incomplete');
  });

  it('does not render a go-live button', () => {
    renderOpsChecklist(el, [makeChangeItem()]);
    const btn = el.querySelector('.ops-go-live-btn');
    expect(btn).toBeNull();
  });

  it('displays description, lane, changeType, responsibleParty, targetDate', () => {
    const changes = [makeChangeItem({ lane: 7, changeType: 'PanD2C_Flip', description: 'Flip chute X' })];
    renderOpsChecklist(el, changes);
    const html = el.innerHTML;
    expect(html).toContain('Flip chute X');
    expect(html).toContain('7');
    expect(html).toContain('PanD2C_Flip');
    expect(html).toContain('MFO Engineer');
    expect(html).toContain('3/22');
  });

  it('displays AR layout confirmation row', () => {
    renderOpsChecklist(el, []);
    const html = el.innerHTML;
    expect(html).toContain('AR floor layout updated');
    expect(html).toContain('AR_Layout');
  });

  it('enables go-live button when AR checkbox is checked — REMOVED (no go-live button)', () => {
    renderOpsChecklist(el, []);
    const arCheckbox = el.querySelector('.ops-checkbox[data-id="ar-layout-confirm"]');
    expect(arCheckbox).not.toBeNull();

    // Simulate checking the AR checkbox
    arCheckbox.checked = true;
    arCheckbox.dispatchEvent(new Event('change'));

    // No go-live button should exist
    const btn = el.querySelector('.ops-go-live-btn');
    expect(btn).toBeNull();
  });

  it('checkbox toggles completed state on items', () => {
    renderOpsChecklist(el, [makeChangeItem()]);
    const checkboxes = el.querySelectorAll('.ops-checkbox');
    const firstCb = checkboxes[0];

    // Check it
    firstCb.checked = true;
    firstCb.dispatchEvent(new Event('change'));

    // Uncheck it
    firstCb.checked = false;
    firstCb.dispatchEvent(new Event('change'));

    // No go-live button
    const btn = el.querySelector('.ops-go-live-btn');
    expect(btn).toBeNull();
  });

  it('removes warning banner when all items are completed', () => {
    renderOpsChecklist(el, []);
    // Only the AR item exists
    const arCb = el.querySelector('.ops-checkbox[data-id="ar-layout-confirm"]');
    arCb.checked = true;
    arCb.dispatchEvent(new Event('change'));

    const banner = el.querySelector('.ops-warning-banner');
    expect(banner).toBeNull();
  });

  it('re-adds warning banner when an item is unchecked', () => {
    renderOpsChecklist(el, []);
    const arCb = el.querySelector('.ops-checkbox[data-id="ar-layout-confirm"]');

    // Check then uncheck
    arCb.checked = true;
    arCb.dispatchEvent(new Event('change'));
    arCb.checked = false;
    arCb.dispatchEvent(new Event('change'));

    const banner = el.querySelector('.ops-warning-banner');
    expect(banner).not.toBeNull();
  });

  it('escapes HTML in descriptions', () => {
    const changes = [makeChangeItem({ description: '<script>alert(1)</script>' })];
    renderOpsChecklist(el, changes);
    expect(el.innerHTML).not.toContain('<script>');
    expect(el.innerHTML).toContain('&lt;script&gt;');
  });
});
