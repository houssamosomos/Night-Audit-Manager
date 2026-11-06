# Night Audit Manager Pro

A professional, production-oriented **hotel management & night audit** system for
real reception, cashier, accounting and night-audit operations.

Built as a **web app** and a **Windows desktop app** (Electron), with a hybrid
**offline-first + cloud-sync** architecture. Modern, responsive, multilingual
(English / French / Arabic with full RTL), secure role-based access.

---

## Tech stack

| Layer            | Technology                                             |
|------------------|--------------------------------------------------------|
| UI               | React 18 + TypeScript, Tailwind CSS, Recharts          |
| Routing / i18n   | React Router, i18next (en / fr / ar, RTL-aware)        |
| Local storage    | IndexedDB (via `idb`) — fully offline capable          |
| Cloud / Auth     | Supabase (PostgreSQL + Auth + Edge Functions)          |
| Desktop          | Electron (NSIS Windows installer via electron-builder) |
| Build            | Vite                                                   |

---

## Features

- **Dashboard** – live KPIs (rooms, arrivals/departures, revenue, cash, occupancy,
  pending payments, business date, audit status) + interactive charts.
- **Reservations** – create / edit / cancel, check-in / check-out, room assignment,
  rates, taxes, extra charges, payment status, booking source, search & history.
- **Guests** – full guest database, profiles, previous stays, outstanding balances.
- **Rooms** – room list + interactive **room map** with colour-coded statuses
  (available / occupied / reserved / dirty / clean / out-of-order / maintenance),
  housekeeping and maintenance handling.
- **Cashier** – multi-method payments, deposits, refunds, charges, discounts,
  register open/close, shift reconciliation, payment history, printable receipts.
  Multi-currency, **MAD** default.
- **Night Audit** – guided 11-step workflow with validation, warnings,
  per-step verification, duplicate-close prevention, audit history, and a
  printable / PDF night-audit report.
- **Reports** – daily/monthly revenue, occupancy, arrivals & departures, guest
  stats, cashier, payments, night audit, outstanding balances, room performance.
  Export to **PDF / Excel / CSV** and print, with date filters.
- **Users** – roles, invitations, activation/deactivation, login activity,
  audit logs. Privileged operations run through a secure Edge Function.
- **Settings** – hotel profile, logo, currency, tax, check-in/out times, room
  categories, payment methods, language & theme.
- **Hybrid sync** – works offline, syncs to Supabase on reconnect, shows sync
  status; financial records and closed night audits are never overwritten
  silently.

---

## Project structure

```
night-audit-manager-pro/
├─ electron/              # Electron main + preload (desktop shell)
├─ src/
│  ├─ components/         # Layout, UI primitives, language switcher, sync badge
│  ├─ context/           # Auth + Theme providers
│  ├─ i18n/              # en.json / fr.json / ar.json + i18next setup
│  ├─ lib/               # db (IndexedDB), supabase, sync, admin, metrics,
│  │                     #   format, report (PDF/CSV/XLS), seed, types, hooks
│  ├─ pages/             # Dashboard, Reservations, Guests, Rooms, Cashier,
│  │                     #   NightAudit, Reports, Users, Settings, Login
│  └─ App.tsx, main.tsx
├─ supabase/
│  ├─ migrations/        # 0001_init.sql (schema+RLS), 0002_user_roles.sql
│  └─ functions/
│     └─ admin-users/    # Edge Function for privileged user management
├─ .env.example
├─ README.md  /  SECURITY.md
└─ package.json, vite/tsconfig/tailwind configs
```

---

## Requirements

- **Node.js 18+** (Vite 5 requires Node 18 or newer) and npm 9+.
- A Supabase project (optional — the app runs fully offline in demo mode).

## Quick start (web, demo / offline mode)

```bash
npm install
cp .env.example .env          # VITE_OFFLINE_DEMO=true by default
npm run dev                   # http://localhost:5173
```

In demo mode the app seeds realistic sample data into IndexedDB and runs with
no backend. Sign in with **any email** to explore every module.

## Connect to Supabase (cloud mode)

1. Create a project at <https://supabase.com>.
2. Run the migrations (Supabase SQL editor or CLI):
   ```bash
   supabase db push          # or paste supabase/migrations/*.sql in order
   ```
3. Deploy the admin Edge Function and set its server-side secrets:
   ```bash
   supabase functions deploy admin-users
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=... SUPABASE_ANON_KEY=...
   ```
4. Fill `.env`:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<public-anon-key>
   VITE_OFFLINE_DEMO=false
   ```
5. `npm run dev`.

> The **service-role key is never placed in the frontend `.env`**. It lives only
> in Edge Function secrets. See `SECURITY.md`.

## Build

```bash
npm run build       # type-check + production web build -> dist/
npm run preview     # preview the production build
```

## Windows desktop (Electron)

```bash
npm run electron:dev      # run the desktop shell against the dev server
npm run electron:build    # build web app + package NSIS installer -> release/
```

---

## Multilingual & RTL

Every label, button, notification and report is translated in
`src/i18n/{en,fr,ar}.json`. The language switcher is available on every screen
and the choice is persisted. Selecting Arabic switches the whole layout to RTL
(`dir="rtl"`); English and French are LTR.

## Roles

Super Admin · Hotel Admin · Manager · Receptionist · Night Auditor · Accountant.
Access is enforced client-side (route/action guards) **and** server-side
(PostgreSQL Row Level Security + Edge Function role checks).

## Data integrity

- Financial totals are computed by pure, deterministic functions
  (`src/lib/format.ts`, `src/lib/metrics.ts`) — no fake numbers.
- A closed business date is unique per hotel (`unique(hotel_id, business_date)`)
  and closed night audits are immutable (RLS blocks UPDATE/DELETE and sync never
  overwrites them).
- Every mutating action is written to `audit_logs` with the acting user id.

## License

MIT.
