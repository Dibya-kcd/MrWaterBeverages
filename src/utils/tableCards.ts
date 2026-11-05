/**
 * Phone-friendly report tables.
 *
 * Tags every cell of a report table with its column title (data-label) so the stylesheet
 * can show each row as a small card on phones ("Gross Sales ₹12,400", "Due ₹0" ...).
 *  - body rows AND total (footer) rows are handled, also when a total cell spans several columns
 *  - tables with up to MAX_CARD_COLUMNS columns become cards; tables with more than
 *    DENSE_FROM columns use a compact two-column card (label above value)
 *  - nested tables (inside an expanded row) and tables with a two-level header stay as
 *    normal sideways-scrolling tables
 * Rows that span the full width (expanded details) are left alone.
 */
const MAX_CARD_COLUMNS = 16;
const DENSE_FROM = 5;

function enhanceTable(table: HTMLTableElement) {
  const reset = () => {
    table.removeAttribute('data-cards');
    table.removeAttribute('data-dense');
  };
  if (table.parentElement?.closest('td, th')) return reset();
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return reset();
  const heads = Array.from(headRow.cells);
  if (heads.length < 2 || heads.length > MAX_CARD_COLUMNS || heads.some((h) => h.colSpan > 1)) {
    return reset();
  }
  const labels = heads.map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim());

  const sections: HTMLTableSectionElement[] = [...Array.from(table.tBodies)];
  if (table.tFoot) sections.push(table.tFoot);
  for (const section of sections) {
    for (const row of Array.from(section.rows)) {
      let col = 0;
      for (const c of Array.from(row.cells)) {
        if (c.colSpan > 1) {
          if (c.hasAttribute('data-label')) c.removeAttribute('data-label');
        } else {
          const label = labels[col] ?? '';
          if (c.getAttribute('data-label') !== label) c.setAttribute('data-label', label);
        }
        col += c.colSpan || 1;
      }
    }
  }
  table.setAttribute('data-cards', '1');
  if (labels.length > DENSE_FROM) table.setAttribute('data-dense', '1');
  else table.removeAttribute('data-dense');
}

export function installTableCards(root: HTMLElement): () => void {
  let queued = false;
  const run = () => {
    queued = false;
    root.querySelectorAll<HTMLTableElement>('table').forEach(enhanceTable);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  run();
  const mo = new MutationObserver(schedule);
  mo.observe(root, { childList: true, subtree: true });
  return () => mo.disconnect();
}
