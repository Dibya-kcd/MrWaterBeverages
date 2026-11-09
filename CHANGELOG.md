## Select Beverages & Crates: size chips and hidden list

- Size chips now match the cards. They were fixed 500 ml / 1 L / 2 L buckets that read only the saved volume, so products with the size only in their name were missed, 750 ml landed under "1 L" and 1.5 L under "2 L", and "Soda" matched nothing (the category is stored as "vibe"). Chips are now built from the sizes you actually stock, using the same size the card shows. Soda matches the carbonated category. A chip whose size disappears falls back to All.
- Category pills show real names (Carbonated / Soda, Energy Drinks, Fruit Juices) instead of vibe / energy / joos.
- List no longer squeezed out on short screens (small laptops, landscape phones): filters and list scroll together, and the total + buttons share one row. Normal screens are unchanged.

## Landing + sign-in redesign (editable content)

- New landing page and sign-in page in the Hydrate Hub look (Inter, blue/lavender tokens, orange H logo). Replaces the old green "Crate" screens. Login logic and every element id are unchanged.
- Landing: top bar with language switch, hero, sample phone preview (sample figures, labelled), feature cards. Sign-in: split layout on desktop, single card on phone. Both scale with the text-size setting and have no sideways overflow at 130% text on a 360px phone.
- Content is editable: Settings > Login page (owner only) changes brand name, headline, sub-heading, 4 feature cards (text + icon), buttons, footer, sign-in text and side-panel points. Saved on this device; Copy JSON / Load JSON moves it to another device. Defaults live in src/constants/landingContent.ts.
- New files: src/auth.css, src/constants/landingContent.ts, src/components/common/LandingIcon.tsx, src/components/views/LoginPageEditor.tsx.

## Text-size layout, avatar, depot row

- Settings tab strip (and every other flex + overflow-x-auto chip row): tabs no longer shrink and clip their labels at Large / Extra Large text. They keep their width, swipe sideways, snap, and the tapped tab scrolls fully into view (index.css, main.tsx, SettingsView).
- Long text wraps inside cards instead of spilling off the screen; profile dropdown is capped to the screen width/height.
- Profile badge now shows an avatar icon instead of a letter (top bar, profile menu, desktop sidebar card). Choose it in Settings > Display > Profile avatar; "initial letter" is still an option. The orange H brand logo is unchanged.
- "Depot: <name>" in the profile menu now shows the default godown, and only when more than one godown exists. It was just the first godown record, not a setting.

# Hydrate Hub restyle - CHANGELOG (Steps 1-6; see "Still open")

Presentation only. No changes to src/utils, src/lib, src/context, src/types, tests or Supabase config.

## Done
Step 1 - tokens and fonts
- src/index.css: new design tokens on :root (colour, radii, shadows, spacing, type); old teal tokens removed; duplicate :root block that re-set --brand to #0d4a3a removed; old .app-shell backgrounds removed.
- src/mobile-theme.css: phone-only wrapper removed (theme rules now apply at every width); only gutter/dialog rules remain phone-only; uppercase labels and 800 weights restored; min 12px; backdrop blur off.
- src/styles.css, index.html, src/index.html: Inter 400-800 + Noto Sans Oriya; Manrope/Sora removed.
Step 2 - navigation
- NEW src/shell.css (breakpoint shell + shared component styles), imported in src/main.tsx.
- src/components/common/Nav.tsx (menu sheet, TabletRail, DesktopSidebar), MobileNav.tsx (floating bar), AppHeader.tsx (phone header), NEW TopBar.tsx, NEW BrandMark.tsx.
- NEW src/hooks/useNeedsAttention.ts (read-only roll-up from existing data).
- src/App.tsx: new shell wiring, 2px primary focus ring, teal spinner colour removed.
Step 3/4 - shared components + Home
- NEW src/components/ui/HomeKit.tsx (ProgressRing, HeroCollectionCard, ShortcutTile, HubMetricCard, SegmentedPeriod, StatusPill, BillsList/BillsTable, DueByBeatCard, SalesBarsCard, NeedsAttentionCard, AlertStrip, QtyStepper, NumberPad, ActionBar).
- src/components/views/DashboardView.tsx: render rewritten; all existing period logic kept (Yesterday / Last month / Custom range stay under "More").
- src/i18n/translations.ts: new keys in English and Odia (strings only).

Step 5 - Sell and Collect
- src/components/views/NewSaleScreen.tsx (the Sell screen that actually renders): quantity stepper restyled (round 44px - / + with the typed-quantity box kept); product-picker footer is now the action bar: item count, total, "GST included" (only when the bill has tax), free-case badge, red-outline Cancel and primary "Review & Finalise" (disabled while the cart is empty). Review does what "Review Cart" did; Done stays as a link; Cancel asks for confirmation, empties the cart and goes back (existing setCart / onBack).
- NewSaleScreen product picker also gets: party card (name, beat, current due in red, Change = close the picker), size chips All / 500 ml / 1 L / 2 L / Soda (view-only filter, sits beside the existing category and pack filters), and on desktop (1024px+) a live "Your bill" panel beside the product grid with line items and total. Uses existing data only (getCustomerLedger, beats, lineItems).
- src/components/views/BillingWorkflow.tsx: my first edits there were reverted to the original (that component is not rendered; BillingView uses NewSaleScreen).
- src/components/views/PaymentsView.tsx (inline "Record receipt" form = Collect screen): party + total due in red, segmented mode switch, large green amount, "Pay full due", number pad (phones/tablets), big green "Save receipt" + WhatsApp note. Search picker, Recent / Due / History / Reports tabs unchanged.
- src/components/common/RecordPaymentModal.tsx: same treatment for the modal version.
Step 6 - other screens
- Teal/green hex classes (#0d4a3a, #0B3D32, #064E3B, #0b4d3a ...) replaced by theme tokens in all source files; dead remap rules removed from mobile-theme.css. No dark-green hex is left in src.
- shell.css: global 44px minimum height for buttons/selects, 2px primary focus ring.

## Checked (headless Chromium, owner login, empty data)
Every menu screen at 390 / 820 / 1280px: no horizontal page scroll, no page errors, no tappable control under 40px (44px target enforced by CSS).

## Checked with seeded demo data (3 parties, 4 products, 5 bills)
Home at 390/820/1280, Sell product picker with items in the cart, large-font mode (A++) on Home, salesman view in Odia at 390/820. No horizontal scroll, no page errors. Large font: amounts shrink instead of breaking mid-number.

## Still open
- Login / landing screen (AuthScreen.tsx, OwnerDemo.tsx, SalesmanDemo.tsx) is NOT restyled: it still uses the dark-green gradient and the "Crate" name.
- Sell: the picker is still a modal opened from "Select Beverages & Crates" (existing flow); the live bill panel shows from 1024px, not on tablet. The existing category and pack filters stay next to the new size chips, so the filter area is taller than in the mockup.
- Owner screens are always English by design (Odia applies to salesman screens only), so owner-side Odia text length could not be tested; the salesman view was checked in Odia.
- Amounts keep the app's two-decimal format (₹3,240.00) rather than the mockup's whole rupees.
- Strings inside the existing Sell/Payments/other screens were already English-only hard-coded text; only the new text goes through t().
- Tables on tablet/desktop and tableCards on phone use the existing components, only recoloured.

## Deviations from the mockups
- Tablet rail label is 12px (spec says both 11px and "minimum 12px").
- Tablet rail has an extra "More" button so Products, Expenses, Crates, Trips and Supplier credits stay reachable.
- Promotions kept in the sidebar/sheet (13 items on desktop, not 12).
- Desktop search box opens Parties; live search would need logic changes.
- No GRN "pending" status exists in the data, so that attention row is replaced by trip discrepancy, expiring lots and unsettled supplier credits.
- Tablet hero/shortcut columns are 1.4fr/1fr instead of a fixed 500px hero, so the shortcut tiles fit at 820px.
- Profit on Home uses useSalesMarginPnl + computeNetProfit (same engine as Reports).

## Known baseline
tests/customerLedger.test.ts fails before and after: data/collections.json is not in the zip.

## Unified page layout and headings (Nov 2026)
- One page title style on every screen (24 / 28 / 30px, weight 700); compact titles inside sticky bars; section titles weight 700.
- All screens (Parties, Products, Sale and Sales history, Payments, Trips, Crates, Inventory, Expenses, Reports, Promotions, Supplier credits, Settings) share the Home page container: same width and gutters, no per-screen max-w caps or beige page boxes.
- Parties and Products lists are 1 / 2 / 3 column grids; customer and supplier detail screens use two columns on desktop; Settings form grids use 3 columns on wide desktops.
- Full-screen add / edit forms keep a centred readable width.
- Code: end of src/shell.css ("Unified page system"), heading tokens in src/index.css and src/mobile-theme.css.

## Payments: choose the invoice, optional number pad, desktop layout (Nov 2026)
- **Collect (Payments) and Record payment dialog:** once a customer is picked, their unpaid invoices are listed ("Invoice #, date, total, paid, due"). Choose one, or keep "Oldest dues first". The amount fills in from the choice.
- A live "This payment will..." preview shows how the amount is split (which invoice is settled in full, part paid with the balance left, anything kept as advance). It uses the same `allocateReceipt` rules as the save, and the save now passes the chosen invoice and customer id to `recordCustomerPayment` (it only passed name + amount before, so a chosen invoice was never honoured from this screen). The success message names the invoice(s).
- Picking another customer resets the invoice and sets the amount to that customer's due (a stale amount used to carry over).
- The on-screen number pad no longer takes space by default on phones and tablets (it appeared together with the device keyboard on tablets). A "Number pad" button turns it on; the device's numeric keyboard is used otherwise.
- Desktop: the Collect card and the Record payment dialog are two columns (party + invoices on the left, amount / mode / date / reference / save on the right).
- Code: `components/common/InvoicePicker.tsx` (new), `PaymentsView.tsx`, `RecordPaymentModal.tsx`, `PartySearchSelect.tsx`.
