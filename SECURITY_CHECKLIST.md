# Security checklist
- Never commit `.env` files or service-role/secret keys.
- Enable Row Level Security on every table containing hotel data.
- Enforce roles and hotel isolation in database/server policies, not only in the UI.
- Use Supabase Auth and server-side Edge Functions for admin invitations.
- Back up data and test restore procedures.
- Test all financial calculations with sample data before production use.
