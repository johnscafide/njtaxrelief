import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import Stripe from 'npm:stripe@^22';

const ALLOWED_ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com']);
function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ALLOWED_ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};}
function reply(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}
function enabled(){return String(Deno.env.get('MARKETING_BILLING_ENABLED')||'').toLowerCase()==='true';}
function clean(v:unknown,max=160){return String(v??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max);}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST')return reply(req,405,{error:'Method not allowed'});
  const origin=req.headers.get('origin')||'';
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(req,403,{error:'Origin not allowed'});
  if(!enabled())return reply(req,503,{error:'Marketing campaign billing is not live yet',code:'MARKETING_BILLING_DISABLED'});

  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer '))return reply(req,401,{error:'Sign in required'});
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,service,{auth:{persistSession:false}});
  const{data:{user},error:authError}=await uc.auth.getUser();
  if(authError||!user)return reply(req,401,{error:'Session could not be verified'});
  const access=await uc.rpc('marketing_studio_bootstrap');
  if(access.error)return reply(req,403,{error:'Marketing Studio access required'});
  const plan=clean(access.data?.plan,30);

  const body=await req.json().catch(()=>({}));
  const quoteId=clean(body?.quote_id,80);
  if(!quoteId)return reply(req,400,{error:'quote_id is required'});
  const q=await admin.from('marketing_price_quotes').select('id,user_id,campaign_id,provider_key,channel,plan_key,quantity,retail_cents,expires_at,pricing_detail').eq('id',quoteId).eq('user_id',user.id).maybeSingle();
  if(q.error||!q.data)return reply(req,404,{error:'Quote not found'});
  const quote=q.data;
  if(new Date(quote.expires_at||0).getTime()<=Date.now())return reply(req,409,{error:'This quote expired. Create a new quote.',code:'QUOTE_EXPIRED'});
  if(String(quote.plan_key)!==plan)return reply(req,409,{error:'Your plan changed. Create a new quote.',code:'PLAN_CHANGED'});
  if(Number(quote.retail_cents||0)<=0)return reply(req,409,{error:'Quote amount is invalid'});

  const c=await admin.from('marketing_campaigns').select('id,name,status').eq('id',quote.campaign_id).eq('user_id',user.id).maybeSingle();
  if(c.error||!c.data)return reply(req,404,{error:'Campaign not found'});
  if(!['draft','approved','payment_pending'].includes(c.data.status))return reply(req,409,{error:'Campaign is not eligible for checkout'});
  const idem=`stripe:marketing:${quote.campaign_id}:${quote.id}`;
  const existing=await admin.from('marketing_payments').select('id,status,processor_payment_id,amount_cents,metadata').eq('idempotency_key',idem).maybeSingle();
  if(existing.data?.status==='paid')return reply(req,409,{error:'This quote is already funded',code:'ALREADY_FUNDED',payment_id:existing.data.id});
  if(existing.data?.status==='pending'&&existing.data.metadata?.checkout_url)return reply(req,200,{url:existing.data.metadata.checkout_url,session_id:existing.data.processor_payment_id,payment_id:existing.data.id,reused:true});

  const key=Deno.env.get('STRIPE_SECRET_KEY');
  if(!key)return reply(req,503,{error:'Stripe campaign billing is not configured',code:'STRIPE_NOT_CONFIGURED'});
  const stripe=new Stripe(key,{apiVersion:'2026-06-24.dahlia'});
  const suffix=crypto.randomUUID().replaceAll('-','').slice(0,8);
  const meta={product:'watchdog_marketing_campaign',watchdog_user_id:user.id,campaign_id:String(quote.campaign_id),quote_id:String(quote.id),channel:String(quote.channel||''),provider_key:String(quote.provider_key||'')};
  let session;
  try{
    session=await stripe.checkout.sessions.create({
      mode:'payment',client_reference_id:user.id,
      line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:Number(quote.retail_cents),product_data:{name:`Watchdog Marketing Campaign: ${clean(c.data.name,100)}`,description:`${Number(quote.quantity||0).toLocaleString()} ${clean(quote.channel,40).replaceAll('_',' ')} units`}}}],
      success_url:'https://njpropertytaxrelief.com/property/marketing-studio.html?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:'https://njpropertytaxrelief.com/property/marketing-studio.html?payment=cancelled',
      metadata:meta,payment_intent_data:{metadata:meta},integration_identifier:`watchdog_campaign_${suffix}`
    },{idempotencyKey:idem});
  }catch(e){console.error('MARKETING_STRIPE_CHECKOUT_ERROR',e);return reply(req,502,{error:e instanceof Error?e.message:'Could not create campaign checkout'});}
  if(!session.url)return reply(req,502,{error:'Stripe did not return a checkout URL'});

  const paymentRow={user_id:user.id,campaign_id:quote.campaign_id,quote_id:quote.id,processor:'stripe',processor_payment_id:session.id,amount_cents:Number(quote.retail_cents),status:'pending',idempotency_key:idem,metadata:{checkout_url:session.url,checkout_session_id:session.id,channel:quote.channel,provider_key:quote.provider_key,quantity:quote.quantity}};
  const saved=existing.data?await admin.from('marketing_payments').update(paymentRow).eq('id',existing.data.id).select('id').single():await admin.from('marketing_payments').insert(paymentRow).select('id').single();
  if(saved.error)return reply(req,503,{error:'Campaign payment ledger could not be created'});
  await admin.from('marketing_campaigns').update({status:'payment_pending',updated_at:new Date().toISOString()}).eq('id',quote.campaign_id).eq('user_id',user.id);
  await admin.from('marketing_events').insert({user_id:user.id,campaign_id:quote.campaign_id,event_type:'payment.checkout_created',source:'stripe',payload:{payment_id:saved.data.id,quote_id:quote.id,session_id:session.id,amount_cents:quote.retail_cents}});
  return reply(req,200,{url:session.url,session_id:session.id,payment_id:saved.data.id,amount_cents:quote.retail_cents,quote_id:quote.id});
});