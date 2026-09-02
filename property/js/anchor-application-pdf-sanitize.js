(function () {
  'use strict';

  var base = window.WatchdogAnchorPdf2025;
  if (!base || typeof base.generate !== 'function' || !window.PDFLib || !window.PDFLib.PDFDocument) return;

  async function generate(state) {
    var result = await base.generate(state);
    var doc = await PDFLib.PDFDocument.load(result.pdfBytes, { ignoreEncryption: false, updateMetadata: false });
    var annots = PDFLib.PDFName.of('Annots');

    // The official 2025 ANC-1 and PAS-1 templates contain only Widget annotations.
    // pdf-lib flattens the widgets into page content, but these State PDFs can retain
    // dangling page /Annots references afterward. Removing the now-obsolete annotation
    // arrays prevents malformed-xref warnings in strict PDF renderers without changing
    // the visible flattened form content.
    doc.getPages().forEach(function (page) {
      page.node.delete(annots);
    });

    var cleanBytes = new Uint8Array(await doc.save({
      useObjectStreams: false,
      addDefaultPage: false,
      updateFieldAppearances: false
    }));

    return Object.assign({}, result, { pdfBytes: cleanBytes });
  }

  window.WatchdogAnchorPdf2025 = Object.freeze({
    determineFormType: base.determineFormType,
    generate: generate
  });
})();