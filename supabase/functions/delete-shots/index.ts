// Edge function "delete-shots": Hunt HQ calls this after a screenshot was saved or skipped.
// Deletes the picture from Cloudinary (needs the secret key, so it can only happen here) and removes the pending row.
// Only signed-in, active team members may call it, and only pictures that are in pending_shots can be deleted.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha1Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: u } = await authed.auth.getUser();
    if (!u.user) return json({ error: 'Sign in first.' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: prof } = await admin.from('profiles').select('active').eq('id', u.user.id).maybeSingle();
    if (!prof?.active) return json({ error: 'Not allowed.' }, 403);

    const b = await req.json();
    const ids: string[] = (Array.isArray(b.public_ids) ? b.public_ids : []).map(String).slice(0, 50);
    if (ids.length === 0) return json({ ok: true, deleted: [], failed: [] });
    const { data: rows } = await admin.from('pending_shots').select('public_id').in('public_id', ids);

    const cloud = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? '';
    const key = Deno.env.get('CLOUDINARY_API_KEY') ?? '';
    const secret = Deno.env.get('CLOUDINARY_API_SECRET') ?? '';
    if (!cloud || !key || !secret) return json({ error: 'Cloudinary is not set up on the server.' }, 500);

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const r of rows ?? []) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = await sha1Hex(`public_id=${r.public_id}&timestamp=${timestamp}${secret}`);
      const form = new URLSearchParams({ public_id: r.public_id, timestamp, api_key: key, signature });
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, { method: 'POST', body: form });
      const out = await res.json().catch(() => ({}));
      if (out.result === 'ok' || out.result === 'not found') {
        await admin.from('pending_shots').delete().eq('public_id', r.public_id);
        deleted.push(r.public_id);
      } else {
        failed.push(r.public_id); // keep the row so it can be tried again
      }
    }
    return json({ ok: failed.length === 0, deleted, failed });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
