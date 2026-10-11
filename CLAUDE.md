# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Candle Heaven** — an e-commerce site for a Sri Lankan candle-making-supplies business
(wax, fragrances, wicks, dyes, molds, tools, kits). Single Vite SPA containing both the
customer shop and a full admin/back-office portal. Currency is LKR; delivery is via the
Curfox / Royal Express courier API.

Brand colors: navy `#132040`, gold `#C9A96E` (see `src/theme/theme.ts`).

## Commands

```bash
npm install          # .npmrc pins legacy-peer-deps=true — needed, don't drop it
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build  (currently passes)
npm run lint         # eslint . — currently reports 5 pre-existing errors (unused `_` vars)
npm run preview

# Firebase side (from repo root)
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions          # builds from functions/ (separate package.json)
```

Frontend deploys to Vercel (`vercel.json` rewrites everything to `index.html` for SPA routing).
`api/notify.ts` is a Vercel serverless function, not part of the Vite build.

Maintenance scripts in `scripts/*.mjs` are one-off Node scripts run manually; each takes a
Firebase **service-account JSON path** as argv[1] and most support `--dry-run`.
`set-admin-claim.mjs` is how admin access is granted.

## Architecture

### Dual-mode data layer (the single most important thing to know)

Every service in `src/services/` branches on:

```ts
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;
```

- **Mock mode** — all reads/writes go to `localStorage`, seeded from `src/services/mockData.ts`.
  `src/services/firebase.ts` skips `initializeApp` entirely when no project id is present and
  exports `db`/`auth`/`storage` as `null` cast to their types — so touching Firebase in mock
  mode throws at runtime, not at import.
- **Firebase mode** — real Firestore/Auth/Storage.

When adding a service function, implement **both** branches. Mock product data is version-gated:
bump `MOCK_VERSION` (kept in sync between `services/admin.ts` and `services/products.ts`) whenever
the mock schema changes, or stale `localStorage` caches will break.

### Routing (`src/App.tsx`)

Two completely separate layouts in one `<Routes>` tree:
- `/admin/*` → `AdminLayout` (navy sidebar, no customer chrome). `/admin/login` sits outside it.
- everything else → `CustomerLayout` (Header, Footer, CartDrawer, WhatsAppButton) and records a
  site visit on mount.

Order tracking is public and reachable at four aliases: `/track`, `/track/:orderNumber`,
`/tracking`, `/tracking/:orderNumber`.

### Auth — two independent contexts

- `AuthContext` — customer Firebase Auth session (mock mode syncs via a `ch-mock-auth-change`
  window event).
- `AdminAuthContext` — admin session. Admin is **the Firebase custom claim `admin === true`**,
  checked both client-side and in `firestore.rules`. Mock-mode credentials are hardcoded
  (`admin@candleheaven.lk` / `admin123`). `initializing` must be respected before rendering
  protected routes, or admins get bounced to login on refresh.

### Order numbers

`src/services/orderNumber.ts`. Format `CH-YY-XXXX`. A Firestore transaction increments
`counters/orders_{year}`, then the sequence is passed through a bijective affine shuffle
(mod 36⁴) so order numbers don't leak volume. `firestore.rules` enforces that the counter can
only ever move by exactly +1 — don't write to `counters/*` any other way.

### Stock & pricing model

Stock is always stored in **base units** (g, ml, or piece). Products come in three shapes:

1. **Simple** — `price` + `unit`, stock in natural units.
2. **Tiered** — `priceTiers[]` (e.g. `250g`, `500g`, `1 kg+` with `isBulk` for open-ended).
   A `CartItem` carries `tierBase` (base units per tier unit); stock deltas are
   `quantity × tierBase`.
3. **Starter packs** — `isStarterPack` with `packType: 'fixed' | 'selectable'`.
   Stock is deducted from `packComponents`, never from the pack product itself.

`CartItem.cartKey` (not `productId`) is the line-item identity — one product can appear as
several lines at different tiers. Always key cart operations on `cartKey`.

Stock is committed only while an order is in a `STOCK_ACTIVE` status
(`confirmed | shipped | delivered`, see `src/services/admin.ts`). Transitions in and out of that
set deduct and restore stock; a `returned` transition can write off damaged quantities instead of
restocking them.

> Note: in `adminUpdateOrderStatus`, the stock reconciliation currently lives inside the
> `if (USE_MOCK)` branch — the Firestore path only writes `status` + `statusHistory`. Check this
> before assuming stock self-corrects in production.

### Firestore collections

`products`, `orders`, `purchases`, `suppliers`, `settlements`, `promotions`, `loyalty/{uid}`,
`counters/orders_{year}`, `analytics/siteVisits`. Access rules are in `firestore.rules` and worth
reading before adding a query — notably `orders` allows an unauthenticated `list` **only** when
`request.query.limit <= 1` (that's what makes public tracking work without dumping the collection).
The one composite index is `orders (userId ASC, createdAt DESC)`.

**Not in Firestore despite the rules file mentioning them:** `promotions` and delivery settings are
read/written purely from `localStorage` (`src/services/promotions.ts`, `src/services/delivery.ts`),
so they are per-browser, not shared. Don't assume a promo configured on one device exists on another.

### External integrations

- **Curfox / Royal Express** (`src/services/courier.ts`, `src/services/cities.ts`) — tracking,
  single-order creation, pickup tickets. Called **directly from the browser** with
  `VITE_CURFOX_TOKEN`, which means the token ships in the bundle. Merchant/pickup ids are
  hardcoded constants in `courier.ts`.
- **text.lk SMS on new order** — implemented *twice*: a Firebase trigger
  (`functions/src/index.ts`, fires on `orders` create where `source === 'web'`) and a Vercel route
  (`api/notify.ts`, called explicitly by `placeOrder`). Both send to the same hardcoded number.
  If you touch order notifications, check which one is actually deployed before adding a third.

### Money / profit tracking

Purchases feed a weighted-average cost (`Product.averageCost`, per base unit) used by the profit
analytics in `services/admin.ts`. Orders track payment separately from fulfillment:
`paymentStatus` + `paymentInfo`, reconciled against `Settlement` records (cash/bank batches, or
courier invoices that orders get assigned to).

## Conventions

- MUI v9 + Emotion, `sx` props throughout, no CSS modules. `@wso2/oxygen-ui` is in
  `package.json` but **not imported anywhere** — ignore it; use plain `@mui/material`.
- MUI v9 API: `slotProps` (not `inputProps` / `PaperProps` / `secondaryTypographyProps`),
  Grid `size` prop. Older patterns in git history have already been migrated.
- Pages are large and self-contained — page-level state and data fetching live in the page
  component; `src/services/` holds all I/O; `src/components/` is small and shared.
- Types live in one place: `src/types/index.ts`. The inline comments there document units and
  semantics — read them before changing a field.
- `tsconfig.app.json` is strict with `noUnusedLocals` / `noUnusedParameters`.
- Admin service functions are prefixed `admin*`; customer-facing ones are not.

## Environment

`.env` is gitignored; `.env.example` lists the Firebase vars. Also used but not in the example
file: `VITE_USE_MOCK` and `VITE_CURFOX_TOKEN`. Server-side secrets: `TEXTLK_TOKEN` (Vercel env var
and a Firebase Functions secret).
