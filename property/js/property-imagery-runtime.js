/* Watchdog property imagery runtime
 * Free-first hierarchy:
 * 1) homeowner first-party cover photo
 * 2) Mapillary/KartaView street-level imagery when available
 * 3) NJGIN statewide aerial orthophotography
 * 4) Google Street View only through a future explicit user action
 */
(function () {
  'use strict';
  if (window.__WATCHDOG_PROPERTY_IMAGERY__) return;
  window.__WATCHDOG_PROPERTY_IMAGERY__ = true;

  var BUCKET = 'property-photos';
  var LICENSE_VERSION = 'watchdog-photo-contribution-v1-2026-08-24';
  var NJ_AERIAL = 'https://maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/export';
  var MAX_UPLOAD = 10 * 1024 * 1024;
  var MAX_EDGE = 1800;
  var client = null;
  var hydrateSeq = 0;

  function q(sel, root) { return (root || document).querySelector(sel); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function validCoord(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 38.8 && lat <= 41.4 && lon >= -75.7 && lon <= -73.8;
  }
  function aerialUrl(lat, lon, width, height) {
    lat = Number(lat); lon = Number(lon);
    if (!validCoord(lat, lon)) return '';
    var dx = .00145, dy = .001;
    return NJ_AERIAL + '?' + new URLSearchParams({
      bbox: [lon - dx, lat - dy, lon + dx, lat + dy].join(','),
      bboxSR: '4326', imageSR: '3857', size: (width || 760) + ',' + (height || 460),
      format: 'jpg', transparent: 'false', f: 'image'
    }).toString();
  }
  function rewriteWorldImagery(value) {
    value = String(value || '');
    if (value.indexOf('services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export') < 0) return value;
    var idx = value.indexOf('?');
    return NJ_AERIAL + (idx >= 0 ? value.slice(idx) : '');
  }
  function getClient() {
    if (client) return client;
    try {
      if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') {
        client = window.NJPTRSupabaseRuntime.createClient();
      }
    } catch (_error) {}
    return client;
  }
  function toast(message) {
    var existing = document.getElementById('pl-toast');
    if (existing) {
      existing.textContent = message;
      existing.style.display = 'block';
      clearTimeout(window.__wdPhotoToast);
      window.__wdPhotoToast = setTimeout(function () { existing.style.display = 'none'; }, 2800);
      return;
    }
    var node = document.createElement('div');
    node.className = 'wd-photo-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () { node.remove(); }, 2800);
  }

  function installStyles() {
    if (document.getElementById('watchdog-property-imagery-style')) return;
    var style = document.createElement('style');
    style.id = 'watchdog-property-imagery-style';
    style.textContent =
      '.hm-shot{position:relative!important;background-color:#eaf0f6;background-size:cover!important;background-position:center!important}' +
      '.wd-image-source{position:absolute;left:12px;bottom:12px;z-index:3;display:inline-flex;align-items:center;gap:6px;max-width:calc(100% - 24px);padding:6px 9px;border-radius:999px;background:rgba(12,25,48,.78);color:#fff!important;font:700 10px/1.2 Inter,system-ui,sans-serif;text-decoration:none!important;backdrop-filter:blur(8px)}' +
      '.wd-image-source i{font-size:9px}.wd-photo-add{position:absolute;right:12px;top:12px;z-index:4;display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 12px;border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#172a4d;font:800 11px Inter,system-ui,sans-serif;box-shadow:0 8px 22px rgba(17,36,67,.18);cursor:pointer}' +
      '.wd-photo-add:hover{transform:translateY(-1px)}' +
      '.wd-photo-overlay{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:18px;background:rgba(8,18,38,.58);backdrop-filter:blur(8px)}' +
      '.wd-photo-modal{width:min(620px,100%);max-height:min(780px,92vh);overflow:auto;border-radius:24px;background:#fff;box-shadow:0 30px 90px rgba(8,18,38,.28);font-family:Inter,system-ui,sans-serif}' +
      '.wd-photo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:24px 24px 16px}.wd-photo-head h2{margin:0;color:#111d38;font:800 24px/1.1 "Plus Jakarta Sans",Inter,sans-serif;letter-spacing:-.03em}.wd-photo-head p{margin:7px 0 0;color:#6d7b90;font-size:13px;line-height:1.5}.wd-photo-close{width:38px;height:38px;border:0;border-radius:50%;background:#eef2f7;color:#263a5e;cursor:pointer}' +
      '.wd-photo-form{padding:0 24px 24px}.wd-photo-drop{display:block;padding:24px;border:1.5px dashed #b9c7d8;border-radius:18px;background:#f8fafc;text-align:center;cursor:pointer}.wd-photo-drop i{display:block;margin-bottom:9px;color:#2f6df6;font-size:30px}.wd-photo-drop b{display:block;color:#162846;font-size:15px}.wd-photo-drop span{display:block;margin-top:5px;color:#718097;font-size:12px}.wd-photo-drop input{position:absolute;opacity:0;pointer-events:none}' +
      '.wd-photo-file{margin:10px 0 0;color:#52627a;font-size:12px;min-height:18px}.wd-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.wd-photo-field label{display:block;margin:0 0 7px;color:#263b5e;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.wd-photo-field select{width:100%;min-height:44px;padding:0 12px;border:1px solid #dce3ed;border-radius:11px;background:#fff;color:#172944;font:600 13px Inter,system-ui,sans-serif}' +
      '.wd-photo-check{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:13px;border-radius:13px;background:#f6f8fb;color:#334660;font-size:12.5px;line-height:1.45}.wd-photo-check input{margin-top:2px}.wd-photo-check strong{display:block;color:#132745;margin-bottom:2px}.wd-photo-check small{display:block;color:#718097;line-height:1.45}.wd-photo-check.disabled{opacity:.6}' +
      '.wd-photo-privacy{margin-top:16px;padding:13px 14px;border-radius:13px;background:#eef5ff;color:#435673;font-size:11.5px;line-height:1.5}.wd-photo-privacy b{color:#183b84}.wd-photo-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.wd-photo-actions button{min-height:44px;padding:0 17px;border-radius:11px;font:800 13px Inter,system-ui,sans-serif;cursor:pointer}.wd-photo-cancel{border:1px solid #dce3ed;background:#fff;color:#42536d}.wd-photo-save{border:0;background:#2f6df6;color:#fff}.wd-photo-save:disabled{opacity:.55;cursor:wait}' +
      '.wd-photo-toast{position:fixed;left:50%;bottom:24px;z-index:13000;transform:translateX(-50%);padding:11px 16px;border-radius:999px;background:#142b4e;color:#fff;font:700 12px Inter,system-ui,sans-serif;box-shadow:0 10px 34px rgba(14,34,72,.28)}' +
      '@media(max-width:620px){.wd-photo-grid{grid-template-columns:1fr}.wd-photo-modal{border-radius:20px}.wd-photo-head,.wd-photo-form{padding-left:18px;padding-right:18px}.wd-photo-add{min-height:34px;padding:0 10px;font-size:10px}.wd-image-source{font-size:9px}}';
    document.head.appendChild(style);
  }

  function setSource(hero, label, url) {
    var old = q('.wd-image-source', hero);
    if (old) old.remove();
    var tag = document.createElement(url ? 'a' : 'span');
    tag.className = 'wd-image-source';
    tag.innerHTML = '<i class="fas fa-camera"></i><span>' + esc(label) + '</span>';
    if (url) { tag.href = url; tag.target = '_blank'; tag.rel = 'noopener noreferrer'; }
    hero.appendChild(tag);
  }
  function applyBackground(hero, url) {
    if (!hero || !url) return;
    hero.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
  }

  function findCurrentProperty(address) {
    var sb = getClient();
    if (!sb || !address) return Promise.resolve(null);
    return sb.auth.getUser().then(function (result) {
      var user = result && result.data && result.data.user;
      if (!user) return null;
      return sb.from('saved_properties')
        .select('pams_pin,address,town,city,zip,lat,lon,kind,verified,verify_level')
        .eq('user_id', user.id).eq('address', address).limit(1)
        .then(function (res) {
          var row = res && res.data && res.data[0];
          return row ? { user: user, property: row } : null;
        });
    }).catch(function () { return null; });
  }

  function loadPrimaryPhoto(sb, userId, pin) {
    return sb.from('property_photos')
      .select('id,storage_path,photo_type,visibility,moderation_status,is_primary,created_at')
      .eq('user_id', userId).eq('pams_pin', pin)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(1)
      .then(function (res) {
        var row = res && res.data && res.data[0];
        if (!row) return null;
        return sb.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600).then(function (signed) {
          var url = signed && signed.data && signed.data.signedUrl;
          return url ? { row: row, url: url } : null;
        });
      }).catch(function () { return null; });
  }

  function loadFreeImagery(property) {
    if (!validCoord(property.lat, property.lon)) return Promise.resolve(null);
    var url = '/api/property-imagery?lat=' + encodeURIComponent(property.lat) + '&lon=' + encodeURIComponent(property.lon) + '&street=1';
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('imagery unavailable');
      return r.json();
    }).catch(function () { return null; });
  }

  function addPhotoButton(hero, context) {
    if (!hero || !context || !context.property || context.property.kind !== 'home') return;
    var old = q('.wd-photo-add', hero);
    if (old) old.remove();
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'wd-photo-add';
    button.innerHTML = '<i class="fas fa-camera"></i><span>Add your photo</span>';
    button.addEventListener('click', function () { openPhotoModal(context); });
    hero.appendChild(button);
  }

  function hydrateHero(hero) {
    if (!hero) return;
    var addressNode = q('.hm-id h1');
    var address = addressNode ? addressNode.textContent.trim() : '';
    if (!address) return;
    if (hero.dataset.wdImageryAddress === address && hero.dataset.wdImageryDone === '1') return;
    hero.dataset.wdImageryAddress = address;
    hero.dataset.wdImageryDone = '0';
    hero.style.backgroundImage = 'none';
    setSource(hero, 'Loading property imagery…');
    var seq = ++hydrateSeq;

    findCurrentProperty(address).then(function (context) {
      if (seq !== hydrateSeq || !context || !context.property) return;
      var property = context.property;
      var sb = getClient();
      var aerial = aerialUrl(property.lat, property.lon, 760, 460);
      if (aerial) {
        applyBackground(hero, aerial);
        setSource(hero, 'NJ Office of GIS · 2020 aerial', 'https://www.nj.gov/njgin/edata/imagery/');
      }
      addPhotoButton(hero, context);
      return Promise.all([
        loadPrimaryPhoto(sb, context.user.id, property.pams_pin),
        loadFreeImagery(property)
      ]).then(function (results) {
        if (seq !== hydrateSeq) return;
        var own = results[0], free = results[1];
        if (own && own.url) {
          applyBackground(hero, own.url);
          setSource(hero, 'Your property photo');
        } else if (free && free.street && free.street.image_url) {
          applyBackground(hero, free.street.image_url);
          setSource(hero, free.street.attribution || (free.street.provider === 'mapillary' ? 'Mapillary' : 'KartaView'), free.street.source_url || '');
        } else if (free && free.aerial && free.aerial.image_url) {
          applyBackground(hero, free.aerial.image_url);
          setSource(hero, free.aerial.attribution || 'NJ Office of GIS · 2020 aerial', free.aerial.source_url || '');
        } else if (!aerial) {
          setSource(hero, 'Property imagery unavailable');
        }
        hero.dataset.wdImageryDone = '1';
      });
    }).catch(function () {
      setSource(hero, 'Property imagery unavailable');
    });
  }

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }
  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }
  function normalizeImage(file) {
    if (!file || ['image/jpeg','image/png','image/webp'].indexOf(file.type) < 0) return Promise.reject(new Error('Use a JPEG, PNG or WebP image'));
    if (file.size > MAX_UPLOAD) return Promise.reject(new Error('Photo must be under 10 MB'));
    return loadImageElement(file).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('Could not read image dimensions');
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(img, 0, 0, width, height);
      return canvasBlob(canvas, 'image/webp', .86).then(function (blob) {
        if (!blob) return canvasBlob(canvas, 'image/jpeg', .88);
        return blob;
      }).then(function (blob) {
        if (!blob) throw new Error('Could not prepare photo');
        return { blob: blob, width: width, height: height, contentType: blob.type || 'image/webp' };
      });
    });
  }

  function closePhotoModal() {
    var overlay = document.getElementById('wd-photo-overlay');
    if (overlay) overlay.remove();
  }
  function openPhotoModal(context) {
    closePhotoModal();
    var property = context.property;
    var verified = !!property.verified;
    var overlay = document.createElement('div');
    overlay.id = 'wd-photo-overlay';
    overlay.className = 'wd-photo-overlay';
    overlay.innerHTML =
      '<section class="wd-photo-modal" role="dialog" aria-modal="true" aria-labelledby="wd-photo-title">' +
        '<div class="wd-photo-head"><div><h2 id="wd-photo-title">Add your home photo</h2><p>Use your own image as the Property Home cover and, if you choose, help build Watchdog’s first-party New Jersey imagery library.</p></div><button class="wd-photo-close" type="button" aria-label="Close"><i class="fas fa-xmark"></i></button></div>' +
        '<form class="wd-photo-form" id="wd-photo-form">' +
          '<label class="wd-photo-drop"><input id="wd-photo-file" type="file" accept="image/jpeg,image/png,image/webp" required><i class="fas fa-camera"></i><b>Choose a property photo</b><span>JPEG, PNG or WebP · up to 10 MB</span></label>' +
          '<div class="wd-photo-file" id="wd-photo-file-name"></div>' +
          '<div class="wd-photo-grid"><div class="wd-photo-field"><label for="wd-photo-type">Photo type</label><select id="wd-photo-type"><option value="front_exterior">Front exterior</option><option value="side_exterior">Side exterior</option><option value="rear_exterior">Rear exterior</option><option value="yard">Yard</option><option value="renovation">Renovation / update</option><option value="other">Other</option></select></div></div>' +
          '<label class="wd-photo-check"><input id="wd-photo-primary" type="checkbox" checked><span><strong>Use as my Property Home cover</strong><small>This stays tied to your account and property.</small></span></label>' +
          '<label class="wd-photo-check' + (verified ? '' : ' disabled') + '"><input id="wd-photo-contribute" type="checkbox"' + (verified ? '' : ' disabled') + '><span><strong>Contribute this exterior photo to Watchdog</strong><small>' + (verified ? 'Optional. After review, Watchdog may use it in property imagery features. You keep ownership of your photo.' : 'Verify ownership first to contribute to the shared imagery library. Private cover-photo uploads still work now.') + '</small></span></label>' +
          '<div class="wd-photo-privacy"><b>Privacy by design:</b> Watchdog re-encodes the image before upload, removing EXIF/geolocation metadata. For shared contributions, use an exterior photo from your property or a public viewpoint and avoid people, license plates, mail, documents and security details.</div>' +
          '<div class="wd-photo-actions"><button class="wd-photo-cancel" type="button">Cancel</button><button class="wd-photo-save" id="wd-photo-save" type="submit">Save photo</button></div>' +
        '</form>' +
      '</section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) closePhotoModal(); });
    q('.wd-photo-close', overlay).addEventListener('click', closePhotoModal);
    q('.wd-photo-cancel', overlay).addEventListener('click', closePhotoModal);
    q('#wd-photo-file', overlay).addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      q('#wd-photo-file-name', overlay).textContent = file ? file.name + ' · ' + Math.max(.1, file.size / 1048576).toFixed(1) + ' MB' : '';
    });
    q('#wd-photo-form', overlay).addEventListener('submit', function (event) {
      event.preventDefault();
      savePhoto(context, overlay);
    });
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 3 | 8); return v.toString(16);
    });
  }
  function safePin(pin) { return String(pin || 'property').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 120); }
  function savePhoto(context, overlay) {
    var sb = getClient();
    if (!sb || !context || !context.user || !context.property) return;
    var fileInput = q('#wd-photo-file', overlay);
    var file = fileInput && fileInput.files && fileInput.files[0];
    var type = q('#wd-photo-type', overlay).value;
    var primary = q('#wd-photo-primary', overlay).checked;
    var contribute = q('#wd-photo-contribute', overlay).checked;
    if (!file) { toast('Choose a photo first'); return; }
    if (contribute && !context.property.verified) { toast('Verify ownership before contributing'); return; }
    if (contribute && ['front_exterior','side_exterior'].indexOf(type) < 0) { toast('Shared imagery must be a front or side exterior photo'); return; }
    var save = q('#wd-photo-save', overlay);
    save.disabled = true; save.textContent = 'Preparing photo…';

    normalizeImage(file).then(function (prepared) {
      save.textContent = 'Uploading…';
      var ext = prepared.contentType === 'image/jpeg' ? 'jpg' : 'webp';
      var path = 'user/' + context.user.id + '/' + safePin(context.property.pams_pin) + '/' + uuid() + '.' + ext;
      return sb.storage.from(BUCKET).upload(path, prepared.blob, { contentType: prepared.contentType, upsert: false, cacheControl: '3600' })
        .then(function (uploaded) {
          if (uploaded.error) throw uploaded.error;
          var now = new Date().toISOString();
          var row = {
            user_id: context.user.id,
            pams_pin: context.property.pams_pin,
            storage_path: path,
            photo_type: type,
            visibility: contribute ? 'contribution' : 'private',
            moderation_status: contribute ? 'pending' : 'private',
            source: 'homeowner_upload',
            is_primary: false,
            contributor_license_version: contribute ? LICENSE_VERSION : null,
            contributor_consented_at: contribute ? now : null,
            exif_stripped: true,
            normalized_width: prepared.width,
            normalized_height: prepared.height
          };
          return sb.from('property_photos').insert(row).select('id,storage_path').single().then(function (inserted) {
            if (inserted.error) {
              return sb.storage.from(BUCKET).remove([path]).then(function () { throw inserted.error; });
            }
            if (!primary) return inserted.data;
            return sb.from('property_photos').update({ is_primary: false }).eq('user_id', context.user.id).eq('pams_pin', context.property.pams_pin).neq('id', inserted.data.id)
              .then(function () { return sb.from('property_photos').update({ is_primary: true }).eq('id', inserted.data.id); })
              .then(function (result) { if (result && result.error) throw result.error; return inserted.data; });
          });
        });
    }).then(function () {
      closePhotoModal();
      toast(contribute ? 'Photo saved and queued for contribution review' : 'Property photo saved');
      var hero = q('.hm-shot');
      if (hero) { hero.dataset.wdImageryDone = '0'; hydrateHero(hero); }
    }).catch(function (error) {
      save.disabled = false; save.textContent = 'Save photo';
      toast(error && error.message ? error.message : 'Could not save photo');
    });
  }

  function scrubExisting(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('img'), function (img) {
      var src = img.getAttribute('src') || '';
      var fallback = img.getAttribute('data-fallback') || '';
      var nextSrc = rewriteWorldImagery(src), nextFallback = rewriteWorldImagery(fallback);
      if (nextSrc !== src) img.setAttribute('src', nextSrc);
      if (nextFallback !== fallback) img.setAttribute('data-fallback', nextFallback);
    });
    var hero = root.matches && root.matches('.hm-shot') ? root : q('.hm-shot', root);
    if (hero) setTimeout(function () { hydrateHero(hero); }, 0);
  }

  function boot() {
    installStyles();
    scrubExisting(document);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function (records) {
        records.forEach(function (record) {
          Array.prototype.forEach.call(record.addedNodes || [], function (node) {
            if (node && node.nodeType === 1) scrubExisting(node);
          });
        });
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  window.WatchdogPropertyImagery = {
    aerialUrl: aerialUrl,
    rewriteWorldImagery: rewriteWorldImagery,
    refresh: function () { var hero = q('.hm-shot'); if (hero) { hero.dataset.wdImageryDone = '0'; hydrateHero(hero); } },
    contributionLicenseVersion: LICENSE_VERSION
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
