// Edge function "ingest-shot": the Android capture app calls this after uploading a screenshot to Cloudinary.
// It has no login, so it is protected by a secret token (INGEST_TOKEN). Deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-ingest-token, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const expected = Deno.env.get('INGEST_TOKEN') ?? '';
    const given = req.headers.get('x-ingest-token') ?? '';
    if (!expected || !sameText(given, expected)) return json({ error: 'Wrong token.' }, 401);

    const b = await req.json();
    const publicId = String(b.public_id ?? '').trim();
    const url = String(b.url ?? '').trim();
    const cloud = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? '';
    if (!publicId || !url) return json({ error: 'public_id and url are required.' }, 400);
    // Only accept pictures that really are in our own Cloudinary.
    if (!url.startsWith(`https://res.cloudinary.com/${cloud}/`)) return json({ error: 'That is not a picture from our Cloudinary.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin.from('pending_shots').upsert({ public_id: publicId, url }, { onConflict: 'public_id', ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
