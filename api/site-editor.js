/* Watchdog site editor API.
   Developer-only. Reads page source from GitHub, applies in-page edits to the
   exact element ranges in the source file, commits them to a draft branch,
   and publishes the draft into the base branch through a pull request.

   Required env:
     SITE_EDITOR_GITHUB_TOKEN   fine-grained token for this repo only
                                (Contents: read/write, Pull requests: read/write)
   Optional env:
     SITE_EDITOR_REPO           default johnscafide/njtaxrelief
     SITE_EDITOR_BASE_BRANCH    default main
     SITE_EDITOR_DRAFT_BRANCH   default site-editor/draft
     SITE_EDITOR_ALLOWED_EMAILS comma-separated; when set, developers must also be listed

   The browser never sends a file path it wants written. It sends the page
   pathname, and this function resolves the source file the same way the
   Watchdog routing layer does. */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const GITHUB_API = 'https://api.github.com';
const WATCHDOG_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com', 'njpropertytaxrelief.com', 'www.njpropertytaxrelief.com']);
/* Mirrors ROOT_STATIC_PAGES in middleware.js: on the Watchdog host these clean
   paths are served from the repository root instead of /property/.
   property/tests/site-editor-contract.mjs keeps the two lists in sync. */
const ROOT_STATIC_PAGES = new Set(['/move', '/contact', '/search', '/agent', '/lender', '/attorney', '/investor', '/developer/communications', '/transaction', '/transaction/shared', '/account/profile', '/account/professional-profile', '/agent/listing-prep', '/agent/buyers', '/agent/open-house', '/agent/training', '/open-house', '/client-room', '/preview', '/preview/home']);
const EDITABLE_ATTRS = new Set(['href', 'target', 'rel', 'title', 'src', 'alt', 'srcset', 'sizes']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'xlink:href', 'background', 'cite']);
const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base', 'form', 'input', 'textarea', 'select', 'option', 'template', 'svg', 'math', 'noscript']);
const UPLOAD_TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif'], ['image/avif', 'avif']]);
const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024;
const MAX_FRAGMENT_CHARS = 200000;
const MAX_EDITS = 200;
const UPLOAD_DIR = 'property/assets/site-editor';
const PARSE_OPTIONS = { sourceCodeLocationInfo: true, scriptingEnabled: false };

let parse5Promise = null;
function parse5() {
  if (!parse5Promise) parse5Promise = import('parse5');
  return parse5Promise;
}

function config() {
  return {
    token: process.env.SITE_EDITOR_GITHUB_TOKEN || '',
    repo: process.env.SITE_EDITOR_REPO || 'johnscafide/njtaxrelief',
    base: process.env.SITE_EDITOR_BASE_BRANCH || 'main',
    draft: process.env.SITE_EDITOR_DRAFT_BRANCH || 'site-editor/draft',
    allowedEmails: String(process.env.SITE_EDITOR_ALLOWED_EMAILS || '')
      .split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  };
}

class EditorError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

/* ---------- request plumbing ---------- */

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

function allowedHost(host) {
  return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1';
}

/* Same-origin only. The editor calls this from the page it is editing, so a
   cross-site Origin header is never legitimate. No CORS headers are sent. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.hostname.toLowerCase() === requestHost(req) && allowedHost(url.hostname.toLowerCase());
  } catch (_error) {
    return false;
  }
}

function bearer(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_error) { body = null; }
  }
  return body && typeof body === 'object' ? body : {};
}

async function requireDeveloper(token) {
  if (!token) throw new EditorError(401, 'Developer sign-in is required.');
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!userResponse.ok) throw new EditorError(401, 'Developer sign-in is required.');
  const user = await userResponse.json().catch(() => null);

  const developerResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_watchdog_developer`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: '{}',
    cache: 'no-store'
  });
  const isDeveloper = developerResponse.ok ? await developerResponse.json().catch(() => false) : false;
  if (isDeveloper !== true) throw new EditorError(403, 'Developer access is required.');

  const email = String(user && user.email || '').toLowerCase();
  const allowed = config().allowedEmails;
  if (allowed.length && !allowed.includes(email)) throw new EditorError(403, 'This account is not on the site editor allowlist.');
  return { id: user && user.id, email };
}

/* ---------- page path -> source file ---------- */

function normalizePagePath(input) {
  let pathname = String(input || '/').trim();
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.split('?')[0].split('#')[0];
  try { pathname = decodeURIComponent(pathname); } catch (_error) { return null; }
  pathname = pathname.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (pathname.includes('\0') || pathname.split('/').some(part => part === '..' || part === '.')) return null;
  if (!/^\/[A-Za-z0-9._~!$&'()+,;=:@%/-]*$/.test(pathname)) return null;
  pathname = pathname.replace(/\/index\.html$/i, '').replace(/\.html$/i, '');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname || '/';
}

function pageCandidates(pathname, host) {
  const path = normalizePagePath(pathname);
  if (!path) return [];
  const propertyFiles = rest => rest === '/' ? ['property/index.html'] : [`property${rest}/index.html`, `property${rest}.html`];
  const rootFiles = rest => rest === '/' ? ['index.html'] : [`${rest.slice(1)}/index.html`, `${rest.slice(1)}.html`];

  if (path === '/property' || path.startsWith('/property/')) return propertyFiles(path.slice('/property'.length) || '/');
  if (WATCHDOG_HOSTS.has(host)) {
    return ROOT_STATIC_PAGES.has(path) ? rootFiles(path) : propertyFiles(path);
  }
  return rootFiles(path);
}

/* ---------- GitHub ---------- */

async function gh(method, path, body, okStatuses) {
  const { token, repo } = config();
  const response = await fetch(`${GITHUB_API}/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'watchdog-site-editor',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok || (okStatuses && okStatuses.includes(response.status))) return { status: response.status, data };
  const message = data && data.message ? data.message : `GitHub request failed (${response.status})`;
  const error = new EditorError(response.status === 404 ? 404 : 502, `GitHub: ${message}`);
  error.githubStatus = response.status;
  throw error;
}

function encodePath(file) {
  return file.split('/').map(encodeURIComponent).join('/');
}

async function getRef(branch) {
  const result = await gh('GET', `/git/ref/heads/${encodePath(branch)}`, null, [404]);
  return result.status === 404 ? null : result.data.object.sha;
}

async function readFile(file, ref) {
  const result = await gh('GET', `/contents/${encodePath(file)}?ref=${encodeURIComponent(ref)}`, null, [404]);
  if (result.status === 404 || !result.data || Array.isArray(result.data) || result.data.type !== 'file') return null;
  let base64 = result.data.content;
  if (!base64 && result.data.size > 0) {
    const blob = await gh('GET', `/git/blobs/${result.data.sha}`);
    base64 = blob.data.content;
  }
  return { sha: result.data.sha, text: Buffer.from(String(base64 || ''), 'base64').toString('utf8') };
}

async function resolveFile(pathname, host, ref) {
  for (const file of pageCandidates(pathname, host)) {
    const found = await readFile(file, ref);
    if (found) return { file, ...found };
  }
  throw new EditorError(404, 'Could not find a source file for this page in the repository.');
}

async function compareDraft() {
  const { base, draft } = config();
  const result = await gh('GET', `/compare/${encodePath(base)}...${encodePath(draft)}`, null, [404]);
  if (result.status === 404) return null;
  return {
    aheadBy: result.data.ahead_by,
    behindBy: result.data.behind_by,
    files: (result.data.files || []).map(f => ({ file: f.filename, status: f.status })),
    commits: (result.data.commits || []).map(c => String(c.commit && c.commit.message || '').split('\n')[0])
  };
}

/* Keep the draft branch close to the base branch so edits are made against
   current source. A draft with nothing unpublished is simply moved forward;
   a draft with unpublished work gets the base branch merged into it. */
async function syncDraft() {
  const { base, draft } = config();
  const draftSha = await getRef(draft);
  if (!draftSha) return null;
  const status = await compareDraft();
  if (!status || status.behindBy === 0) return draftSha;
  const baseSha = await getRef(base);
  if (status.aheadBy === 0) {
    await gh('PATCH', `/git/refs/heads/${encodePath(draft)}`, { sha: baseSha, force: false });
    return baseSha;
  }
  const merge = await gh('POST', '/merges', {
    base: draft,
    head: base,
    commit_message: `Site editor: bring ${base} into draft`
  }, [409]);
  if (merge.status === 409) {
    throw new EditorError(409, `The draft conflicts with newer changes on ${base}. Publish or discard the draft first.`);
  }
  return merge.data ? merge.data.sha : draftSha;
}

async function ensureDraft() {
  const { base, draft } = config();
  const existing = await syncDraft();
  if (existing) return existing;
  const baseSha = await getRef(base);
  if (!baseSha) throw new EditorError(502, `Base branch ${base} was not found.`);
  const created = await gh('POST', '/git/refs', { ref: `refs/heads/${draft}`, sha: baseSha }, [422]);
  if (created.status === 422) {
    const sha = await getRef(draft);
    if (sha) return sha;
    throw new EditorError(502, 'Could not create the draft branch.');
  }
  return baseSha;
}

async function commitFiles(parentSha, files, message) {
  const { draft } = config();
  const parent = await gh('GET', `/git/commits/${parentSha}`);
  const tree = [];
  for (const file of files) {
    const blob = await gh('POST', '/git/blobs', {
      content: file.base64 != null ? file.base64 : file.text,
      encoding: file.base64 != null ? 'base64' : 'utf-8'
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.data.sha });
  }
  const newTree = await gh('POST', '/git/trees', { base_tree: parent.data.tree.sha, tree });
  const commit = await gh('POST', '/git/commits', { message, tree: newTree.data.sha, parents: [parentSha] });
  const update = await gh('PATCH', `/git/refs/heads/${encodePath(draft)}`, { sha: commit.data.sha, force: false }, [422]);
  if (update.status === 422) throw new EditorError(409, 'The draft changed while saving. Reload the page and try again.');
  return commit.data;
}

/* ---------- source editing ---------- */

function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isElement(node) {
  return node && typeof node.tagName === 'string';
}

/* Document-order element list. Template contents are skipped, which matches
   document.getElementsByTagName('*') on a DOMParser document in the browser. */
function elementList(document) {
  const out = [];
  (function walk(node) {
    for (const child of node.childNodes || []) {
      if (isElement(child)) {
        out.push(child);
        walk(child);
      }
    }
  })(document);
  return out;
}

function textOf(node) {
  if (node.nodeName === '#text') return node.value;
  if (!node.childNodes) return '';
  return node.childNodes.map(textOf).join('');
}

function safeUrl(value) {
  const compact = String(value || '').replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  return !/^(?:javascript|vbscript|data|file):/.test(compact);
}

function checkAttr(name, value) {
  const lower = String(name || '').toLowerCase();
  if (lower.startsWith('on') || lower === 'srcdoc' || lower === 'formaction') {
    throw new EditorError(400, `The attribute "${name}" is not allowed.`);
  }
  if (URL_ATTRS.has(lower) && !safeUrl(value)) throw new EditorError(400, `Unsafe URL in "${name}".`);
  if (lower === 'srcset' && String(value || '').split(',').some(part => !safeUrl(part.trim()))) {
    throw new EditorError(400, 'Unsafe URL in "srcset".');
  }
  if (lower === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|vbscript|data):/i.test(String(value || ''))) {
    throw new EditorError(400, 'Unsafe inline style.');
  }
}

/* Parses the submitted inner HTML in the context of the element it replaces,
   rejects anything that could run code or break out of the element, and
   returns a normalized, balanced serialization. */
function cleanFragment(p5, contextNode, html) {
  if (typeof html !== 'string') throw new EditorError(400, 'Edited content is missing.');
  if (html.length > MAX_FRAGMENT_CHARS) throw new EditorError(413, 'Edited content is too large.');
  const fragment = p5.parseFragment(contextNode, html);
  (function walk(node) {
    for (const child of node.childNodes || []) {
      if (child.nodeName === '#comment') continue;
      if (isElement(child)) {
        if (BLOCKED_TAGS.has(child.tagName)) throw new EditorError(400, `<${child.tagName}> is not allowed in edited content.`);
        for (const attr of child.attrs || []) checkAttr(attr.name, attr.value);
        walk(child);
      }
    }
  })(fragment);
  return p5.serialize(fragment);
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function attrRange(raw, startTag, name, value) {
  const existing = startTag.attrs && startTag.attrs[name];
  if (existing) {
    if (value == null) {
      let start = existing.startOffset;
      while (start > startTag.startOffset && /\s/.test(raw[start - 1])) start -= 1;
      return { start, end: existing.endOffset, text: '' };
    }
    return { start: existing.startOffset, end: existing.endOffset, text: `${name}="${escapeAttr(value)}"` };
  }
  if (value == null) return null;
  const tagText = raw.slice(startTag.startOffset, startTag.endOffset);
  const insertAt = /\/\s*>$/.test(tagText)
    ? startTag.startOffset + tagText.search(/\s*\/\s*>$/)
    : startTag.endOffset - 1;
  return { start: insertAt, end: insertAt, text: ` ${name}="${escapeAttr(value)}"` };
}

/* Applies edits to raw source text. Every edit names an element by its
   document-order index and carries the tag and normalized text the editor saw,
   so an edit made against stale source is rejected instead of landing on the
   wrong element. Untouched bytes of the file are preserved exactly. */
async function applyEdits(raw, edits, uploadPaths) {
  const p5 = await parse5();
  const document = p5.parse(raw, PARSE_OPTIONS);
  const elements = elementList(document);
  const ranges = [];

  for (const edit of edits) {
    const index = Number(edit && edit.index);
    const node = Number.isInteger(index) ? elements[index] : null;
    if (!node) throw new EditorError(409, 'An edited element no longer exists in the source. Reload and try again.');
    if (node.tagName !== String(edit.tag || '').toLowerCase() || normText(textOf(node)) !== normText(edit.text)) {
      throw new EditorError(409, `The source for a <${node.tagName}> changed since the editor loaded. Reload and try again.`);
    }
    const loc = node.sourceCodeLocation;
    if (!loc || !loc.startTag) throw new EditorError(409, `This <${node.tagName}> is not written in the source file, so it cannot be edited here.`);

    if (edit.kind === 'content') {
      if (!loc.endTag) throw new EditorError(409, `This <${node.tagName}> has no closing tag in the source, so it cannot be edited safely.`);
      const text = cleanFragment(p5, node, edit.html);
      const current = p5.serialize(node);
      if (text !== current) ranges.push({ start: loc.startTag.endOffset, end: loc.endTag.startOffset, text });
    } else if (edit.kind === 'attr') {
      const name = String(edit.name || '').toLowerCase();
      if (!EDITABLE_ATTRS.has(name)) throw new EditorError(400, `The attribute "${edit.name}" cannot be edited.`);
      let value = edit.value == null ? null : String(edit.value);
      if (value && value.startsWith('upload:')) {
        value = uploadPaths.get(value.slice('upload:'.length));
        if (!value) throw new EditorError(400, 'An uploaded image is missing from the request.');
      }
      if (value != null) checkAttr(name, value);
      const range = attrRange(raw, loc.startTag, name, value);
      if (range) ranges.push(range);
    } else {
      throw new EditorError(400, 'Unknown edit type.');
    }
  }

  ranges.sort((a, b) => b.start - a.start || b.end - a.end);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].end > ranges[i - 1].start) throw new EditorError(400, 'Two edits overlap. Save them one at a time.');
  }
  let out = raw;
  for (const range of ranges) out = out.slice(0, range.start) + range.text + out.slice(range.end);
  return { html: out, changed: ranges.length };
}

function prepareUploads(uploads) {
  const files = [];
  const paths = new Map();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (const upload of Array.isArray(uploads) ? uploads : []) {
    const ext = UPLOAD_TYPES.get(String(upload && upload.type || '').toLowerCase());
    if (!ext) throw new EditorError(400, 'Images must be PNG, JPEG, WebP, GIF, or AVIF.');
    const id = String(upload.id || '');
    if (!/^[a-z0-9]{6,40}$/i.test(id)) throw new EditorError(400, 'Invalid upload id.');
    const data = String(upload.data || '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(data)) throw new EditorError(400, 'Invalid image data.');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) throw new EditorError(413, 'Images must be 2.5 MB or smaller.');
    const base = String(upload.name || 'image').replace(/\.[^.]*$/, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
    const path = `${UPLOAD_DIR}/${stamp}-${id.slice(0, 8).toLowerCase()}-${base}.${ext}`;
    files.push({ path, base64: bytes.toString('base64') });
    paths.set(id, `/${path}`);
  }
  return { files, paths };
}

/* ---------- actions ---------- */

async function actionSession(user) {
  const { repo, base, draft, token } = config();
  if (!token) return { ok: true, developer: true, configured: false, email: user.email };
  const status = await compareDraft();
  return {
    ok: true,
    developer: true,
    configured: true,
    email: user.email,
    repo,
    base,
    draft,
    pending: status ? { files: status.files, commits: status.aheadBy } : { files: [], commits: 0 },
    compareUrl: `https://github.com/${repo}/compare/${base}...${draft}`
  };
}

async function actionSource(body, host) {
  const { base, draft } = config();
  const draftSha = await syncDraft();
  const main = await resolveFile(body.pathname, host, base).catch(error => {
    if (error.status === 404 && draftSha) return null;
    throw error;
  });
  const draftFile = draftSha ? await resolveFile(body.pathname, host, draft).catch(() => null) : null;
  const source = draftFile || main;
  if (!source) throw new EditorError(404, 'Could not find a source file for this page in the repository.');
  return {
    ok: true,
    file: source.file,
    sha: source.sha,
    html: source.text,
    mainHtml: draftFile && main && main.sha !== draftFile.sha ? main.text : null
  };
}

async function actionSave(body, host, user) {
  const edits = Array.isArray(body.edits) ? body.edits : [];
  if (!edits.length) throw new EditorError(400, 'There are no changes to save.');
  if (edits.length > MAX_EDITS) throw new EditorError(413, 'Too many changes in one save.');

  const { draft } = config();
  const headSha = await ensureDraft();
  const current = await resolveFile(body.pathname, host, draft);
  if (body.file && body.file !== current.file) throw new EditorError(409, 'This page now resolves to a different source file. Reload and try again.');
  if (body.sha !== current.sha) {
    throw new EditorError(409, 'This page changed in the repository since you opened the editor. Reload to get the latest version.');
  }

  const { files: uploadFiles, paths } = prepareUploads(body.uploads);
  const result = await applyEdits(current.text, edits, paths);
  if (!result.changed && !uploadFiles.length) return { ok: true, saved: false, sha: current.sha, html: current.text };

  const pageUrl = String(body.pageUrl || '').slice(0, 300);
  const message = [
    `Site editor: update ${current.file}`,
    '',
    `${result.changed} change${result.changed === 1 ? '' : 's'} saved from ${pageUrl || body.pathname} in the Watchdog site editor.`,
    uploadFiles.length ? `Added ${uploadFiles.map(f => f.path).join(', ')}.` : '',
    `Editor: ${user.email || user.id}`
  ].filter(line => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const commit = await commitFiles(headSha, [{ path: current.file, text: result.html }, ...uploadFiles], message);
  const saved = await readFile(current.file, commit.sha);
  return {
    ok: true,
    saved: true,
    commit: commit.sha,
    sha: saved ? saved.sha : null,
    html: result.html,
    uploads: Object.fromEntries(paths)
  };
}

async function actionPublish(user) {
  const { repo, base, draft } = config();
  const status = await compareDraft();
  if (!status || status.aheadBy === 0) return { ok: true, merged: false, message: 'There are no draft changes to publish.' };

  const owner = repo.split('/')[0];
  const open = await gh('GET', `/pulls?state=open&base=${encodeURIComponent(base)}&head=${encodeURIComponent(`${owner}:${draft}`)}`);
  let pr = Array.isArray(open.data) && open.data[0];
  const fileList = status.files.map(f => `- \`${f.file}\` (${f.status})`).join('\n');
  if (!pr) {
    const created = await gh('POST', '/pulls', {
      title: `Site editor: publish ${status.files.length} file change${status.files.length === 1 ? '' : 's'}`,
      head: draft,
      base,
      body: [
        'Changes made in the Watchdog site editor.',
        '',
        '## Files',
        fileList,
        '',
        '## Draft saves',
        status.commits.map(c => `- ${c}`).join('\n'),
        '',
        `Published by ${user.email || user.id}. The live site changes after the next manual deploy.`
      ].join('\n')
    });
    pr = created.data;
  }

  const merge = await gh('PUT', `/pulls/${pr.number}/merge`, {
    merge_method: 'squash',
    commit_title: `${pr.title} (#${pr.number})`,
    sha: pr.head.sha
  }, [405, 409, 422]);
  if (merge.status !== 200) {
    return {
      ok: true,
      merged: false,
      prUrl: pr.html_url,
      message: `Pull request opened, but GitHub would not merge it yet: ${merge.data && merge.data.message || 'not mergeable'}.`
    };
  }
  await gh('DELETE', `/git/refs/heads/${encodePath(draft)}`, null, [404, 422]);
  return { ok: true, merged: true, prUrl: pr.html_url, commit: merge.data.sha, files: status.files };
}

async function actionDiscard() {
  const { draft } = config();
  await gh('DELETE', `/git/refs/heads/${encodePath(draft)}`, null, [404, 422]);
  return { ok: true, discarded: true };
}

module.exports = async function handler(req, res) {
  const host = requestHost(req);
  if (!allowedHost(host)) return send(res, 404, { error: 'Not found' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cross-origin requests are not allowed.' });

  try {
    const user = await requireDeveloper(bearer(req));
    const body = readBody(req);
    if (body.action === 'session') return send(res, 200, await actionSession(user));
    if (!config().token) throw new EditorError(503, 'The site editor is not configured yet (SITE_EDITOR_GITHUB_TOKEN is missing).');
    const pageHost = String(body.host || host).toLowerCase();
    if (!allowedHost(pageHost)) throw new EditorError(400, 'Unknown site host.');

    switch (body.action) {
      case 'source': return send(res, 200, await actionSource(body, pageHost));
      case 'save': return send(res, 200, await actionSave(body, pageHost, user));
      case 'publish': return send(res, 200, await actionPublish(user));
      case 'discard': return send(res, 200, await actionDiscard());
      default: throw new EditorError(400, 'Unknown action.');
    }
  } catch (error) {
    if (error instanceof EditorError) return send(res, error.status, { error: error.message, ...(error.extra || {}) });
    console.error('SITE_EDITOR_FAILED', error && error.stack || error);
    return send(res, 500, { error: 'The site editor hit an unexpected error.' });
  }
};

module.exports._internals = { applyEdits, pageCandidates, normalizePagePath, prepareUploads, ROOT_STATIC_PAGES };
