import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://houssamosomos.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    // Supabase hosted Edge Functions inject named keys as JSON objects.
    // Keep singular and legacy fallbacks for local/older deployments.
    const readDefaultKey = (pluralName: string): string | undefined => {
      const raw = Deno.env.get(pluralName);
      if (!raw) return undefined;
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed?.default === "string" ? parsed.default : undefined;
      } catch {
        return undefined;
      }
    };

    const anonKey =
      readDefaultKey("SUPABASE_PUBLISHABLE_KEYS") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY");

    const secretKey =
      readDefaultKey("SUPABASE_SECRET_KEYS") ||
      Deno.env.get("SUPABASE_SECRET_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !secretKey) {
      console.error("Missing Edge Function environment:", {
        supabaseUrl: Boolean(supabaseUrl),
        anonKey: Boolean(anonKey),
        secretKey: Boolean(secretKey)
      });
      return json({ error: "Server configuration is incomplete. Check Supabase Edge Function key configuration." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Authentication required." }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "Invalid session." }, 401);

    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: profile, error: profileError } = await adminClient
      .from("app_profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return json({ error: "Admin permission required." }, 403);
    }

    const body = await req.json();
    if (body.action === "list") {
      const [{ data: usersData, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
        adminClient.auth.admin.listUsers({ page: 1, perPage: 200 }),
        adminClient.from("app_profiles").select("user_id, full_name, role")
      ]);
      if (usersError) return json({ error: usersError.message }, 400);
      if (profilesError) return json({ error: profilesError.message }, 400);

      const profileById = new Map((profiles || []).map((p) => [p.user_id, p]));
      const users = (usersData.users || []).map((u) => {
        const p = profileById.get(u.id);
        return {
          id: u.id,
          email: u.email || "",
          full_name: p?.full_name || u.user_metadata?.full_name || "",
          role: p?.role || "user"
        };
      });
      return json({ users });
    }

    if (body.action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || "").trim().slice(0, 80);
      const redirectTo = String(body.redirectTo || "https://houssamosomos.github.io/Night-Audit-Manager/");

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName) {
        return json({ error: "A valid email and full name are required." }, 400);
      }
      if (!redirectTo.startsWith("https://houssamosomos.github.io/Night-Audit-Manager/")) {
        return json({ error: "Invalid redirect URL." }, 400);
      }

      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo
      });
      if (inviteError) return json({ error: inviteError.message }, 400);

      const { error: saveProfileError } = await adminClient
        .from("app_profiles")
        .upsert({
          user_id: inviteData.user.id,
          full_name: fullName,
          role: "user"
        }, { onConflict: "user_id" });

      if (saveProfileError) return json({ error: "Invitation sent, but profile creation failed: " + saveProfileError.message }, 500);
      return json({ message: "تم إرسال دعوة التسجيل إلى البريد الإلكتروني بنجاح." });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
