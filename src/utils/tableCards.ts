/**
 * Phone-friendly tables: tags every cell of a simple report table with its column title
 * (data-label) so the stylesheet can show each row as a small card on phones
 * ("Gross Sales ₹12,400" on one line, "Due ₹0" on the next ...).
 * Wide tables (more than 8 columns) are left as sideways-scrolling tables.
 * Rows that span the full width (expanded details) are left alone.
 */
const MAX_CARD_COLUMNS = 8;

function enhanceTable(table: HTMLTableElement) {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return;
  const heads = Array.from(headRow.cells);
  if (heads.length < 2 || heads.length > MAX_CARD_COLUMNS) {
    table.removeAttribute('data-cards');
    return;
  }
  if (heads.some((h) => h.colSpan > 1)) {
    table.removeAttribute('data-cards');
    return;
  }
  const labels = heads.map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim());
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      const cells = Array.from(row.cells);
      if (cells.length !== labels.length || cells.some((c) => c.colSpan > 1)) continue;
      cells.forEach((c, i) => {
        if (c.getAttribute('data-label') !== labels[i]) c.setAttribute('data-label', labels[i]);
      });
    }
  }
  table.setAttribute('data-cards', '1');
}

export function installTableCards(root: HTMLElement): () => void {
  let queued = false;
  const run = () => {
    queued = false;
    root.querySelectorAll<HTMLTableElement>('table.data-table').forEach(enhanceTable);
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
