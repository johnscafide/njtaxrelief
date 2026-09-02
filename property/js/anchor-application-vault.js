(function () {
  'use strict';

  var DB_NAME = 'watchdog-private-vault';
  var STORE_NAME = 'keys';
  var KEY_SLOT = 'anchor-v1';
  var BUCKET = 'anchor-application-vault';
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function assertCrypto() {
    if (!window.crypto || !window.crypto.subtle) throw new Error('Secure browser encryption is not available on this device.');
  }

  function bytesToB64(bytes) {
    var chunk = 0x8000;
    var binary = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }

  function b64ToBytes(value) {
    var binary = atob(String(value || ''));
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function bytesToB64Url(bytes) {
    return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function b64UrlToBytes(value) {
    var normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    return b64ToBytes(normalized);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  async function sha256Bytes(bytes) {
    assertCrypto();
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  }

  async function fingerprint(rawKey) {
    return bytesToHex(await sha256Bytes(rawKey));
  }

  function formatRecoveryKey(rawKey) {
    var encoded = bytesToB64Url(rawKey);
    return 'WDV1-' + (encoded.match(/.{1,6}/g) || []).join('-');
  }

  function parseRecoveryKey(value) {
    var compact = String(value || '').trim().replace(/^WDV1-/i, '').replace(/[\s-]/g, '');
    var bytes = b64UrlToBytes(compact);
    if (bytes.length !== 32) throw new Error('That Private Vault recovery key is not valid.');
    return bytes;
  }

  function generateKey() {
    assertCrypto();
    var key = new Uint8Array(32);
    crypto.getRandomValues(key);
    return key;
  }

  async function importAesKey(rawKey) {
    assertCrypto();
    return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  function makeIv() {
    var iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    return iv;
  }

  function aadFor(userId, applicationId, taxYear, kind, documentId) {
    var parts = ['watchdog-anchor-v1', userId, applicationId, String(taxYear), kind];
    if (documentId) parts.push(documentId);
    return enc.encode(parts.join('|'));
  }

  async function encrypt(rawKey, plaintextBytes, aad) {
    var key = await importAesKey(rawKey);
    var iv = makeIv();
    var cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad, tagLength: 128 }, key, plaintextBytes));
    return { iv: iv, cipher: cipher, sha256: bytesToHex(await sha256Bytes(cipher)) };
  }

  async function decrypt(rawKey, cipherBytes, iv, aad) {
    var key = await importAesKey(rawKey);
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, additionalData: aad, tagLength: 128 }, key, cipherBytes));
    } catch (_) {
      throw new Error('Watchdog could not unlock this application. Check your Private Vault recovery key.');
    }
  }

  function openKeyDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('Secure device storage is not available.'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
      };
      req.onerror = function () { reject(req.error || new Error('Could not open device vault.')); };
      req.onsuccess = function () { resolve(req.result); };
    });
  }

  async function rememberKey(rawKey) {
    var db = await openKeyDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bytesToB64Url(rawKey), KEY_SLOT);
      tx.oncomplete = function () { db.close(); resolve(true); };
      tx.onerror = function () { db.close(); reject(tx.error || new Error('Could not remember Private Vault key.')); };
    });
  }

  async function forgetKey() {
    var db = await openKeyDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(KEY_SLOT);
      tx.oncomplete = function () { db.close(); resolve(true); };
      tx.onerror = function () { db.close(); reject(tx.error || new Error('Could not forget Private Vault key.')); };
    });
  }

  async function getRememberedKey() {
    try {
      var db = await openKeyDb();
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var req = tx.objectStore(STORE_NAME).get(KEY_SLOT);
        req.onsuccess = function () {
          db.close();
          if (!req.result) return resolve(null);
          try { resolve(b64UrlToBytes(req.result)); } catch (e) { reject(e); }
        };
        req.onerror = function () { db.close(); reject(req.error || new Error('Could not read Private Vault key.')); };
      });
    } catch (_) {
      return null;
    }
  }

  function supabaseClient() {
    if (!window.NJPTRSupabaseRuntime) throw new Error('Watchdog account services are unavailable.');
    return window.NJPTRSupabaseRuntime.createClient();
  }

  async function getUser() {
    var db = supabaseClient();
    var result = await db.auth.getUser();
    if (result.error) throw result.error;
    return result.data && result.data.user ? result.data.user : null;
  }

  async function registerVaultKey(db, user, rawKey) {
    var fp = await fingerprint(rawKey);
    var existing = await db.from('anchor_application_vault_keys')
      .select('id,key_fingerprint,status')
      .eq('user_id', user.id)
      .eq('key_fingerprint', fp)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;

    var id = crypto.randomUUID();
    var inserted = await db.from('anchor_application_vault_keys').insert({
      id: id,
      user_id: user.id,
      key_fingerprint: fp,
      crypto_version: 1,
      status: 'active'
    }).select('id,key_fingerprint,status').single();
    if (inserted.error) throw inserted.error;
    return inserted.data;
  }

  async function saveApplication(options) {
    var db = options.db || supabaseClient();
    var user = options.user || await getUser();
    if (!user) throw new Error('Sign in to save this application to your Watchdog account.');
    var applicationId = options.applicationId || crypto.randomUUID();
    var taxYear = Number(options.taxYear || 2025);
    var vaultKey = await registerVaultKey(db, user, options.rawKey);
    var plaintext = enc.encode(JSON.stringify(options.payload || {}));
    var sealed = await encrypt(options.rawKey, plaintext, aadFor(user.id, applicationId, taxYear, 'answers'));
    var row = {
      id: applicationId,
      user_id: user.id,
      tax_year: taxYear,
      status: options.status || 'ready',
      schema_version: options.schemaVersion || '2025.1',
      vault_key_id: vaultKey.id,
      answers_ciphertext_b64: bytesToB64(sealed.cipher),
      answers_iv_b64: bytesToB64(sealed.iv),
      answers_cipher_sha256: sealed.sha256,
      crypto_algorithm: 'AES-256-GCM',
      generated_at: options.generatedAt || null
    };
    var result = await db.from('anchor_applications').upsert(row, { onConflict: 'id' }).select('*').single();
    if (result.error) throw result.error;
    return { row: result.data, vaultKey: vaultKey, rawKey: options.rawKey };
  }

  async function decryptApplication(row, rawKey) {
    var cipher = b64ToBytes(row.answers_ciphertext_b64);
    var iv = b64ToBytes(row.answers_iv_b64);
    var plain = await decrypt(rawKey, cipher, iv, aadFor(row.user_id, row.id, row.tax_year, 'answers'));
    return JSON.parse(dec.decode(plain));
  }

  async function savePdf(options) {
    var db = options.db || supabaseClient();
    var user = options.user || await getUser();
    if (!user) throw new Error('Sign in to save this PDF to your Watchdog account.');
    var documentId = crypto.randomUUID();
    var bytes = options.pdfBytes instanceof Uint8Array ? options.pdfBytes : new Uint8Array(options.pdfBytes);
    var sealed = await encrypt(
      options.rawKey,
      bytes,
      aadFor(user.id, options.applicationId, Number(options.taxYear || 2025), 'pdf', documentId)
    );
    var path = ['user', user.id, String(options.taxYear || 2025), options.applicationId, documentId + '.pdf.enc'].join('/');
    var upload = await db.storage.from(BUCKET).upload(path, sealed.cipher, {
      contentType: 'application/octet-stream',
      upsert: false,
      cacheControl: '0'
    });
    if (upload.error) throw upload.error;
    var meta = await db.from('anchor_application_documents').insert({
      id: documentId,
      application_id: options.applicationId,
      user_id: user.id,
      storage_path: path,
      document_kind: 'application_pdf',
      cipher_iv_b64: bytesToB64(sealed.iv),
      cipher_sha256: sealed.sha256,
      cipher_bytes: sealed.cipher.byteLength,
      crypto_algorithm: 'AES-256-GCM',
      template_sha256: options.templateSha256 || null
    }).select('*').single();
    if (meta.error) {
      await db.storage.from(BUCKET).remove([path]);
      throw meta.error;
    }
    return meta.data;
  }

  async function loadPdf(options) {
    var db = options.db || supabaseClient();
    var download = await db.storage.from(BUCKET).download(options.document.storage_path);
    if (download.error) throw download.error;
    var cipher = new Uint8Array(await download.data.arrayBuffer());
    var sha = bytesToHex(await sha256Bytes(cipher));
    if (sha !== options.document.cipher_sha256) throw new Error('The encrypted application file failed its integrity check.');
    return decrypt(
      options.rawKey,
      cipher,
      b64ToBytes(options.document.cipher_iv_b64),
      aadFor(options.userId, options.applicationId, Number(options.taxYear || 2025), 'pdf', options.document.id)
    );
  }

  async function listApplications() {
    var db = supabaseClient();
    var user = await getUser();
    if (!user) return { user: null, applications: [] };
    var result = await db.from('anchor_applications')
      .select('id,user_id,tax_year,status,schema_version,vault_key_id,answers_ciphertext_b64,answers_iv_b64,answers_cipher_sha256,crypto_algorithm,created_at,updated_at,generated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    return { user: user, applications: result.data || [], db: db };
  }

  async function listDocuments(applicationId) {
    var db = supabaseClient();
    var result = await db.from('anchor_application_documents')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function deleteApplication(applicationId) {
    var db = supabaseClient();
    var docs = await listDocuments(applicationId);
    if (docs.length) {
      var paths = docs.map(function (d) { return d.storage_path; });
      var removed = await db.storage.from(BUCKET).remove(paths);
      if (removed.error) throw removed.error;
    }
    var result = await db.from('anchor_applications').delete().eq('id', applicationId);
    if (result.error) throw result.error;
    return true;
  }

  window.WatchdogAnchorVault = Object.freeze({
    generateKey: generateKey,
    formatRecoveryKey: formatRecoveryKey,
    parseRecoveryKey: parseRecoveryKey,
    fingerprint: fingerprint,
    rememberKey: rememberKey,
    forgetKey: forgetKey,
    getRememberedKey: getRememberedKey,
    getUser: getUser,
    supabaseClient: supabaseClient,
    saveApplication: saveApplication,
    decryptApplication: decryptApplication,
    savePdf: savePdf,
    loadPdf: loadPdf,
    listApplications: listApplications,
    listDocuments: listDocuments,
    deleteApplication: deleteApplication,
    bytesToB64Url: bytesToB64Url,
    b64UrlToBytes: b64UrlToBytes,
    sha256Hex: async function (bytes) { return bytesToHex(await sha256Bytes(bytes)); }
  });
})();
