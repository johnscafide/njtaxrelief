(function () {
  'use strict';

  var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  var PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var ready = {};

  function loadScript(src, key) {
    if (ready[key]) return ready[key];
    ready[key] = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-wd-lib="' + key + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.wdLib = key;
      script.addEventListener('load', function () {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', function () {
        reject(new Error('Unable to load the print asset library.'));
      }, { once: true });
      document.head.appendChild(script);
    });
    return ready[key];
  }

  function portalUrl() {
    var el = document.getElementById('ac-vanity-url');
    var value = el ? String(el.textContent || '').trim() : '';
    return /^https:\/\/www\.watchdogindex\.com\/property\/agent\//.test(value) ? value : '';
  }

  function safeSlug(url) {
    try {
      var parsed = new URL(url);
      return (parsed.searchParams.get('slug') || parsed.pathname.split('/').filter(Boolean).pop() || 'agent-portal').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    } catch (_) {
      return 'agent-portal';
    }
  }

  function makeQrCanvas(url, size) {
    return loadScript(QR_LIB, 'qrcode').then(function () {
      if (!window.QRCode) throw new Error('QR generator did not initialize.');
      var host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '-99999px';
      host.style.top = '0';
      document.body.appendChild(host);
      new window.QRCode(host, {
        text: url,
        width: size,
        height: size,
        colorDark: '#0b1f2a',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      var canvas = host.querySelector('canvas');
      if (!canvas) {
        host.remove();
        throw new Error('QR image could not be rendered.');
      }
      var copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      host.remove();
      return copy;
    });
  }

  function downloadBlob(blob, filename) {
    var href = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
  }

  function setMessage(message, kind) {
    var el = document.getElementById('ac-qr-note');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'ac-qr-note' + (kind ? ' ' + kind : '');
  }

  async function downloadPng(url) {
    setMessage('Building print-resolution QR PNG…');
    var canvas = await makeQrCanvas(url, 1800);
    await new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('PNG export failed.'));
        downloadBlob(blob, 'watchdog-agent-portal-' + safeSlug(url) + '-qr.png');
        resolve();
      }, 'image/png');
    });
    setMessage('Downloaded a 1800×1800 PNG suitable for print layouts.', 'ok');
  }

  async function downloadPdf(url) {
    setMessage('Building print-ready PDF sign…');
    var canvas = await makeQrCanvas(url, 1800);
    await loadScript(PDF_LIB, 'jspdf');
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF generator did not initialize.');

    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter', compress: true });
    var navy = [11, 31, 42];
    var gold = [184, 151, 42];
    var qr = canvas.toDataURL('image/png');

    pdf.setFillColor(navy[0], navy[1], navy[2]);
    pdf.rect(0, 0, 8.5, 1.35, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text('WATCHDOG', 0.6, 0.7);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.5);
    pdf.text('New Jersey property intelligence', 0.6, 1.02);

    pdf.setTextColor(navy[0], navy[1], navy[2]);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(25);
    pdf.text('Scan to check a New Jersey property', 4.25, 2.05, { align: 'center', maxWidth: 7.2 });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12.5);
    pdf.setTextColor(80, 93, 103);
    pdf.text('Open the branded Watchdog property portal, search an address, and review governed public-record intelligence.', 4.25, 2.62, { align: 'center', maxWidth: 6.7 });

    pdf.setDrawColor(gold[0], gold[1], gold[2]);
    pdf.setLineWidth(0.05);
    pdf.roundedRect(2.17, 3.05, 4.16, 4.16, 0.12, 0.12, 'S');
    pdf.addImage(qr, 'PNG', 2.35, 3.23, 3.8, 3.8, undefined, 'FAST');

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(navy[0], navy[1], navy[2]);
    pdf.setFontSize(12);
    pdf.text(url, 4.25, 7.7, { align: 'center', maxWidth: 7.2 });
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(98, 113, 125);
    pdf.setFontSize(9.5);
    pdf.text('Property intelligence is informational and based on governed public-record data. It is not legal, tax, appraisal, lending, or appeal-outcome advice.', 4.25, 9.65, { align: 'center', maxWidth: 6.9 });
    pdf.setTextColor(130, 140, 148);
    pdf.setFontSize(8.5);
    pdf.text('Generated from the signed-in professional\'s active Watchdog Agent+ vanity portal.', 4.25, 10.05, { align: 'center', maxWidth: 6.9 });

    pdf.save('watchdog-agent-portal-' + safeSlug(url) + '-sign.pdf');
    setMessage('Downloaded a US Letter PDF sign with a print-resolution QR code.', 'ok');
  }

  function injectStyles() {
    if (document.getElementById('wd-agent-qr-style')) return;
    var style = document.createElement('style');
    style.id = 'wd-agent-qr-style';
    style.textContent = [
      '.ac-qr-tools{margin-top:14px;padding-top:14px;border-top:1px solid var(--border,#d9e0e8)}',
      '.ac-qr-tools strong{display:block;font-size:var(--type-sm,14px);color:var(--text,#17202b)}',
      '.ac-qr-tools p{margin:5px 0 10px;font-size:var(--type-xs,12px);line-height:1.5;color:var(--text-muted,#65717f)}',
      '.ac-qr-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.ac-qr-actions button{border:1px solid var(--border,#d9e0e8);border-radius:var(--radius-sm,10px);padding:10px 12px;background:var(--surface,#fff);color:var(--text,#17202b);font:700 var(--type-xs,12px)/1 var(--font-ui,Inter,sans-serif);cursor:pointer}',
      '.ac-qr-actions button:disabled{opacity:.45;cursor:not-allowed}',
      '.ac-qr-note{display:block;min-height:18px;margin-top:8px;font-size:var(--type-xs,12px);color:var(--text-muted,#65717f)}',
      '.ac-qr-note.ok{color:#087a68}.ac-qr-note.error{color:#a93636}'
    ].join('');
    document.head.appendChild(style);
  }

  function mount() {
    var preview = document.querySelector('.ac-vanity-preview');
    if (!preview || document.getElementById('ac-qr-tools')) return false;
    injectStyles();

    var box = document.createElement('div');
    box.id = 'ac-qr-tools';
    box.className = 'ac-qr-tools';
    box.innerHTML = '<strong>Print & share</strong><p>Create a high-resolution QR image for flyers or download a US Letter PDF sign. Assets are generated locally in your browser from the public portal URL.</p><div class="ac-qr-actions"><button id="ac-qr-png" type="button">Download QR PNG</button><button id="ac-qr-pdf" type="button">Download PDF sign</button></div><small id="ac-qr-note" class="ac-qr-note" aria-live="polite"></small>';
    preview.appendChild(box);

    var png = document.getElementById('ac-qr-png');
    var pdf = document.getElementById('ac-qr-pdf');
    var urlEl = document.getElementById('ac-vanity-url');

    function sync() {
      var enabled = !!portalUrl();
      png.disabled = !enabled;
      pdf.disabled = !enabled;
      if (!enabled) setMessage('Reserve an Agent+ portal address before creating print assets.');
      else setMessage('Ready to generate assets for ' + portalUrl() + '.');
    }

    png.addEventListener('click', function () {
      var url = portalUrl();
      if (!url) return sync();
      png.disabled = true;
      pdf.disabled = true;
      downloadPng(url).catch(function (err) { setMessage(err.message || 'Unable to create PNG.', 'error'); }).finally(sync);
    });

    pdf.addEventListener('click', function () {
      var url = portalUrl();
      if (!url) return sync();
      png.disabled = true;
      pdf.disabled = true;
      downloadPdf(url).catch(function (err) { setMessage(err.message || 'Unable to create PDF.', 'error'); }).finally(sync);
    });

    if (urlEl && window.MutationObserver) new MutationObserver(sync).observe(urlEl, { childList: true, characterData: true, subtree: true });
    sync();
    return true;
  }

  function boot() {
    if (mount()) return;
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (mount() || attempts > 150) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();