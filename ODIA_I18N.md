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
