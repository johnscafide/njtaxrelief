// Contract for the Watchdog site editor server logic (api/site-editor.js).
// Edits must land on exactly the right element, leave every other byte of the
// file alone, and refuse anything stale or unsafe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { applyEdits, pageCandidates, prepareUploads, ROOT_STATIC_PAGES } = require('../../api/site-editor.js')._internals;

const source = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Test page</title>
</head>
<body>
  <main class="wrap">
    <h1 class="hero">Know your  property tax</h1>
    <p id="intro">Start with <a href="/property/fairness">Fairness</a> today.</p>
    <img src='/property/assets/a.png' alt="Old alt" srcset="/a-2x.png 2x">
    <img src="/b.png"/>
    <ul><li>One</li><li>Two
    </ul>
  </main>
</body>
</html>
`;

// Indices in document order: 0 html, 1 head, 2 meta, 3 title, 4 body, 5 main,
// 6 h1, 7 p, 8 a, 9 img, 10 img, 11 ul, 12 li, 13 li
const h1 = { index: 6, tag: 'h1', text: 'Know your property tax' };
const p = { index: 7, tag: 'p', text: 'Start with Fairness today.' };

{
  const { html, changed } = await applyEdits(source, [{ ...h1, kind: 'content', html: 'Know your <strong>real</strong> tax' }], new Map());
  assert.equal(changed, 1);
  assert.equal(html, source.replace('Know your  property tax', 'Know your <strong>real</strong> tax'), 'only the h1 content changes');
}

{
  const { html } = await applyEdits(source, [
    { ...p, kind: 'content', html: 'Start with <a href="/property/fairness">Fairness</a> now.' },
    { index: 9, tag: 'img', text: '', kind: 'attr', name: 'alt', value: 'New "alt" & more' },
    { index: 9, tag: 'img', text: '', kind: 'attr', name: 'srcset', value: null },
    { index: 10, tag: 'img', text: '', kind: 'attr', name: 'alt', value: 'Added' }
  ], new Map());
  assert.match(html, /<p id="intro">Start with <a href="\/property\/fairness">Fairness<\/a> now\.<\/p>/);
  assert.match(html, /<img src='\/property\/assets\/a\.png' alt="New &quot;alt&quot; &amp; more">/, 'attr replaced in place, srcset removed, original quoting kept');
  assert.match(html, /<img src="\/b\.png" alt="Added"\/>/, 'attr inserted before self-closing slash');
  assert.ok(html.startsWith(source.slice(0, source.indexOf('<main'))), 'head untouched');
}

{
  const { html } = await applyEdits(source, [{ index: 8, tag: 'a', text: 'Fairness', kind: 'attr', name: 'target', value: '_blank' }], new Map());
  assert.ok(html.includes('<a href="/property/fairness" target="_blank">Fairness</a>'), 'attr inserted on a normal start tag');
}

{
  // Unchanged content produces no range, so the file is byte-identical.
  const { html, changed } = await applyEdits(source, [{ ...h1, kind: 'content', html: 'Know your  property tax' }], new Map());
  assert.equal(changed, 0);
  assert.equal(html, source);
}

{
  const uploads = prepareUploads([{ id: 'abc123xyz', name: 'My Photo.PNG', type: 'image/png', data: Buffer.from('png-bytes').toString('base64') }]);
  assert.equal(uploads.files.length, 1);
  assert.match(uploads.files[0].path, /^property\/assets\/site-editor\/\d{8}-abc123xy-my-photo\.png$/);
  const { html } = await applyEdits(source, [{ index: 9, tag: 'img', text: '', kind: 'attr', name: 'src', value: 'upload:abc123xyz' }], uploads.paths);
  assert.ok(html.includes(`<img src="/${uploads.files[0].path}"`));
}

async function rejects(edits, pattern, label) {
  await assert.rejects(() => applyEdits(source, edits, new Map()), error => pattern.test(error.message), label);
}

await rejects([{ ...h1, text: 'Something else', kind: 'content', html: 'x' }], /changed since the editor loaded/, 'stale text is refused');
await rejects([{ ...h1, tag: 'h2', kind: 'content', html: 'x' }], /changed since the editor loaded/, 'wrong tag is refused');
await rejects([{ index: 999, tag: 'p', text: '', kind: 'content', html: 'x' }], /no longer exists/, 'missing index is refused');
await rejects([{ index: 13, tag: 'li', text: 'Two', kind: 'content', html: 'x' }], /no closing tag/, 'implied end tags are refused');
await rejects([{ ...h1, kind: 'content', html: 'Hi<script>alert(1)</script>' }], /not allowed/, 'script is refused');
await rejects([{ ...h1, kind: 'content', html: '<img src=x onerror="alert(1)">' }], /not allowed/, 'event handlers are refused');
await rejects([{ ...h1, kind: 'content', html: '<a href=" javascript:alert(1)">x</a>' }], /Unsafe URL/, 'javascript: links are refused');
await rejects([{ ...p, kind: 'attr', name: 'onclick', value: 'x' }], /cannot be edited/, 'only allow-listed attributes');
await rejects([{ index: 8, tag: 'a', text: 'Fairness', kind: 'attr', name: 'href', value: 'data:text/html,hi' }], /Unsafe URL/, 'data: hrefs are refused');
await rejects([
  { ...p, kind: 'content', html: 'x' },
  { index: 8, tag: 'a', text: 'Fairness', kind: 'attr', name: 'href', value: '/x' }
], /overlap/, 'nested edits are refused');

{
  // Stray closing tags cannot escape the edited element.
  const { html } = await applyEdits(source, [{ ...h1, kind: 'content', html: 'Hi</h1></main><div>x' }], new Map());
  assert.match(html, /<h1 class="hero">Hi<div>x<\/div><\/h1>/);
}

// Page resolution follows the Watchdog routing layer.
assert.deepEqual(pageCandidates('/', 'www.watchdogindex.com'), ['property/index.html']);
assert.deepEqual(pageCandidates('/dashboard/', 'www.watchdogindex.com'), ['property/dashboard/index.html', 'property/dashboard.html']);
assert.deepEqual(pageCandidates('/contact', 'www.watchdogindex.com'), ['contact/index.html', 'contact.html']);
assert.deepEqual(pageCandidates('/property/insights/index.html', 'njtaxrelief.vercel.app'), ['property/insights/index.html', 'property/insights.html']);
assert.deepEqual(pageCandidates('/towns.html', 'www.njpropertytaxrelief.com'), ['towns/index.html', 'towns.html']);
assert.deepEqual(pageCandidates('/../secrets', 'www.watchdogindex.com'), []);
assert.deepEqual(pageCandidates('/%2e%2e/x', 'www.watchdogindex.com'), []);

// ROOT_STATIC_PAGES must mirror middleware.js.
const middleware = readFileSync(new URL('../../middleware.js', import.meta.url), 'utf8');
const listed = middleware.match(/const ROOT_STATIC_PAGES = new Set\((\[[^\]]*\])\)/);
assert.ok(listed, 'middleware ROOT_STATIC_PAGES found');
assert.deepEqual([...ROOT_STATIC_PAGES].sort(), JSON.parse(listed[1].replace(/'/g, '"')).sort(), 'site editor root pages match middleware');

console.log('site editor contract passed');

// ---------- handler flow against an in-memory GitHub + Supabase ----------
{
  const handler = require('../../api/site-editor.js');
  const page = '<!doctype html><html><head></head><body><h1>Hello there</h1></body></html>';
  const repo = { refs: { main: 'c0' }, commits: { c0: { tree: { 'property/pro/index.html': page } } }, pulls: [], n: 0 };
  const calls = [];
  const sha = text => createHash('sha1').update(text).digest('hex');
  const blobs = {};
  const json = (status, data) => new Response(data == null ? null : JSON.stringify(data), { status });

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push(`${method} ${u.pathname}`);
    if (u.pathname === '/auth/v1/user') return init.headers.Authorization === 'Bearer dev' || init.headers.Authorization === 'Bearer user' ? json(200, { id: 'u1', email: 'dev@example.com' }) : json(401, {});
    if (u.pathname === '/rest/v1/rpc/is_watchdog_developer') return json(200, init.headers.Authorization === 'Bearer dev');
    const p = u.pathname.replace('/repos/johnscafide/njtaxrelief', '');
    let m;
    if ((m = p.match(/^\/git\/ref\/heads\/(.+)$/))) { const b = decodeURIComponent(m[1]); return repo.refs[b] ? json(200, { object: { sha: repo.refs[b] } }) : json(404, { message: 'Not Found' }); }
    if (p === '/git/refs' && method === 'POST') { repo.refs[body.ref.replace('refs/heads/', '')] = body.sha; return json(201, {}); }
    if ((m = p.match(/^\/git\/refs\/heads\/(.+)$/))) {
      const b = decodeURIComponent(m[1]);
      if (method === 'DELETE') { delete repo.refs[b]; return json(204); }
      repo.refs[b] = body.sha; return json(200, {});
    }
    if ((m = p.match(/^\/contents\/(.+)$/))) {
      const file = decodeURIComponent(m[1]); const ref = u.searchParams.get('ref');
      const commit = repo.commits[repo.refs[ref] || ref];
      const text = commit && commit.tree[file];
      return text == null ? json(404, { message: 'Not Found' }) : json(200, { type: 'file', sha: sha(text), size: text.length, content: Buffer.from(text).toString('base64') });
    }
    if ((m = p.match(/^\/compare\/(.+)\.\.\.(.+)$/))) {
      const draft = repo.refs[decodeURIComponent(m[2])];
      if (!draft) return json(404, {});
      let ahead = 0; let c = draft; const files = new Set();
      while (c && c !== repo.refs.main) { ahead += 1; Object.keys(repo.commits[c].changed || {}).forEach(f => files.add(f)); c = repo.commits[c].parent; }
      return json(200, { ahead_by: ahead, behind_by: 0, files: [...files].map(f => ({ filename: f, status: 'modified' })), commits: [] });
    }
    if ((m = p.match(/^\/git\/commits\/(.+)$/))) return json(200, { tree: { sha: `t-${m[1]}` } });
    if (p === '/git/blobs') { const id = `blob${Object.keys(blobs).length}`; blobs[id] = body.encoding === 'base64' ? Buffer.from(body.content, 'base64').toString() : body.content; return json(201, { sha: id }); }
    if (p === '/git/trees') { return json(201, { sha: JSON.stringify(body) }); }
    if (p === '/git/commits') {
      const tree = JSON.parse(body.tree); const parent = body.parents[0];
      const id = `c${Object.keys(repo.commits).length}`; const next = { ...repo.commits[parent].tree }; const changed = {};
      tree.tree.forEach(entry => { next[entry.path] = blobs[entry.sha]; changed[entry.path] = true; });
      repo.commits[id] = { tree: next, parent, changed, message: body.message };
      return json(201, { sha: id });
    }
    if (p.startsWith('/pulls') && method === 'GET') return json(200, repo.pulls);
    if (p === '/pulls' && method === 'POST') { const pr = { number: ++repo.n, title: body.title, html_url: `https://github.com/pr/${repo.n}`, head: { sha: repo.refs[body.head] } }; repo.pulls.push(pr); return json(201, pr); }
    if ((m = p.match(/^\/pulls\/(\d+)\/merge$/))) { repo.refs.main = body.sha; repo.pulls = []; return json(200, { sha: body.sha }); }
    throw new Error(`unmocked ${method} ${url}`);
  };

  async function call(action, extra = {}, auth = 'dev', origin) {
    const req = { method: 'POST', headers: { host: 'www.watchdogindex.com', authorization: `Bearer ${auth}`, ...(origin ? { origin } : {}) }, body: { action, ...extra } };
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b ? JSON.parse(b) : null; } };
    await handler(req, res);
    return res;
  }

  process.env.SITE_EDITOR_GITHUB_TOKEN = '';
  assert.equal((await call('session')).body.configured, false, 'session works before the token is configured');
  assert.equal((await call('source', { pathname: '/pro' })).statusCode, 503, 'GitHub actions fail closed without a token');
  process.env.SITE_EDITOR_GITHUB_TOKEN = 'test-token';

  assert.equal((await call('session', {}, 'nobody')).statusCode, 401, 'signed-out users are refused');
  assert.equal((await call('session', {}, 'user')).statusCode, 403, 'non-developers are refused');
  assert.equal((await call('session', {}, 'dev', 'https://evil.example')).statusCode, 403, 'cross-origin calls are refused');
  process.env.SITE_EDITOR_ALLOWED_EMAILS = 'someone-else@example.com';
  assert.equal((await call('session')).statusCode, 403, 'the optional email allowlist is enforced');
  delete process.env.SITE_EDITOR_ALLOWED_EMAILS;

  const source = await call('source', { pathname: '/pro' });
  assert.equal(source.statusCode, 200);
  assert.equal(source.body.file, 'property/pro/index.html');
  assert.equal(repo.refs['site-editor/draft'], undefined, 'opening the editor does not create a branch');

  const edit = { index: 3, tag: 'h1', text: 'Hello there', kind: 'content', html: 'Hello Watchdog' };
  const stale = await call('save', { pathname: '/pro', file: source.body.file, sha: 'old', edits: [edit] });
  assert.equal(stale.statusCode, 409, 'saving against a stale file sha is refused');

  const saved = await call('save', { pathname: '/pro', pageUrl: 'https://www.watchdogindex.com/pro', file: source.body.file, sha: source.body.sha, edits: [edit] });
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
  assert.equal(repo.refs.main, 'c0', 'saving never touches main');
  assert.ok(repo.commits[repo.refs['site-editor/draft']].tree['property/pro/index.html'].includes('<h1>Hello Watchdog</h1>'), 'draft branch holds the edit');
  assert.match(repo.commits[repo.refs['site-editor/draft']].message, /^Site editor: update property\/pro\/index\.html/);

  const again = await call('source', { pathname: '/pro' });
  assert.ok(again.body.html.includes('Hello Watchdog') && again.body.mainHtml.includes('Hello there'), 'editor reopens on the draft and knows the published version');

  const published = await call('publish');
  assert.equal(published.body.merged, true, JSON.stringify(published.body));
  assert.ok(repo.commits[repo.refs.main].tree['property/pro/index.html'].includes('Hello Watchdog'), 'publish merges into main');
  assert.equal(repo.refs['site-editor/draft'], undefined, 'draft branch is removed after publish');
  assert.equal((await call('publish')).body.merged, false, 'nothing left to publish');
}

console.log('site editor handler flow passed');
