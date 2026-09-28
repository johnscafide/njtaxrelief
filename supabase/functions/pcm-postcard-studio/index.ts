// Postcard Studio: the agent-facing side of the PostcardMania (PCM) white-label
// integration for the one launch format, a 6 x 8.5 First Class postcard.
//
//   status          everything the studio page needs in one read
//   editor          open PCM's embedded editor (new blank design or reopen the saved one)
//   save_design     confirm a design the editor saved and attach it to the campaign
//   return_address  save the brokerage return address (campaign + reusable profile copy)
//   proof           ask PCM for a front/back proof with a real recipient and return address
//   approve_proof   the agent signs off on the exact design that was proofed
//   cancel          cancel a submitted order before PCM's 11:30 PM Eastern cutoff
//
// Each agent is a PCM child account (childRefNbr = Supabase user id), so an agent can
// only open, proof or order designs PCM already scoped to them. Nothing here places an
// order; paid orders go through marketing-direct-mail-fulfill behind
// PCM_LIVE_LAUNCH_ENABLED.
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import {
  PCM_POSTCARD_SIZE, PCM_POSTCARD_SIZE_LABEL, PcmError, cancelDeadline, childRef, editorUrl,
  pcmConfigured, pcmLogin, pcmRequest, returnAddressFrom, type PcmEnvironment,
} from '../_shared/pcm-v3.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ORIGINS = new Set([
  'https://www.watchdogindex.com', 'https://watchdogindex.com',
  'https://njpropertytaxrelief.com', 'https://www.njpropertytaxrelief.com',
  'http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:8765',
]);
function allowOrigin(o: string) {
  return ORIGINS.has(o) || /^https:\/\/njtaxrelief(?:-git)?-[a-z0-9-]+-johnscafides-projects\.vercel\.app$/.test(o);
}
function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowOrigin(o) ? o : 'https://www.watchdogindex.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
function reply(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}
const clean = (v: unknown, n = 200) => String(v ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, n);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Method not allowed' });
  const origin = req.headers.get('origin') || '';
  if (origin && !allowOrigin(origin)) return reply(req, 403, { error: 'Origin not allowed' });
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply(req, 401, { error: 'Sign in required' });

  const uc = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await uc.auth.getUser();
  if (authError || !user) return reply(req, 401, { error: 'Session could not be verified' });
  const access = await uc.rpc('marketing_studio_bootstrap');
  if (access.error) return reply(req, 403, { error: 'Marketing Studio requires the Agent plan or higher' });

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action, 40);
  const campaignId = clean(body.campaign_id, 80);
  if (!campaignId) return reply(req, 400, { error: 'campaign_id is required' });

  const campaignQ = await admin.from('marketing_campaigns')
    .select('id,name,status,settings').eq('id', campaignId).eq('user_id', user.id).maybeSingle();
  if (campaignQ.error || !campaignQ.data) return reply(req, 404, { error: 'Campaign not found' });
  const campaign = campaignQ.data;
  const settings = campaign.settings || {};

  // Watchdog test accounts always use PCM's sandbox (never printed, never billed).
  const { data: isTest } = await admin.rpc('is_watchdog_test_account', { p_user_id: user.id });
  const environment: PcmEnvironment = !isTest && pcmConfigured('live') ? 'live' : 'sandbox';
  const child = childRef(user.id);

  const latestCreative = async () => (await admin.from('marketing_creatives')
    .select('id,status,version,provider_design_id,content,approved_at')
    .eq('campaign_id', campaignId).eq('user_id', user.id).eq('channel', 'direct_mail')
    .order('version', { ascending: false }).limit(1).maybeSingle()).data;

  const saveSettings = async (patch: Record<string, unknown>) => {
    const next = { ...settings, ...patch };
    const r = await admin.from('marketing_campaigns').update({ settings: next, updated_at: new Date().toISOString() })
      .eq('id', campaignId).eq('user_id', user.id);
    if (r.error) throw new Error('Campaign could not be saved');
    Object.assign(settings, patch);
  };

  const latestJob = async () => (await admin.from('marketing_provider_jobs')
    .select('id,status,provider_job_id,response_summary,submitted_at,retail_cents,quote_id,recipient_count')
    .eq('campaign_id', campaignId).eq('user_id', user.id).eq('provider_key', 'pcm')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()).data;

  try {
    if (action === 'status') {
      const count = (valid: boolean) => {
        let q = admin.from('marketing_direct_mail_recipients').select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId).eq('user_id', user.id);
        if (valid) q = q.eq('validation_status', 'valid');
        return q;
      };
      const [creative, job, profile, credits, total, valid] = await Promise.all([
        latestCreative(),
        latestJob(),
        admin.from('profiles').select('pro_agent').eq('id', user.id).maybeSingle(),
        admin.from('marketing_mail_credits').select('amount_cents,redeemed_at').eq('user_id', user.id),
        count(false),
        count(true),
      ]);
      const pro = profile.data?.pro_agent || {};
      const saved = returnAddressFrom(settings.return_address) || returnAddressFrom(pro.brokerage_address);
      const deadline = job?.submitted_at ? cancelDeadline(job.submitted_at) : null;
      return reply(req, 200, {
        environment,
        format: { size: PCM_POSTCARD_SIZE, size_label: PCM_POSTCARD_SIZE_LABEL, mail_class: 'FirstClass' },
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
        design: creative?.provider_design_id ? {
          design_id: creative.provider_design_id,
          creative_id: creative.id,
          status: creative.status,
          environment: creative.content?.pcm_environment || null,
        } : null,
        proof: settings.pcm_design?.proof || null,
        proof_review: settings.pcm_design?.proof_review || null,
        return_address: saved,
        brokerage_name: clean(pro.brokerage_name, 100) || null,
        recipients: {
          total: total.count || 0,
          valid: valid.count || 0,
        },
        mail_credit_cents: (credits.data || []).filter((c: any) => !c.redeemed_at).reduce((s: number, c: any) => s + Number(c.amount_cents || 0), 0),
        order: job ? {
          status: job.status,
          order_id: job.response_summary?.order_id || null,
          batch_id: job.response_summary?.batch_id || null,
          recipient_count: job.recipient_count,
          submitted_at: job.submitted_at,
          cancel_deadline: deadline?.toISOString() || null,
          cancelable: Boolean(deadline && Date.now() < deadline.getTime() && ['submitted', 'pending'].includes(job.status) && job.response_summary?.order_id),
          undeliverable: job.response_summary?.undeliverable_reconciliation || null,
        } : null,
      });
    }

    if (action === 'editor') {
      const creative = await latestCreative();
      const job = await latestJob();
      if (job && ['submitted', 'pending', 'processing', 'mailed', 'delivered', 'completed'].includes(job.status)) {
        return reply(req, 409, { error: 'This campaign has already been mailed. Start a new campaign to design another postcard.' });
      }
      const current = clean(creative?.provider_design_id, 40);
      const sameEnv = (creative?.content?.pcm_environment || environment) === environment;
      if (current && sameEnv) {
        const token = await pcmLogin(environment, child);
        return reply(req, 200, { design_id: current, url: editorUrl(current, token), environment, reopened: true });
      }
      const name = clean(`${campaign.name || 'Watchdog postcard'} · ${new Date().toISOString().slice(0, 10)}`, 90);
      const { data } = await pcmRequest(environment, child, 'POST', '/design/custom', { name, size: PCM_POSTCARD_SIZE });
      const designId = clean(data?.designID ?? data?.designId, 40);
      if (!designId) throw new PcmError(502, 'PCM_DESIGN_CREATE_FAILED', 'PCM did not return a design');
      const token = await pcmLogin(environment, child);
      return reply(req, 200, { design_id: designId, url: clean(data?.url, 2000) || editorUrl(designId, token), environment, reopened: false });
    }

    if (action === 'save_design') {
      const designId = clean(body.design_id, 40);
      if (!/^\d{1,20}$/.test(designId)) return reply(req, 400, { error: 'Save your design in the editor first.' });
      // Reading it under the agent's child login proves the design is theirs.
      const { data: design } = await pcmRequest(environment, child, 'GET', `/design/${designId}`);
      const sizeKey = clean(design?.size?.key ?? design?.size, 10);
      if (sizeKey && sizeKey !== PCM_POSTCARD_SIZE) {
        return reply(req, 409, { error: `Only ${PCM_POSTCARD_SIZE_LABEL} postcards can be mailed right now.`, code: 'PCM_SIZE_NOT_SUPPORTED' });
      }
      const creative = await latestCreative();
      const version = Number(creative?.version || 0) + 1;
      const ins = await admin.from('marketing_creatives').insert({
        user_id: user.id,
        campaign_id: campaignId,
        channel: 'direct_mail',
        creative_type: 'postcard',
        version,
        status: 'draft',
        template_key: 'pcm_custom_6x8_5',
        provider_design_id: designId,
        content: {
          source: 'pcm_embedded_editor',
          pcm_environment: environment,
          size_label: PCM_POSTCARD_SIZE_LABEL,
          mail_class: 'FirstClass',
          pcm_proof_pdf: clean(design?.proofPDF, 2000) || null,
        },
      }).select('id,version').single();
      if (ins.error) throw new Error('Design could not be saved');
      // A new design version always needs a fresh proof and sign-off.
      await saveSettings({ pcm_design: { design_id: designId, environment, saved_at: new Date().toISOString(), proof: null, proof_review: null } });
      return reply(req, 200, { saved: true, design_id: designId, creative_id: ins.data.id, version: ins.data.version });
    }

    if (action === 'return_address') {
      const addr = returnAddressFrom(body.return_address);
      if (!addr) return reply(req, 400, { error: 'Add the brokerage name, street, city, 2-letter state and ZIP.' });
      await saveSettings({ return_address: addr });
      const prof = await admin.from('profiles').select('pro_agent').eq('id', user.id).maybeSingle();
      await admin.from('profiles').update({ pro_agent: { ...(prof.data?.pro_agent || {}), brokerage_address: addr } }).eq('id', user.id);
      return reply(req, 200, { saved: true, return_address: addr });
    }

    if (action === 'proof') {
      const creative = await latestCreative();
      const designId = clean(creative?.provider_design_id, 40);
      if (!designId) return reply(req, 409, { error: 'Design and save your postcard first.' });
      const returnAddress = returnAddressFrom(settings.return_address);
      if (!returnAddress) return reply(req, 409, { error: 'Add your brokerage return address first.', code: 'RETURN_ADDRESS_REQUIRED' });
      const sample = (await admin.from('marketing_direct_mail_recipients').select('address,city,state,zip')
        .eq('campaign_id', campaignId).eq('user_id', user.id).eq('validation_status', 'valid').limit(1).maybeSingle()).data;
      const recipient = sample
        ? { firstName: 'Current', lastName: 'Resident', address: clean(sample.address, 140), city: clean(sample.city, 80), state: clean(sample.state || 'NJ', 2), zipCode: clean(sample.zip, 10).slice(0, 5) }
        : { firstName: 'Current', lastName: 'Resident', address: returnAddress.address, city: returnAddress.city, state: returnAddress.state, zipCode: returnAddress.zipCode };
      const { data } = await pcmRequest(environment, child, 'POST', '/design/generate-proof/postcard', {
        designID: Number(designId), format: 'pdf', recipient, returnAddress,
      });
      // PCM documents {front, back}, but its live responses use PascalCase elsewhere
      // and may wrap the body or return a single combined {pdf}. Accept all of them.
      const find = (obj: any, keys: string[], depth = 0): string => {
        if (!obj || typeof obj !== 'object' || depth > 2) return '';
        for (const [k, v] of Object.entries(obj)) {
          if (keys.includes(k.toLowerCase()) && typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
        }
        for (const v of Object.values(obj)) {
          const hit = find(v, keys, depth + 1);
          if (hit) return hit;
        }
        return '';
      };
      const single = find(data, ['pdf', 'url', 'proof', 'proofurl', 'proofpdf']);
      const proof = {
        design_id: designId,
        creative_id: creative!.id,
        front: clean(find(data, ['front', 'fronturl', 'frontproof']) || single, 2000) || null,
        back: clean(find(data, ['back', 'backurl', 'backproof']), 2000) || null,
        generated_at: new Date().toISOString(),
        environment,
      };
      if (!proof.front && !proof.back) {
        const shape = data && typeof data === 'object' ? Object.keys(data).join(',') : typeof data;
        throw new PcmError(502, 'PCM_PROOF_EMPTY', `PCM did not return a proof (response keys: ${clean(shape, 200)})`);
      }
      await saveSettings({ pcm_design: { ...(settings.pcm_design || {}), proof, proof_review: null } });
      return reply(req, 200, { proof });
    }

    if (action === 'approve_proof') {
      const creative = await latestCreative();
      const proof = settings.pcm_design?.proof;
      if (!creative || !proof || proof.creative_id !== creative.id || proof.design_id !== creative.provider_design_id) {
        return reply(req, 409, { error: 'Generate a proof of your latest design first.', code: 'PROOF_STALE' });
      }
      const now = new Date().toISOString();
      const upd = await admin.from('marketing_creatives').update({ status: 'approved', approved_at: now, updated_at: now })
        .eq('id', creative.id).eq('user_id', user.id);
      if (upd.error) throw new Error('Approval could not be saved');
      await saveSettings({
        direct_mail: { ...(settings.direct_mail || {}), creative_tier: 'smart', product_type: 'postcard', size_label: PCM_POSTCARD_SIZE_LABEL, mail_class: 'FirstClass' },
        pcm_design: { ...(settings.pcm_design || {}), proof_review: { status: 'approved', design_id: creative.provider_design_id, creative_id: creative.id, approved_at: now } },
      });
      return reply(req, 200, { approved: true, creative_id: creative.id });
    }

    if (action === 'cancel') {
      const job = await latestJob();
      const orderId = clean(job?.response_summary?.order_id, 30);
      if (!job || !orderId) return reply(req, 409, { error: 'There is no submitted order to cancel.' });
      if (!['submitted', 'pending'].includes(job.status)) return reply(req, 409, { error: 'This order is already being printed and can no longer be canceled.' });
      const deadline = cancelDeadline(job.submitted_at);
      if (Date.now() >= deadline.getTime()) return reply(req, 409, { error: 'The cancel window closed at 11:30 PM Eastern on the day the order was placed.' });
      const orderEnv: PcmEnvironment = job.response_summary?.environment === 'sandbox' ? 'sandbox' : 'live';
      await pcmRequest(orderEnv, child, 'DELETE', `/order/${encodeURIComponent(orderId)}`);
      const now = new Date().toISOString();
      await admin.from('marketing_provider_jobs').update({
        status: 'canceled', completed_at: now, updated_at: now,
        response_summary: { ...(job.response_summary || {}), canceled_at: now, canceled_by: 'agent' },
      }).eq('id', job.id);
      await admin.from('marketing_campaigns').update({ status: 'canceled', updated_at: now }).eq('id', campaignId).eq('user_id', user.id);
      // The full order value (cash paid plus any mail credit it used) comes back as
      // mail credit for the next postcard.
      const quote = job.quote_id
        ? (await admin.from('marketing_price_quotes').select('pricing_detail').eq('id', job.quote_id).maybeSingle()).data
        : null;
      const refund = Math.max(0, Number(job.retail_cents || 0) + Number(quote?.pricing_detail?.mail_credit_applied_cents || 0));
      let credit: any = null;
      if (refund > 0) {
        credit = (await admin.rpc('marketing_mail_credit_issue', {
          p_user_id: user.id, p_campaign_id: campaignId, p_provider_job_id: job.id,
          p_source_reference: `pcm:order:${orderId}:canceled`, p_quantity: Number(job.recipient_count || 0),
          p_amount_cents: refund, p_reason: 'order_canceled',
        })).data;
      }
      await admin.from('marketing_events').insert({
        user_id: user.id, campaign_id: campaignId, provider_job_id: job.id, event_type: 'direct_mail.canceled', source: 'watchdog',
        payload: { order_id: orderId, credit_cents: refund },
      });
      return reply(req, 200, { canceled: true, credit_cents: refund, credit });
    }

    return reply(req, 400, { error: 'Unknown action' });
  } catch (error) {
    if (error instanceof PcmError) {
      console.error('PCM_POSTCARD_STUDIO', action, error.status, error.message);
      const status = error.code === 'PCM_NOT_CONNECTED' ? 503 : error.status === 404 ? 404 : 502;
      return reply(req, status, {
        error: error.status === 404 ? 'Watchdog Designs could not find that design on your account.' : 'Watchdog Designs could not finish that step. Try again in a minute.',
        code: error.code,
      });
    }
    console.error('PCM_POSTCARD_STUDIO', action, error instanceof Error ? error.message : error);
    return reply(req, 500, { error: error instanceof Error ? error.message : 'Postcard Studio request failed' });
  }
});
