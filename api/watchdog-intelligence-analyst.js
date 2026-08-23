const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const commandPolicy = require('../property/js/watchdog-intelligence-command-policy.js');

const clean = (value, max = 1000) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const safeContext = (value) => value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};

function confirmationPayload(policy) {
  const copy = commandPolicy.confirmCopy(policy);
  return {
    required: true,
    policy_version: policy.version,
    command_class: policy.class,
    mode: copy?.mode || policy.confirmation,
    title: copy?.title || 'Confirmation required',
    body: copy?.body || 'Confirm this request before continuing.',
    confirm_label: copy?.confirmLabel || 'Continue',
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Watchdog-Command-Policy', commandPolicy.VERSION);
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in required' });

  const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const originalPrompt = clean(input.prompt, 1800);
  if (!originalPrompt) return res.status(400).json({ error: 'prompt is required' });

  const policy = commandPolicy.classify(originalPrompt);
  const confirmation = clean(input.command_confirmation, 40).toLowerCase();
  if (policy.class === commandPolicy.CLASSES.prohibited) {
    return res.status(403).json({
      error: 'This command is blocked by the Watchdog Intelligence command policy.',
      command_policy: policy,
      message: commandPolicy.confirmCopy(policy)?.body || 'Command blocked.',
    });
  }
  if (policy.class === commandPolicy.CLASSES.reversible && confirmation !== 'confirmed') {
    return res.status(409).json({ error: 'Confirmation required.', command_policy: policy, confirmation: confirmationPayload(policy) });
  }
  if (policy.class === commandPolicy.CLASSES.approval_required && confirmation !== 'prepare_only') {
    return res.status(409).json({ error: 'Approval workflow required.', command_policy: policy, confirmation: confirmationPayload(policy) });
  }

  const context = safeContext(input.context);
  context.command_policy_version = policy.version;
  context.command_class = policy.class;
  context.command_execution = policy.execution;
  context.command_confirmation = policy.class === commandPolicy.CLASSES.reversible ? 'user_confirmed'
    : policy.class === commandPolicy.CLASSES.approval_required ? 'prepare_only'
      : 'not_required';

  const prompt = policy.class === commandPolicy.CLASSES.approval_required
    ? clean(`Prepare a non-executing proposal for the following user request. Do not send, publish, launch, purchase, bill, delete, submit, file, mail, call, message, sync, or mutate any external system. Keep the result in the existing Watchdog approval flow. Original request: ${originalPrompt}`, 1800)
    : originalPrompt;

  const body = {
    prompt,
    session_id: clean(input.session_id, 80) || null,
    context,
  };

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-analyst`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('X-Watchdog-Command-Class', policy.class);
    return res.send(text);
  } catch (error) {
    return res.status(502).json({ error: clean(error && error.message || 'Watchdog Analyst transport unavailable.', 500) });
  }
};
