/* Watchdog proprietary: evidence quality for a property-tax appeal screen. */
(function(){
  'use strict';
  function clamp(v){return Math.max(0,Math.min(100,+v||0));}
  function calc(r){
    var c=typeof chapter123==='function'?chapter123(r):null,s=typeof sr1aFor==='function'?sr1aFor(r):null,u=typeof uniFor==='function'?uniFor(r):null,a=typeof appealFor==='function'?appealFor(r):null;
    var anchor=c&&c.testable?100:0;
    var margin=c&&c.testable&&r.assessed?clamp(Math.max(0,c.over)/(+r.assessed||1)*500):0;
    var depth=s?clamp((+s.n||0)/100*100):0;
    var uniform=u?clamp((+u.coefficient-10)/15*100):25;
    var prior=a&&a.latest?clamp(+a.latest.win_rate_filed||0):25;
    var complete=[r.pams_pin,r.assessed,r.last_year_tax,r.block,r.lot,(r._sqft||r.living_sqft),(r._lastSale||r.watchdog_value)].filter(Boolean).length/7*100;
    var parts=[['Independent value anchor',anchor,.25],['Chapter 123 margin',margin,.20],['Comparable evidence depth',depth,.18],['Uniformity context',uniform,.14],['County outcome context',prior,.10],['Record completeness',complete,.13]];
    var score=Math.round(parts.reduce(function(z,p){return z+p[1]*p[2];},0));
    return {score:score,band:score>=75?'Strong':score>=55?'Developing':score>=35?'Limited':'Weak',parts:parts,sample:s?s.n:0,testable:!!(c&&c.testable)};
  }
  function card(r){var v=calc(r);return toolCard('Appeal Evidence Strength','fa-scale-balanced','<p class="tl-p">This asks a different question from “might the assessment be high?” It scores whether the file currently contains enough independent, attributable evidence to support a serious appeal review.</p><div class="pci-hero"><div><b>'+v.score+'</b><span>/ 100 evidence</span></div><p><strong>'+v.band+' evidence file.</strong> '+(v.testable?'An independent value anchor is available for the Chapter 123 screen.':'The largest missing piece is an independent value anchor; the assessment-derived town ratio cannot prove its own appeal.')+'</p></div><div class="pci-grid">'+v.parts.map(function(p){return '<div><span>'+p[0]+'</span><b>'+Math.round(p[1])+'</b><i><em style="width:'+p[1]+'%"></em></i></div>';}).join('')+'</div><div class="tl-fine">Watchdog screening score, not legal advice or a probability of winning. Weights: independent anchor 25%, Chapter 123 margin 20%, comparable depth 18%, assessment uniformity 14%, county outcome context 10%, record completeness 13%. A professional should still select and verify actual comparable sales and filing evidence.</div>');}
  Object.assign(window,{appealEvidenceStrength:calc,toolAppealEvidenceStrength:card});
})();
export {};
