# Odia Language Support (i18n)

## What was added

1. **Language system** (`src/i18n/`)
   - `translations.ts` — English + Odia dictionaries
   - `LanguageContext.tsx` — React context, `useLanguage()` hook, localStorage persistence
   - Language is stored as `mrwater_app_language` (`en` | `or`)

2. **Settings → Display → App Language**
   - Switch between **English** and **ଓଡ଼ିଆ (Odia)**
   - Takes effect immediately across the app

3. **Translated areas (first pass)**
   - Settings section tabs + Display screen
   - Mobile bottom nav + desktop sidebar menu
   - Salesman sell workflow (main labels, cart, vehicle, customer search, voice prompts)
   - Salesman home / van stock tab labels

4. **Fonts**
   - Noto Sans Oriya loaded for correct Odia glyph rendering
   - CSS prefers Odia font when `html[lang="or"]`

## How to use in any component

```tsx
import { useLanguage } from '../i18n/LanguageContext';
// or from '../i18n'

function MyComponent() {
  const { t, language, setLanguage, isOdia } = useLanguage();
  return <button>{t('nav.sell')}</button>;
}
```

Interpolation:

```tsx
t('salesman.noShopFound', { query: searchText })
```

## Adding more Odia text

1. Add the key to **both** `en` and `or` objects in `src/i18n/translations.ts`
2. Replace hardcoded English in the component with `t('your.key')`
3. Prefer keys like `salesman.*`, `nav.*`, `common.*`, `settings.*`

## Still in English (next steps)

- AuthScreen full copy
- Reports titles & column headers
- Invoice PDF (needs Odia-capable font embedded in jsPDF)
- Product / customer **data** (names) — users can already type Odia; optional `name_or` fields later
- Voice recognition (browser Odia support is limited)

## Testing

1. Open **Settings → Display**
2. Tap **ଓଡ଼ିଆ (Odia)**
3. Check bottom nav, salesman sell screen, settings tabs
4. Refresh — language should stay Odia


## Data fields (Odia names)

- `Product.nameOr` — optional Odia product name
- `Customer.nameOr` / `ExistingCustomer.nameOr` — optional Odia shop/customer name
- Forms: Products → Name (Odia), Customers / Add Customer → Name in Odia
- `displayName(entity, language)` in `src/utils/displayName.ts` picks Odia name when language is `or`
- Search includes both English and Odia names

## Voice search

When language is **Odia**, voice/mic buttons are **hidden** on:
- Salesman sell workflow (customer + product voice)
- Salesman cart modal & sheet
- Customer selector / quick select
- Add customer modal (name & phone mic)

English mode keeps voice search as before.


## Update: salesman-only Odia, sound-alike names

- **Only the salesman login can use Odia.** `LanguageProvider` now sits inside `LedgerProvider` and forces English for the owner/admin and the login screen. The language toggle lives only in the salesman view.
- **Names are written in Odia, not translated.** `src/utils/odiaTransliterate.ts` writes any English product/customer name in Odia script (Purple → ପର୍ପଲ୍, Gold → ଗୋଲ୍ଡ, Sharma Stores → ଶର୍ମା ଷ୍ଟୋର୍ସ). Add brand words to the `WORDS` list there to fix a spelling. A saved `nameOr` always wins. The web translator (which gave "Bengal" for Purple) is removed.
- **English + Odia are shown together** for products and customers (`<OdiaName />`) in sale, cart, van stock, bills, trips, load sheet, return and customer-due screens.
- **Fixed screen text** (Sale, Payment, Trips, Stock, buttons, hints) is translated by `src/i18n/domTranslate.ts` using `src/i18n/odiaPhrases.ts`. To translate another text, add the exact English text and its Odia to `PHRASES_OR`.
- The owner "Translate all to Odia" buttons were removed.
