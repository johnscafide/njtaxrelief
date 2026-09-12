import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const CANONICAL_SITE = 'https://www.watchdogindex.com';
const HOSTS = new Set(['watchdogindex.com','www.watchdogindex.com','njpropertytaxrelief.com','www.njpropertytaxrelief.com']);
const ALLOWED_AMOUNTS = new Set([500,1000,2500,5000,10000]);

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  try {
    const u = new URL(origin);
    if (HOSTS.has(u.hostname.toLowerCase()) || u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.vercel.app')) return origin;
  } catch (_) {}
  return CANONICAL_SITE;
}
function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {...cors(req), 'Content-Type':'application/json', 'Cache-Control':'no-store'}});
}
function siteFor(req: Request) {
  try {
    const u = new URL(req.headers.get('origin') || '');
    if (HOSTS.has(u.hostname.toLowerCase())) return ['watchdogindex.com','www.watchdogindex.com'].includes(u.hostname.toLowerCase()) ? CANONICAL_SITE : `${u.protocol}//${u.host}`;
  } catch (_) {}
  return CANONICAL_SITE;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:cors(req)});
  if (req.method !== 'POST') return json(req,{error:'Method not allowed'},405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req,{error:'Sign in required',code:'SIGN_IN_REQUIRED'},401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim();
  if (!stripeKey) return json(req,{error:'Support checkout is not configured.',code:'STRIPE_NOT_CONFIGURED'},503);

  const userClient = createClient(supabaseUrl, anonKey, {global:{headers:{Authorization:auth}}});
  const admin = createClient(supabaseUrl, serviceKey);
  const {data:{user},error:userError} = await userClient.auth.getUser();
  if (userError || !user) return json(req,{error:'Sign in required',code:'SIGN_IN_REQUIRED'},401);

  const body = await req.json().catch(()=>({}));
  const amount = Number(body?.amount_cents || 0);
  const applicationId = String(body?.application_id || '').trim();
  if (!ALLOWED_AMOUNTS.has(amount)) return json(req,{error:'Choose a supported one-time amount.',code:'INVALID_SUPPORT_AMOUNT'},400);
  if (applicationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) return json(req,{error:'Invalid application reference.',code:'INVALID_APPLICATION_ID'},400);

  const {data:isTest} = await admin.rpc('is_watchdog_test_account',{p_user_id:user.id});
  if (isTest) return json(req,{error:'Watchdog test accounts cannot create real charges.',code:'WATCHDOG_TEST_NO_REAL_SPEND'},403);

  const stripe = new Stripe(stripeKey,{apiVersion:'2026-06-24.dahlia'});
  const site = siteFor(req);
  const appPath = site === CANONICAL_SITE ? '/anchor/application/2025/' : '/property/anchor/application/2025/';
  const metadata = {
    supabase_user_id:user.id,
    watchdog_user_id:user.id,
    product:'watchdog_optional_support',
    application_id:applicationId || '',
    access_dependency:'none'
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      line_items:[{
        price_data:{
          currency:'usd',
          unit_amount:amount,
          product_data:{name:'Support Watchdog',description:'Optional one-time support for Watchdog free New Jersey property-tax relief tools.'}
        },
        quantity:1
      }],
      ...(user.email ? {customer_email:user.email} : {}),
      client_reference_id:user.id,
      metadata,
      payment_intent_data:{metadata},
      success_url:`${site}${appPath}?support=thanks`,
      cancel_url:`${site}${appPath}?support=cancelled`,
      billing_address_collection:'auto',
      integration_identifier:'watchdog_web_kqrmxpta'
    });

    await admin.from('access_audit_log').insert({
      user_id:user.id,
      event_type:'billing.optional_support_checkout_created',
      resource_type:'checkout_session',
      resource_id:session.id,
      required_plan:'standard',
      allowed:true,
      metadata:{provider:'stripe',product:'watchdog_optional_support',amount_cents:amount,application_id:applicationId||null,access_dependency:'none',stripe_mode:session.livemode?'live':'test'}
    });

    return json(req,{provider:'stripe',product:'watchdog_optional_support',destination:'checkout',url:session.url,session_id:session.id,amount_cents:amount,stripe_mode:session.livemode?'live':'test'});
  } catch (error) {
    console.error('STRIPE_SUPPORT_CHECKOUT_ERROR',error);
    return json(req,{error:'Could not create support checkout.',code:'STRIPE_SUPPORT_CHECKOUT_ERROR'},502);
  }
});