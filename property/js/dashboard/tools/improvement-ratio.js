/* Lazy dashboard module: improvement-ratio. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolImprovementRatio(r) {
    var id = 'ir-' + String(r.pams_pin || 'x').replace(/[^\w]/g, '');
    townProfile(r).then(function (t) {
      var host = el(id);
      if (!host) return;
      if (!t) {
        host.innerHTML = '<div class="tl-note">Not enough parcel records came back for ' +
          esc(r.town || 'this town') + ' to compare the split.</div>';
        return;
      }
      if (!t.subject) {
        host.innerHTML = '<div class="tl-note">This parcel was not in the sample returned for ' +
          esc(r.town || 'this town') + ', so its own land and improvement split is not available. ' +
          'Homes here are assessed at a median of <b>' + (t.medShare * 100).toFixed(1) +
          '%</b> improvement, <b>' + ((1 - t.medShare) * 100).toFixed(1) + '%</b> land.</div>';
        return;
      }

      var s = t.subject;
      // peers matched on vintage and lot, because a new build on a small lot
      // legitimately carries a higher improvement share than an old ranch on
      // an acre, and comparing across that is meaningless
      var peers = t.resid.filter(function (x) {
        if (s.built && x.built && Math.abs(x.built - s.built) > 20) return false;
        if (s.acres && x.acres && (x.acres < s.acres * 0.5 || x.acres > s.acres * 2)) return false;
        return true;
      });
      if (peers.length < 15) peers = t.resid;
      var peerShare = median(peers.map(function (x) { return x.share; }));
      var peerImp = median(peers.map(function (x) { return x.imp; }));
      var peerLand = median(peers.map(function (x) { return x.land; }));

      var gap = s.share - peerShare;
      var impGap = s.imp - peerImp;
      var landGap = s.land - peerLand;
      var high = gap > 0.06;
      var low = gap < -0.06;

      // where the excess sits, which is the actually useful part
      var totalGap = (s.land + s.imp) - (peerLand + peerImp);
      var fromImp = totalGap !== 0 ? impGap / totalGap : null;

      host.innerHTML =
        '<div class="ir-split">' +
          '<div class="ir-row"><span>This property</span>' +
            '<div class="ir-bar"><i class="land" style="width:' + ((1 - s.share) * 100).toFixed(1) + '%">' +
              '</i><i class="imp" style="width:' + (s.share * 100).toFixed(1) + '%"></i></div>' +
            '<b>' + (s.share * 100).toFixed(1) + '%</b></div>' +
          '<div class="ir-row"><span>' + peers.length + ' comparable homes</span>' +
            '<div class="ir-bar"><i class="land" style="width:' + ((1 - peerShare) * 100).toFixed(1) + '%">' +
              '</i><i class="imp" style="width:' + (peerShare * 100).toFixed(1) + '%"></i></div>' +
            '<b>' + (peerShare * 100).toFixed(1) + '%</b></div>' +
          '<div class="ir-key"><span class="k land"></span>land' +
            '<span class="k imp"></span>building</div>' +
        '</div>' +

        '<dl class="fig tight">' +
          f('Land', money(s.land), 'peers ' + money(peerLand)) +
          f('Building', money(s.imp), 'peers ' + money(peerImp), high ? 'neg' : '') +
          f('Building share', (s.share * 100).toFixed(1) + '%',
            (gap >= 0 ? '+' : '') + (gap * 100).toFixed(1) + ' points vs peers',
            high ? 'neg' : low ? 'pos' : '') +
        '</dl>' +

        (high
          ? '<div class="ir-say bad"><i class="fas fa-hammer"></i><div>' +
            '<b>The excess is in the building, which is the arguable half.</b> This property carries a ' +
            'building share <b>' + (gap * 100).toFixed(1) + ' points</b> above comparable homes here' +
            (landGap < 0 && impGap > 0
              ? ', and its land is assessed <b>below</b> peers while its building sits <b>' +
                money(Math.abs(impGap)) + '</b> above. Every dollar of the difference is in the structure'
              : fromImp != null && fromImp > 0.6 && fromImp <= 1 && totalGap > 0
              ? ', and <b>' + Math.round(fromImp * 100) + '%</b> of its total excess over peers sits in the ' +
                'improvement figure rather than the land' : '') +
            '. Land value is set by location and lot size and is very hard to contest, because the lot next ' +
            'door is worth what yours is. The improvement figure is a judgment about a structure, and judgment ' +
            'is what an appeal contests. Condition, an unfinished basement counted as finished, or square ' +
            'footage recorded wrong all show up here.</div></div>'
          : low
          ? '<div class="ir-say good"><i class="fas fa-circle-check"></i><div>' +
            'The building carries a <b>smaller</b> share here than in comparable homes, ' +
            (gap * 100).toFixed(1) + ' points below. Whatever is happening with this assessment, the structure ' +
            'is not where it is concentrated.</div></div>'
          : '<div class="ir-say"><i class="fas fa-scale-balanced"></i><div>' +
            'The land and building split tracks comparable homes closely, within ' +
            Math.abs(gap * 100).toFixed(1) + ' points. Nothing in the composition of this assessment stands ' +
            'out either way.</div></div>');
    });

    return toolCard('Land and building split', 'fa-layer-group',
      '<p class="tl-p">Every assessment is two numbers. <b>Land</b> is set by location and lot size, and it is ' +
      'very hard to argue with. <b>The building</b> is the assessor\u2019s judgment about a structure, and ' +
      'judgment is what an appeal actually contests. Where a property carries its excess decides how winnable ' +
      'a case is.</p>' +
      '<div id="' + id + '"><div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
      '<div>Comparing against parcels in ' + esc(r.town || 'this town') + '...</div></div></div>' +
      '<div class="tl-fine">Both figures come from the same municipal assessment roll, so this compares like ' +
      'with like and involves no market value estimate. Peers are matched on vintage within twenty years and ' +
      'lot size within a factor of two, because a new build on a small lot legitimately carries a higher ' +
      'building share than an old house on an acre. A high share is a reason to look, not proof of anything.</div>');
  }

  // ══════════════════════════════════════════════
  // 11 · CLASS MIX
  //
  // Who actually pays for a town. A municipality with a thin commercial base
  // funds its budget almost entirely from houses, and that is a structural
  // condition rather than a bad year. It also predicts the future: a town at
  // 95% residential has nowhere to turn when costs rise except the homeowners.
  // ══════════════════════════════════════════════

  Object.assign(window, { toolImprovementRatio });
})();

export {};
