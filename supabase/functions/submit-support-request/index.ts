import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const categories = new Set(['account', 'access', 'data', 'technical', 'billing', 'other']);
const priorities = new Set(['normal', 'high']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Support service unavailable' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Sign in required' }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const category = String(input.category || 'other').trim().toLowerCase();
  const priority = String(input.priority || 'normal').trim().toLowerCase();
  const subject = String(input.subject || '').trim().slice(0, 140);
  const message = String(input.message || '').trim().slice(0, 5000);

  if (!categories.has(category)) return json({ error: 'Invalid support category' }, 400);
  if (!priorities.has(priority)) return json({ error: 'Invalid support priority' }, 400);
  if (subject.length < 4 || message.length < 10) return json({ error: 'Please include a subject and enough detail to investigate' }, 400);

  const { data, error } = await admin.from('support_requests').insert({
    user_id: user.id,
    category,
    priority,
    subject,
    message,
    status: 'open',
  }).select('id,status,created_at').single();

  if (error) {
    console.error('support_request_insert_failed', { code: error.code, user_id: user.id });
    return json({ error: 'Support request could not be submitted' }, 500);
  }

  return json({ request: data }, 201);
});
