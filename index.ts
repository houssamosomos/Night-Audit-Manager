// =============================================================================
// admin-users  -  Supabase Edge Function (Deno)
// -----------------------------------------------------------------------------
// Privileged user-management operations (create/invite, activate/deactivate,
// role changes). This is the ONLY place the SERVICE-ROLE key is ever used, and
// it lives exclusively in server-side function secrets - never in the browser.
//
// Security model:
//   1. The caller must send a valid user JWT (Authorization: Bearer <token>).
//   2. We resolve that user and verify they are an active hotel_admin or
//      super_admin for the SAME hotel they are operating on.
//   3. Only then do we use the service-role client for the privileged action.
//
// Deploy:
//   supabase functions deploy admin-users
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=...
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN_ROLES = ['super_admin', 'hotel_admin'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'missing_token' }, 401);

  // Client bound to the caller's token - used only to identify the caller.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'invalid_token' }, 401);

  // Service-role client for privileged reads/writes.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await admin
    .from('users')
    .select('id, role, hotel_id, is_active')
    .eq('id', userData.user.id)
    .single();

  if (!profile || !profile.is_active || !ADMIN_ROLES.includes(profile.role)) {
    return json({ error: 'forbidden' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const action = String(payload.action ?? '');

  // Hotel-level isolation: a hotel_admin can only touch their own hotel.
  const targetHotel = String(payload.hotel_id ?? profile.hotel_id);
  if (profile.role !== 'super_admin' && targetHotel !== profile.hotel_id) {
    return json({ error: 'cross_hotel_denied' }, 403);
  }

  try {
    switch (action) {
      case 'invite': {
        const email = String(payload.email ?? '').trim().toLowerCase();
        if (!email) return json({ error: 'email_required' }, 400);
        // Invite by email - Supabase sends the invitation + sets no password.
        const { data: invite, error: inviteErr } =
          await admin.auth.admin.inviteUserByEmail(email);
        if (inviteErr) return json({ error: inviteErr.message }, 400);
        const newId = invite.user?.id;
        const { error: profErr } = await admin.from('users').upsert({
          id: newId,
          email,
          full_name: String(payload.full_name ?? ''),
          role: String(payload.role ?? 'receptionist'),
          hotel_id: targetHotel,
          is_active: payload.is_active !== false,
        });
        if (profErr) return json({ error: profErr.message }, 400);
        await admin.from('audit_logs').insert({
          user_id: profile.id, action: 'user_invite', entity: 'users',
          entity_id: newId, hotel_id: targetHotel, details: { email },
        });
        return json({ ok: true, id: newId });
      }

      case 'set_active': {
        const uid = String(payload.user_id ?? '');
        const isActive = payload.is_active !== false;
        if (!uid) return json({ error: 'user_id_required' }, 400);
        const { error } = await admin.from('users')
          .update({ is_active: isActive }).eq('id', uid).eq('hotel_id', targetHotel);
        if (error) return json({ error: error.message }, 400);
        // Also block/unblock the auth account.
        await admin.auth.admin.updateUserById(uid, {
          ban_duration: isActive ? 'none' : '876000h',
        });
        await admin.from('audit_logs').insert({
          user_id: profile.id, action: isActive ? 'user_activate' : 'user_deactivate',
          entity: 'users', entity_id: uid, hotel_id: targetHotel,
        });
        return json({ ok: true });
      }

      case 'set_role': {
        const uid = String(payload.user_id ?? '');
        const role = String(payload.role ?? '');
        if (!uid || !role) return json({ error: 'user_id_and_role_required' }, 400);
        const { error } = await admin.from('users')
          .update({ role }).eq('id', uid).eq('hotel_id', targetHotel);
        if (error) return json({ error: error.message }, 400);
        await admin.from('audit_logs').insert({
          user_id: profile.id, action: 'user_role_change', entity: 'users',
          entity_id: uid, hotel_id: targetHotel, details: { role },
        });
        return json({ ok: true });
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
