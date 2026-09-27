import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import Stripe from 'npm:stripe@^22';

type Tier='agent'|'pro'|'pro_plus';
const OFFERS:Record<Tier,{amount:number;capacity:number}>={agent:{amount:149900,capacity:25},pro:{amount:349900,capacity:250},pro_plus:{amount:999900,capacity:2500}};
function tierOf(v:unknown):Tier|null{const x=String(v||'').trim().toLowerCase();if(x==='pro+')return'pro_plus';return x==='agent'||x==='pro'||x==='pro_plus'?x as Tier:null;}
function cors(req:Request){const origin=req.headers.get('origin')||'https://www.watchdogindex.com';return{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store'}});}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST')return json(req,{error:'Method not allowed'},405);
  const auth=req.headers.get('Authorization');
  if(!auth)return json(req,{error:'Sign in required',code:'SIGN_IN_REQUIRED'},401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,serviceKey);
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return json(req,{error:'Sign in required',code:'SIGN_IN_REQUIRED'},401);
  const body=await req.json().catch(()=>({}));
  const sessionId=String(body?.session_id||'').trim();
  if(!/^cs_(test|live)_/.test(sessionId))return json(req,{error:'Valid checkout session required.',code:'INVALID_SESSION'},400);
  const stripeKey=String(Deno.env.get('STRIPE_SECRET_KEY')||'').trim();
  if(!stripeKey)return json(req,{error:'Billing verification is unavailable.',code:'STRIPE_NOT_CONFIGURED'},503);
  const stripe=new Stripe(stripeKey,{apiVersion:'2026-06-24.dahlia'});
  let session:Stripe.Checkout.Session;
  try{session=await stripe.checkout.sessions.retrieve(sessionId,{expand:['payment_intent','customer']});}catch(error){console.error('LIFETIME_SESSION_LOOKUP_ERROR',error);return json(req,{error:'Could not verify that checkout session.',code:'SESSION_LOOKUP_FAILED'},502);}
  const meta=session.metadata||{};
  const tier=tierOf(meta.billing_tier||meta.plan_tier);
  if(meta.product!=='watchdog_lifetime'||!tier)return json(req,{error:'This is not a Watchdog lifetime purchase.',code:'NOT_LIFETIME_CHECKOUT'},400);
  if((meta.supabase_user_id||meta.watchdog_user_id)!==user.id||session.client_reference_id!==user.id)return json(req,{error:'That checkout session belongs to a different account.',code:'SESSION_USER_MISMATCH'},403);
  const offer=OFFERS[tier];
  if(session.mode!=='payment'||session.payment_status!=='paid'||session.currency!=='usd'||Number(session.amount_total||0)!==offer.amount)return json(req,{error:'Payment is not verified as complete.',code:'PAYMENT_NOT_VERIFIED'},409);
  const paymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null;
  const customerId=typeof session.customer==='string'?session.customer:session.customer?.id||null;
  if(!paymentIntentId||!customerId)return json(req,{error:'Stripe did not return complete payment records.',code:'PAYMENT_RECORD_INCOMPLETE'},409);

  const existingPurchase=await admin.from('billing_lifetime_purchases').select('*').eq('checkout_session_id',session.id).maybeSingle();
  if(existingPurchase.error)return json(req,{error:'Could not read lifetime purchase record.',code:'LIFETIME_LEDGER_READ_FAILED'},500);
  if(existingPurchase.data?.status==='refunded')return json(req,{error:'This lifetime purchase was refunded and cannot be reactivated.',code:'LIFETIME_PURCHASE_REFUNDED'},409);
  if(existingPurchase.data?.status==='paid'){
    const current=await admin.from('account_entitlements').select('plan_tier,billing_interval,subscription_status,source,provider_price_id').eq('user_id',user.id).maybeSingle();
    if(current.error)return json(req,{error:'Could not read current access.',code:'ENTITLEMENT_READ_FAILED'},500);
    const activeSame=current.data?.billing_interval==='lifetime'&&current.data?.subscription_status==='active'&&current.data?.provider_price_id===`lifetime:${session.id}`;
    return json(req,{ok:true,already_claimed:true,active:activeSame,tier,billing_interval:'lifetime'});
  }

  const entitlement=await admin.from('account_entitlements').select('provider_subscription_id,subscription_status,billing_interval,source').eq('user_id',user.id).maybeSingle();
  if(entitlement.error)return json(req,{error:'Could not read billing state.',code:'ENTITLEMENT_READ_FAILED'},500);
  if(entitlement.data?.provider_subscription_id&&['active','trialing','past_due','paused'].includes(entitlement.data?.subscription_status||''))return json(req,{error:'This account now has an active subscription. Contact Watchdog before applying a lifetime purchase.',code:'ACTIVE_SUBSCRIPTION_EXISTS'},409);

  const ledger=await admin.from('billing_lifetime_purchases').insert({checkout_session_id:session.id,user_id:user.id,payment_intent_id:paymentIntentId,stripe_customer_id:customerId,tier,amount_cents:offer.amount,currency:'usd',status:'paid',purchased_at:new Date((session.created||Math.floor(Date.now()/1000))*1000).toISOString(),metadata:{founding_offer:'2026_soft_launch_v1',payment_status:session.payment_status}}).select('checkout_session_id').single();
  if(ledger.error){console.error('LIFETIME_LEDGER_INSERT_ERROR',ledger.error);return json(req,{error:'Payment was verified but could not be recorded safely. Contact Watchdog support.',code:'LIFETIME_LEDGER_WRITE_FAILED'},500);}

  const upsert=await admin.from('account_entitlements').upsert({user_id:user.id,plan_tier:tier,billing_tier:tier,billing_interval:'lifetime',property_capacity:offer.capacity,subscription_status:'active',provider:'stripe',provider_customer_id:customerId,provider_subscription_id:null,provider_price_id:`lifetime:${session.id}`,current_period_end:null,cancel_at_period_end:false,provider_event_at:new Date().toISOString(),source:'stripe-lifetime',updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(upsert.error){await admin.from('billing_lifetime_purchases').delete().eq('checkout_session_id',session.id);console.error('LIFETIME_ENTITLEMENT_WRITE_ERROR',upsert.error);return json(req,{error:'Payment was verified but access could not be applied safely. Contact Watchdog support.',code:'LIFETIME_ENTITLEMENT_WRITE_FAILED'},500);}

  await admin.from('access_audit_log').insert({user_id:user.id,event_type:'billing.lifetime_entitlement_granted',resource_type:'checkout_session',resource_id:session.id,required_plan:tier,allowed:true,metadata:{provider:'stripe',billing_tier:tier,billing_interval:'lifetime',amount_cents:offer.amount,payment_intent_id:paymentIntentId,property_capacity:offer.capacity,founding_offer:'2026_soft_launch_v1'}});
  return json(req,{ok:true,active:true,tier,billing_interval:'lifetime',property_capacity:offer.capacity,amount_cents:offer.amount});
});
