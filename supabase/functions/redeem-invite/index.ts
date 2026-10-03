// Edge function "redeem-invite": turns a valid one-time invite code into a new account.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    const code = String(b.code ?? '').trim().toUpperCase();
    const email = String(b.email ?? '').trim().toLowerCase();
    const username = String(b.username ?? '').trim().slice(0, 24);
    const password = String(b.password ?? '');
    if (!code || !email) return json({ error: 'Enter your invite code and email.' }, 400);
    if (password.length < 8) return json({ error: 'Use a password with at least 8 characters.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Claim the code atomically so it can only ever be used once.
    const { data: claimed } = await admin.from('invites').update({ used_at: new Date().toISOString() })
      .eq('code', code).is('used_at', null).gt('expires_at', new Date().toISOString()).select('code').maybeSingle();
    if (!claimed) return json({ error: 'That invite code is invalid, already used, or expired.' }, 400);

    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
    if (error) {
      await admin.from('invites').update({ used_at: null }).eq('code', code); // give the code back
      const taken = /already|registered|exists/i.test(error.message);
      return json({ error: taken ? 'An account with that email already exists. Sign in instead.' : error.message }, 400);
    }
    await admin.from('invites').update({ used_by: data.user.id }).eq('code', code);
    await admin.from('profiles').update({ active: true }).eq('id', data.user.id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
