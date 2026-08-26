(function () {
  'use strict';

  var pagePath = (window.location.pathname || '').replace(/\/+$/, '');
  if (pagePath !== '/property' && pagePath !== '/property/index.html') return;

  var attempts = 0;
  function boot() {
    var section = document.querySelector('#wd-showcase .wds-rivals-section');
    if (!section) {
      attempts += 1;
      if (attempts < 80) window.setTimeout(boot, 75);
      return;
    }
    if (section.getAttribute('data-wd-compare-table') === '1') return;
    section.setAttribute('data-wd-compare-table', '1');

    var mortgageLabel = document.querySelector('#wd-showcase .wds-wow-card:nth-child(3) .wds-wow-role span');
    if (mortgageLabel) mortgageLabel.textContent = 'Mortgage & financial analysts';

    injectStyles();
    section.innerHTML = `
      <div class="wds-wrap">
        <div class="wds-cmp-shell">
          <div class="wds-cmp-title">
            <div>
              <h2>Watchdog vs.<br><em>the other guys.</em></h2>
              <p>Watchdog is built to be the most accurate, complete and actionable property data tool for New Jersey. Compare us with the national data brokers.</p>
            </div>
            <a href="/property/compare">Full vendor comparison <i class="fas fa-arrow-right"></i></a>
          </div>

          <div class="wds-cmp-table" role="table" aria-label="Watchdog compared with typical national property data platforms">
            <div class="wds-cmp-head" role="row">
              <div class="wds-cmp-label" role="columnheader">Capability</div>
              <div class="wds-cmp-us" role="columnheader"><i class="fas fa-dog"></i> Watchdog</div>
              <div class="wds-cmp-them" role="columnheader">Most data brokers</div>
            </div>

            <div class="wds-cmp-row" role="row"><span>Built for one state, in depth</span><b>New Jersey only</b><em>50 states, thin</em></div>
            <div class="wds-cmp-row" role="row"><span>Chapter 123 appeal math</span><b class="y"><i class="fas fa-check"></i></b><em class="n"><i class="fas fa-xmark"></i></em></div>
            <div class="wds-cmp-row" role="row"><span>State-verified SR-1A sales</span><b class="y"><i class="fas fa-check"></i></b><em class="n"><i class="fas fa-xmark"></i></em></div>
            <div class="wds-cmp-row" role="row"><span>Assessment uniformity &amp; revaluation risk</span><b class="y"><i class="fas fa-check"></i></b><em class="n"><i class="fas fa-xmark"></i></em></div>
            <div class="wds-cmp-row" role="row"><span>ANCHOR, Stay NJ &amp; Senior Freeze context</span><b class="y"><i class="fas fa-check"></i></b><em class="n"><i class="fas fa-xmark"></i></em></div>
            <div class="wds-cmp-row" role="row"><span>Every figure carries its source and date</span><b class="y"><i class="fas fa-check"></i></b><em>Varies</em></div>
            <div class="wds-cmp-row" role="row"><span>Sells homeowner contact data</span><b>Never</b><em>Core product</em></div>
            <div class="wds-cmp-row" role="row"><span>Skip tracing &amp; phone append</span><b>Not offered</b><em>Usually included</em></div>
            <div class="wds-cmp-row" role="row"><span>Predicts a homeowner's intent</span><b>No, facts only</b><em>“Motivation scores”</em></div>
            <div class="wds-cmp-row" role="row"><span>Free homeowner tier</span><b class="y"><i class="fas fa-check"></i></b><em class="n"><i class="fas fa-xmark"></i></em></div>
            <div class="wds-cmp-row" role="row"><span>Annual contract required</span><b>No</b><em>Often</em></div>
          </div>

          <div class="wds-cmp-foot">
            <div>
              <b>Different tools win different jobs.</b>
              <p>Watchdog is a New Jersey property intelligence tool, not a generic national lead list. We go deep on public assessment, tax and sales records, then connect the evidence to a decision or workflow.</p>
            </div>
            <div class="wds-cmp-vendors" aria-label="Detailed vendor comparisons">
              <a href="/property/compare/attom">ATTOM</a>
              <a href="/property/compare/batchdata">BatchData</a>
              <a href="/property/compare/propertyradar">PropertyRadar</a>
              <a href="/property/compare/propertyshark">PropertyShark</a>
              <a href="/property/compare/propstream">PropStream</a>
              <a href="/property/compare/regrid">Regrid</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function injectStyles() {
    if (document.getElementById('wd-compare-table-css')) return;
    var style = document.createElement('style');
    style.id = 'wd-compare-table-css';
    style.textContent = `
      #wd-showcase .wds-rivals-section{
        padding-top:112px;
        padding-bottom:126px;
      }
      #wd-showcase .wds-cmp-shell{
        background:#fff;
        border-radius:34px;
        overflow:hidden;
        box-shadow:0 16px 54px rgba(24,31,42,.065);
      }
      #wd-showcase .wds-cmp-title{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:36px;
        align-items:end;
        padding:56px 58px 38px;
        background:linear-gradient(145deg,#fff,#f5f8fa);
      }
      #wd-showcase .wds-cmp-title h2{
        margin:0;
        font:500 clamp(48px,5vw,76px)/.97 var(--font-ui);
        letter-spacing:-.062em;
      }
      #wd-showcase .wds-cmp-title h2 em{
        font-family:var(--font-display);
        font-weight:400;
        font-style:italic;
        letter-spacing:-.035em;
      }
      #wd-showcase .wds-cmp-title p{
        max-width:680px;
        margin:17px 0 0;
        color:#717a85;
        font-size:var(--type-md);
        line-height:1.52;
      }
      #wd-showcase .wds-cmp-title>a{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:13px 16px;
        border-radius:var(--radius-pill);
        background:#10294b;
        color:#fff!important;
        white-space:nowrap;
        font:800 var(--type-xs)/1 var(--font-ui);
      }
      #wd-showcase .wds-cmp-table{
        border-top:1px solid #eceff2;
        border-bottom:1px solid #eceff2;
      }
      #wd-showcase .wds-cmp-head,
      #wd-showcase .wds-cmp-row{
        display:grid;
        grid-template-columns:minmax(0,1.65fr) minmax(135px,.7fr) minmax(135px,.7fr);
        align-items:center;
        gap:14px;
      }
      #wd-showcase .wds-cmp-head{
        padding:20px 40px 17px;
        background:#10294b;
      }
      #wd-showcase .wds-cmp-label{
        color:#8fa2b9;
        font:800 var(--type-xs)/1 var(--font-ui);
        letter-spacing:.1em;
        text-transform:uppercase;
      }
      #wd-showcase .wds-cmp-us,
      #wd-showcase .wds-cmp-them{
        text-align:center;
        font:800 var(--type-xs)/1 var(--font-ui);
        letter-spacing:.07em;
        text-transform:uppercase;
      }
      #wd-showcase .wds-cmp-us{color:#9ce2d9}
      #wd-showcase .wds-cmp-us i{margin-right:5px}
      #wd-showcase .wds-cmp-them{color:#aab6c4}
      #wd-showcase .wds-cmp-row{
        min-height:58px;
        padding:13px 40px;
        border-top:1px solid #f0f2f4;
        color:#3e4650;
        font-size:var(--type-sm);
      }
      #wd-showcase .wds-cmp-row:nth-child(odd){background:#fbfcfc}
      #wd-showcase .wds-cmp-row>span{
        font-weight:700;
      }
      #wd-showcase .wds-cmp-row b,
      #wd-showcase .wds-cmp-row em{
        text-align:center;
        font-style:normal;
        font-size:var(--type-xs);
      }
      #wd-showcase .wds-cmp-row b{
        color:#10294b;
        font-weight:800;
      }
      #wd-showcase .wds-cmp-row em{
        color:#929aa4;
        font-weight:600;
      }
      #wd-showcase .wds-cmp-row b.y i,
      #wd-showcase .wds-cmp-row em.n i{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:26px;
        height:26px;
        border-radius:50%;
        font-size:var(--type-xs);
      }
      #wd-showcase .wds-cmp-row b.y i{
        background:#078486;
        color:#fff;
        box-shadow:0 0 0 5px rgba(7,132,134,.08);
      }
      #wd-showcase .wds-cmp-row em.n i{
        background:#eef0f2;
        color:#a7adb4;
      }
      #wd-showcase .wds-cmp-foot{
        display:grid;
        grid-template-columns:minmax(0,1fr) minmax(300px,.85fr);
        gap:38px;
        align-items:center;
        padding:34px 40px 40px;
        background:#fff;
      }
      #wd-showcase .wds-cmp-foot b{
        display:block;
        color:#17202b;
        font:800 var(--type-md)/1.2 var(--font-ui);
      }
      #wd-showcase .wds-cmp-foot p{
        margin:9px 0 0;
        max-width:650px;
        color:#747d87;
        font-size:var(--type-sm);
        line-height:1.52;
      }
      #wd-showcase .wds-cmp-vendors{
        display:flex;
        justify-content:flex-end;
        flex-wrap:wrap;
        gap:7px;
      }
      #wd-showcase .wds-cmp-vendors a{
        display:inline-flex;
        align-items:center;
        min-height:32px;
        padding:0 10px;
        border-radius:var(--radius-pill);
        border:1px solid #e0e5e8;
        background:#f7f9fa;
        color:#59636e;
        font:800 var(--type-xs)/1 var(--font-ui);
        transition:background .2s ease,color .2s ease,border-color .2s ease;
      }
      #wd-showcase .wds-cmp-vendors a:hover{
        background:#10294b;
        border-color:#10294b;
        color:#fff;
      }

      @media(max-width:1024px){
        #wd-showcase .wds-cmp-title{grid-template-columns:1fr;padding:42px 30px 30px}
        #wd-showcase .wds-cmp-title>a{width:max-content}
        #wd-showcase .wds-cmp-head,
        #wd-showcase .wds-cmp-row{grid-template-columns:minmax(0,1fr) 115px 115px}
        #wd-showcase .wds-cmp-head,
        #wd-showcase .wds-cmp-row{padding-left:26px;padding-right:26px}
        #wd-showcase .wds-cmp-foot{grid-template-columns:1fr;padding:30px}
        #wd-showcase .wds-cmp-vendors{justify-content:flex-start}
      }
      @media(max-width:768px){
        #wd-showcase .wds-rivals-section{padding-top:82px;padding-bottom:90px}
        #wd-showcase .wds-cmp-shell{border-radius:var(--radius-xl)}
        #wd-showcase .wds-cmp-title{padding:30px 18px 24px}
        #wd-showcase .wds-cmp-title h2{font-size:42px}
        #wd-showcase .wds-cmp-title p{font-size:var(--type-sm)}
        #wd-showcase .wds-cmp-head,
        #wd-showcase .wds-cmp-row{
          grid-template-columns:minmax(0,1fr) 78px 78px;
          gap:7px;
          padding-left:14px;
          padding-right:14px;
        }
        #wd-showcase .wds-cmp-head{padding-top:16px;padding-bottom:14px}
        #wd-showcase .wds-cmp-row{min-height:60px;font-size:var(--type-xs)}
        #wd-showcase .wds-cmp-row b,
        #wd-showcase .wds-cmp-row em{font-size:var(--type-xs)}
        #wd-showcase .wds-cmp-us,
        #wd-showcase .wds-cmp-them{font-size:var(--type-xs);line-height:1.15}
        #wd-showcase .wds-cmp-label{font-size:var(--type-xs)}
        #wd-showcase .wds-cmp-row b.y i,
        #wd-showcase .wds-cmp-row em.n i{width:24px;height:24px;font-size:var(--type-xs)}
        #wd-showcase .wds-cmp-foot{padding:24px 18px 28px}
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
