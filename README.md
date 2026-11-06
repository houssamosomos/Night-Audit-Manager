# Night Audit Manager Pro

Starter project for a multilingual hotel operations and night-audit application.

## Included
- Responsive web starter (HTML/CSS/JavaScript modules)
- English, French and Arabic language switcher with RTL support
- Local browser storage adapter
- Supabase integration placeholders and SQL starter schema
- Electron desktop shell for Windows
- Module folders for reservations, guests, rooms, cashier, night audit, reports and users

## Run the web app
Run a local static server in this folder, e.g. `python -m http.server 8080`, then open http://localhost:8080.

## Run Electron
Install Node.js LTS, then run `npm install` and `npm start`.

## Supabase
Review `database/schema.sql` and `database/policies.sql` before running them in a NEW Supabase project.
Set the public URL and publishable/anon key in `js/config.js`. Never place a service-role or secret key in frontend code.

This is a starter implementation, not a certified hotel accounting system. Configure authentication, hotel-level isolation, RLS, backups and financial validation before using real guest or payment data.
