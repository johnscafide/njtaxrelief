(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  if (path !== '/property' && path !== '/property/index.html') return;
  if (!document.querySelector('.pl-hero') || document.getElementById('wd-showcase')) return;

  var style = document.createElement('style');
  style.id = 'wd-showcase-style';
  style.textContent = `
    #wd-showcase {
      --wds-ink:#101318;
      --wds-muted:#70747d;
      --wds-paper:#f3f3f1;
      --wds-card:#ffffff;
      --wds-dark:#242528;
      --wds-blue:#0e68ff;
      --wds-teal:#078486;
      --wds-pink:#f6c9ee;
      --wds-green:#c8f0d2;
      --wds-line:rgba(16,19,24,.09);
      background:var(--wds-paper);
      color:var(--wds-ink);
      font-family:"Source Sans 3",Arial,sans-serif;
      overflow:hidden;
    }
    #wd-showcase *{box-sizing:border-box}
    .hood-on #wd-showcase{display:none!important}
    #wd-showcase a{color:inherit;text-decoration:none}
    .wds-wrap{width:min(1240px,calc(100% - 48px));margin:0 auto}
    .wds-section{padding:104px 0}
    .wds-section.wds-tight{padding-top:56px}
    .wds-eyebrows{display:flex;align-items:center;gap:10px;margin:0 0 24px}
    .wds-pill{display:inline-flex;align-items:center;min-height:28px;padding:6px 13px;border-radius:999px;font:800 10px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;background:var(--wds-green);color:#153b27}
    .wds-pill.pink{background:var(--wds-pink);color:#502044}
    .wds-pill.blue{background:#dce8ff;color:#154489}
    .wds-headrow{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.75fr);gap:90px;align-items:end;margin-bottom:54px}
    .wds-title{margin:0;font:500 clamp(45px,5.2vw,74px)/.98 "Plus Jakarta Sans",sans-serif;letter-spacing:-.058em;max-width:780px}
    .wds-title em,.wds-center-title em,.wds-banner-title em{font-family:"Playfair Display",serif;font-weight:400;font-style:italic;letter-spacing:-.035em}
    .wds-lede{margin:0 0 4px;color:var(--wds-muted);font-size:17px;line-height:1.6;max-width:520px}

    .wds-feature{display:grid;grid-template-columns:minmax(330px,.92fr) minmax(0,1.08fr);min-height:560px;background:#fff;border:1px solid rgba(255,255,255,.9);border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(31,35,42,.09)}
    .wds-feature-copy{padding:42px 24px 42px 42px;display:flex;flex-direction:column;justify-content:center}
    .wds-feature-item{padding:22px 20px;border-radius:18px}
    .wds-feature-item + .wds-feature-item{margin-top:5px}
    .wds-feature-item.active{background:linear-gradient(150deg,#38393c,#1e1f22);color:#fff;padding:26px 22px;box-shadow:0 14px 30px rgba(16,19,24,.18)}
    .wds-num{font:600 14px/1 "Plus Jakarta Sans",sans-serif;color:#b7b8bc;margin-right:11px}
    .wds-feature-item h3{display:inline;margin:0;font:700 18px/1.25 "Plus Jakarta Sans",sans-serif;letter-spacing:-.025em}
    .wds-feature-item p{margin:12px 0 0;color:#70747d;font-size:14px;line-height:1.55;max-width:420px}
    .wds-feature-item.active p{color:#d5d7da}
    .wds-feature-item.active .wds-num{color:#aeb3ba}
    .wds-feature-link{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-weight:800;font-size:13px}
    .wds-feature-link i{font-size:11px}

    .wds-preview-side{padding:28px;background:linear-gradient(135deg,#f4d7ef 0%,#e9dff7 33%,#d4e9ff 69%,#bfe2ff 100%);display:flex;align-items:center;justify-content:center}
    .wds-browser{width:min(100%,650px);background:rgba(255,255,255,.91);border:1px solid rgba(255,255,255,.82);border-radius:24px;overflow:hidden;box-shadow:0 26px 70px rgba(37,57,93,.17);backdrop-filter:blur(12px)}
    .wds-browser-top{height:48px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid rgba(16,19,24,.07)}
    .wds-dot{width:8px;height:8px;border-radius:50%;background:#d6d8dc}.wds-dot:nth-child(2){background:#c4c7cc}.wds-dot:nth-child(3){background:#afb4bc}
    .wds-browser-label{margin-left:9px;font:800 11px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:-.01em;color:#313844}
    .wds-browser-label i{color:var(--wds-teal);margin-right:6px}
    .wds-preview-body{display:grid;grid-template-columns:102px 1fr;min-height:392px}
    .wds-preview-nav{padding:18px 12px;background:#f7f8fa;border-right:1px solid rgba(16,19,24,.06)}
    .wds-nav-logo{display:flex;align-items:center;gap:6px;font:800 10px/1 "Plus Jakarta Sans",sans-serif;margin-bottom:18px}.wds-nav-logo i{color:var(--wds-teal)}
    .wds-nav-line{height:8px;border-radius:6px;background:#dde2e8;margin:12px 0}.wds-nav-line.on{height:29px;background:#142c4d;margin:8px -5px;border-radius:9px;position:relative}.wds-nav-line.on:after{content:"Dashboard";position:absolute;color:#fff;font-size:8px;font-weight:700;top:9px;left:10px}
    .wds-preview-main{padding:20px 20px 18px;min-width:0}
    .wds-preview-kicker{font-size:8px;text-transform:uppercase;letter-spacing:.1em;font-weight:800;color:#8d94a0}.wds-preview-main h4{margin:4px 0 17px;font:800 19px/1.1 "Plus Jakarta Sans",sans-serif;letter-spacing:-.04em;color:#17243a}
    .wds-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:11px}.wds-stat-card{background:#fff;border:1px solid #e9ebef;border-radius:12px;padding:10px}.wds-stat-card span{display:block;color:#89909a;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.wds-stat-card b{display:block;margin-top:4px;font:800 15px/1 "Plus Jakarta Sans",sans-serif;color:#16233a}.wds-stat-card em{display:block;margin-top:4px;color:#11956d;font-size:7px;font-style:normal;font-weight:700}
    .wds-chart-card{display:grid;grid-template-columns:1.2fr .8fr;gap:10px}.wds-chart,.wds-watch{border:1px solid #e9ebef;border-radius:12px;padding:12px;background:#fff}.wds-mini-title{font-size:8px;font-weight:800;color:#4c5562;margin-bottom:9px}.wds-bars{height:92px;display:flex;align-items:flex-end;gap:7px;padding:5px 2px 0;border-bottom:1px solid #edf0f3}.wds-bars i{display:block;flex:1;min-width:8px;border-radius:6px 6px 2px 2px;background:#d9e3ff}.wds-bars i:nth-child(3),.wds-bars i:nth-child(6){background:#1265f6}.wds-bars i:nth-child(1){height:42%}.wds-bars i:nth-child(2){height:57%}.wds-bars i:nth-child(3){height:72%}.wds-bars i:nth-child(4){height:63%}.wds-bars i:nth-child(5){height:80%}.wds-bars i:nth-child(6){height:96%}.wds-bars i:nth-child(7){height:76%}
    .wds-watch-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eff1f4}.wds-watch-row:last-child{border:0}.wds-house-thumb{width:30px;height:30px;border-radius:8px;background:linear-gradient(140deg,#d8e2e8,#eef2f4);display:grid;place-items:center;color:#6a8090;font-size:10px}.wds-watch-copy{min-width:0}.wds-watch-copy b{display:block;font-size:8px;color:#2d3440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wds-watch-copy span{font-size:7px;color:#969da7}

    .wds-center{text-align:center}.wds-center .wds-eyebrows{justify-content:center}
    .wds-center-title{margin:0 auto;font:500 clamp(45px,5vw,70px)/1 "Plus Jakarta Sans",sans-serif;letter-spacing:-.055em;max-width:850px}.wds-center-copy{max-width:650px;margin:22px auto 0;color:#7b7f87;font-size:16px;line-height:1.55}
    .wds-product-stage{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;gap:28px;margin-top:62px;padding:18px 0 22px}
    .wds-product-card{background:#fff;border-radius:24px;padding:12px 12px 18px;box-shadow:0 16px 44px rgba(18,24,34,.08);transition:transform .2s ease,box-shadow .2s ease;min-width:0}.wds-product-card:hover{box-shadow:0 22px 58px rgba(18,24,34,.13)}
    .wds-product-card.left{transform:rotate(-3deg) translateX(-26px)}.wds-product-card.right{transform:rotate(3deg) translateX(26px)}.wds-product-card.left:hover{transform:rotate(-1deg) translateX(-20px) translateY(-5px)}.wds-product-card.right:hover{transform:rotate(1deg) translateX(20px) translateY(-5px)}.wds-product-card.main{transform:scale(1.045);position:relative;z-index:2}.wds-product-card.main:hover{transform:scale(1.055) translateY(-5px)}
    .wds-product-photo{height:220px;border-radius:18px;background-size:cover;background-position:center;position:relative;overflow:hidden}.wds-product-photo:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(11,18,29,.26),transparent 58%)}.wds-product-badge{position:absolute;z-index:2;top:14px;left:14px;padding:7px 11px;border-radius:999px;background:#fff4d9;color:#7a4d06;font-size:10px;font-weight:800}.wds-product-badge.green{background:#d4f2dc;color:#1f6a39}.wds-product-badge.blue{background:#dde9ff;color:#23539d}
    .wds-card-body{padding:17px 8px 2px}.wds-card-body h3{margin:0 0 5px;font:700 22px/1.12 "Plus Jakarta Sans",sans-serif;letter-spacing:-.035em}.wds-card-body p{margin:0;color:#8a8e94;font-size:14px;line-height:1.4;min-height:39px}.wds-card-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:17px}.wds-card-foot b{font:800 13px/1 "Plus Jakarta Sans",sans-serif}.wds-card-go{display:inline-flex;align-items:center;gap:9px;background:#202124;color:#fff!important;padding:10px 13px;border-radius:999px;font-size:11px;font-weight:800}.wds-card-go i{font-size:9px}

    .wds-banner{position:relative;min-height:600px;border:1px solid rgba(255,255,255,.9);border-radius:30px;overflow:hidden;background:linear-gradient(145deg,#dfeaff,#f0e9ff 48%,#f6dcee);box-shadow:0 23px 65px rgba(35,43,56,.08)}
    .wds-banner-bg{position:absolute;inset:0;background-image:linear-gradient(to bottom,rgba(240,246,255,.38) 0%,rgba(244,239,252,.25) 48%,rgba(246,243,242,.88) 100%),url('https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1800&q=82');background-size:cover;background-position:center 58%;filter:saturate(.82)}
    .wds-banner-content{position:relative;z-index:2;padding:54px 42px 36px;display:flex;flex-direction:column;min-height:600px;justify-content:space-between}
    .wds-banner-title{margin:0 auto;text-align:center;font:500 clamp(48px,6.5vw,90px)/.91 "Plus Jakarta Sans",sans-serif;letter-spacing:-.068em;max-width:1040px}.wds-banner-title em{color:#145cf2}.wds-banner-title .line2{display:block;margin-top:4px}
    .wds-glass-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.wds-glass{background:rgba(255,255,255,.82);border:1px solid rgba(255,255,255,.94);backdrop-filter:blur(13px);border-radius:18px;padding:21px 20px;box-shadow:0 10px 30px rgba(23,30,41,.06)}.wds-glass h4{margin:0 0 8px;font:700 18px/1.15 "Plus Jakarta Sans",sans-serif;letter-spacing:-.028em}.wds-glass p{margin:0;color:#5f6570;font-size:13px;line-height:1.42;min-height:55px}.wds-glass a{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid rgba(16,19,24,.08);font-size:12px;font-weight:800}.wds-glass a i{width:24px;height:24px;border:1px solid rgba(16,19,24,.11);border-radius:50%;display:grid;place-items:center;font-size:8px}

    .wds-bento{display:grid;grid-template-columns:1fr 1fr .96fr;grid-template-rows:310px 254px;gap:18px;margin-top:58px}.wds-bento-card{border-radius:25px;overflow:hidden;background:#fff;position:relative;padding:28px;box-shadow:0 15px 42px rgba(18,24,34,.055)}.wds-bento-card h3{margin:0 0 8px;font:700 20px/1.12 "Plus Jakarta Sans",sans-serif;letter-spacing:-.035em}.wds-bento-card p{margin:0;color:#777c85;font-size:13px;line-height:1.45;max-width:360px}.wds-bento-card.dark{background:linear-gradient(150deg,#36373a,#1d1e21);color:#fff}.wds-bento-card.dark p{color:#cfd2d7}.wds-bento-card.tall{grid-column:3;grid-row:1 / span 2;padding:0}.wds-bento-card.wide{grid-column:1 / span 2;grid-row:2;background:linear-gradient(120deg,#fff0cf,#ffd7dc 51%,#eed7ff)}
    .wds-ui-chart{position:absolute;left:28px;right:28px;bottom:22px;height:150px;border-radius:17px;background:#fbfbfc;border:1px solid #eff0f2;padding:18px;overflow:hidden}.wds-ui-grid{height:80px;position:relative;background:repeating-linear-gradient(to bottom,transparent 0,transparent 19px,#eef0f3 20px)}.wds-ui-line{position:absolute;inset:15px 0 4px;background:linear-gradient(155deg,transparent 0 24%,#ff4c82 24.6% 25.6%,transparent 26.2% 48%,#ff4c82 48.6% 49.6%,transparent 50.2% 70%,#ff4c82 70.6% 71.6%,transparent 72.2%);opacity:.9}.wds-ui-chip{position:absolute;right:16px;top:14px;padding:6px 8px;border-radius:8px;background:#ffe7f1;color:#9e2b58;font-size:9px;font-weight:800}
    .wds-network{position:absolute;inset:94px 25px 22px;border-radius:20px;background:radial-gradient(circle at 50% 50%,rgba(120,91,255,.6),rgba(52,44,82,.18) 38%,transparent 62%)}.wds-orbit{position:absolute;border:1px solid rgba(196,186,255,.26);border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%)}.wds-orbit.o1{width:210px;height:130px}.wds-orbit.o2{width:160px;height:190px;transform:translate(-50%,-50%) rotate(45deg)}.wds-node{position:absolute;padding:7px 9px;border-radius:999px;background:rgba(255,255,255,.92);color:#333746;font-size:8px;font-weight:800;box-shadow:0 5px 16px rgba(0,0,0,.18)}.wds-node.n1{left:10%;top:45%}.wds-node.n2{right:8%;top:30%}.wds-node.n3{right:24%;bottom:12%}
    .wds-report-photo{position:absolute;inset:0;background-image:linear-gradient(to bottom,rgba(255,255,255,.1),rgba(255,255,255,.04) 47%,rgba(246,247,244,.94) 78%),url('https://images.unsplash.com/photo-1772325652571-f1406f80ee01?fm=jpg&q=82&w=1200&auto=format&fit=crop');background-size:cover;background-position:center}.wds-report-copy{position:absolute;z-index:2;left:25px;right:25px;bottom:25px;text-align:center}.wds-report-copy .wds-pill{margin-bottom:12px;background:#eff0e9}.wds-report-copy h3{font-size:26px}.wds-price-tags span{position:absolute;z-index:2;background:rgba(255,255,255,.88);padding:7px 9px;border-radius:8px;font-size:9px;font-weight:800;box-shadow:0 6px 18px rgba(32,39,48,.1)}.wds-price-tags .p1{top:48%;left:12%}.wds-price-tags .p2{top:40%;right:8%}.wds-price-tags .p3{top:58%;right:27%}
    .wds-mail-preview{position:absolute;right:20px;top:28px;width:47%;height:200px;transform:rotate(5deg);background:#fff;border-radius:17px;box-shadow:0 14px 40px rgba(73,42,70,.12);padding:14px}.wds-mail-head{display:flex;align-items:center;gap:8px;font:800 9px/1 "Plus Jakarta Sans",sans-serif}.wds-mail-head i{color:var(--wds-teal)}.wds-mail-photo{height:92px;border-radius:10px;margin-top:10px;background:url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=700&q=80') center/cover}.wds-mail-bars{margin-top:9px}.wds-mail-bars i{display:block;height:6px;border-radius:5px;background:#eceef0;margin:5px 0}.wds-mail-bars i:first-child{width:70%;background:#24272d}.wds-wide-copy{position:relative;z-index:2;width:49%;padding-top:5px}.wds-wide-copy h3{font-size:28px;margin-top:3px}.wds-wide-copy p{font-size:14px}.wds-wide-copy .wds-card-go{margin-top:24px}

    .wds-end{padding:52px 0 88px}.wds-end-card{display:flex;align-items:center;justify-content:space-between;gap:26px;padding:32px 36px;border-radius:22px;background:#fff;border:1px solid var(--wds-line)}.wds-end-card span{display:block;color:#8a8f97;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}.wds-end-card h3{margin:0;font:700 30px/1.08 "Plus Jakarta Sans",sans-serif;letter-spacing:-.045em}.wds-end-actions{display:flex;gap:10px;flex-wrap:wrap}.wds-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:46px;padding:0 18px;border-radius:999px;background:#202124;color:#fff!important;font-size:13px;font-weight:800}.wds-btn.light{background:#f1f3f4;color:#202124!important}.wds-disclosure{max-width:920px;margin:24px auto 0;text-align:center;color:#858a91;font-size:11.5px;line-height:1.5}

    @media (max-width:980px){
      .wds-wrap{width:min(100% - 34px,900px)}.wds-section{padding:78px 0}.wds-headrow{grid-template-columns:1fr;gap:25px;margin-bottom:38px}.wds-lede{max-width:680px}.wds-feature{grid-template-columns:1fr}.wds-preview-side{min-height:490px}.wds-product-stage{grid-template-columns:1fr 1fr;gap:18px}.wds-product-card.left,.wds-product-card.right,.wds-product-card.main{transform:none}.wds-product-card.right{display:none}.wds-glass-row{grid-template-columns:1fr}.wds-banner,.wds-banner-content{min-height:790px}.wds-bento{grid-template-columns:1fr 1fr;grid-template-rows:300px 300px 330px}.wds-bento-card.tall{grid-column:2;grid-row:1 / span 2}.wds-bento-card.wide{grid-column:1 / span 2;grid-row:3}.wds-mail-preview{width:45%}
    }
    @media (max-width:680px){
      .wds-wrap{width:calc(100% - 28px)}.wds-section{padding:66px 0}.wds-title,.wds-center-title{font-size:43px}.wds-eyebrows{margin-bottom:18px}.wds-feature-copy{padding:24px 13px}.wds-feature-item{padding:19px 14px}.wds-preview-side{padding:15px;min-height:420px}.wds-browser{border-radius:18px}.wds-preview-body{grid-template-columns:72px 1fr;min-height:360px}.wds-preview-nav{padding:12px 8px}.wds-preview-main{padding:15px 11px}.wds-stat-grid{grid-template-columns:1fr 1fr}.wds-stat-card:last-child{display:none}.wds-chart-card{grid-template-columns:1fr}.wds-watch{display:none}.wds-product-stage{grid-template-columns:1fr;margin-top:40px}.wds-product-card.left,.wds-product-card.right{display:none}.wds-product-card.main{display:block}.wds-banner{border-radius:22px;min-height:760px}.wds-banner-content{min-height:760px;padding:38px 14px 20px}.wds-banner-title{font-size:51px}.wds-glass{padding:17px}.wds-glass p{min-height:0}.wds-bento{display:block;margin-top:38px}.wds-bento-card{min-height:300px;margin-bottom:14px}.wds-bento-card.tall{height:460px}.wds-bento-card.wide{height:400px}.wds-wide-copy{width:100%;padding-right:0}.wds-mail-preview{top:auto;left:45px;right:-40px;bottom:-55px;width:75%}.wds-end-card{align-items:flex-start;flex-direction:column;padding:26px 22px}.wds-end-actions{width:100%}.wds-btn{flex:1;min-width:150px}
    }
  `;
  document.head.appendChild(style);

  var footer = document.getElementById('wd-property-footer');
  var firstLegacy = document.querySelector('.lp-tools');
  firstLegacy = firstLegacy && firstLegacy.closest('section');
  if (!footer || !firstLegacy) return;

  var cursor = firstLegacy;
  while (cursor && cursor !== footer) {
    var next = cursor.nextSibling;
    if (cursor.nodeType === 1 && cursor.id !== 'pl-hood') {
      cursor.setAttribute('data-wd-legacy-landing', 'true');
      cursor.hidden = true;
    }
    cursor = next;
  }

  var main = document.createElement('main');
  main.id = 'wd-showcase';
  main.setAttribute('aria-label', 'Watchdog platform overview');
  main.innerHTML = `
    <section class="wds-section wds-tight">
      <div class="wds-wrap">
        <div class="wds-eyebrows"><span class="wds-pill">Property intelligence</span><span class="wds-pill pink">Watchdog</span></div>
        <div class="wds-headrow">
          <h2 class="wds-title">Data-driven property <em>intelligence</em></h2>
          <p class="wds-lede">Watchdog turns New Jersey property records into a clearer view of assessments, taxes, market context, benefits and the signals that may deserve your attention.</p>
        </div>

        <div class="wds-feature">
          <div class="wds-feature-copy">
            <div class="wds-feature-item">
              <span class="wds-num">01</span><h3>Property intelligence</h3>
              <p>Bring assessment history, tax bills, recorded sales, parcel details and local context into one property view.</p>
            </div>
            <div class="wds-feature-item active">
              <span class="wds-num">02</span><h3>Predictive signals</h3>
              <p>Watchdog layers your records with trend and fairness signals so you can spot changes before they become expensive surprises.</p>
              <a class="wds-feature-link" href="/property/dashboard">Explore the dashboard <i class="fas fa-arrow-right"></i></a>
            </div>
            <div class="wds-feature-item">
              <span class="wds-num">03</span><h3>Actionable recommendations</h3>
              <p>Move from raw public data to practical next steps for appeals, benefits, selling, buying and ongoing property monitoring.</p>
            </div>
          </div>

          <div class="wds-preview-side" aria-label="Watchdog dashboard product preview">
            <div class="wds-browser">
              <div class="wds-browser-top"><i class="wds-dot"></i><i class="wds-dot"></i><i class="wds-dot"></i><span class="wds-browser-label"><i class="fas fa-dog"></i>Watchdog workspace</span></div>
              <div class="wds-preview-body">
                <div class="wds-preview-nav">
                  <div class="wds-nav-logo"><i class="fas fa-dog"></i>Watchdog</div>
                  <div class="wds-nav-line on"></div><div class="wds-nav-line"></div><div class="wds-nav-line"></div><div class="wds-nav-line"></div><div class="wds-nav-line"></div>
                </div>
                <div class="wds-preview-main">
                  <span class="wds-preview-kicker">Dashboard</span><h4>Your properties</h4>
                  <div class="wds-stat-grid">
                    <div class="wds-stat-card"><span>Tracked</span><b>8</b><em>2 updated</em></div>
                    <div class="wds-stat-card"><span>Est. equity</span><b>$642k</b><em>+4.8% yr</em></div>
                    <div class="wds-stat-card"><span>Appeal watch</span><b>2</b><em>review</em></div>
                  </div>
                  <div class="wds-chart-card">
                    <div class="wds-chart"><div class="wds-mini-title">Property intelligence trend</div><div class="wds-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
                    <div class="wds-watch"><div class="wds-mini-title">Watchlist</div><div class="wds-watch-row"><span class="wds-house-thumb"><i class="fas fa-house"></i></span><span class="wds-watch-copy"><b>412 Oak Avenue</b><span>Assessment changed</span></span></div><div class="wds-watch-row"><span class="wds-house-thumb"><i class="fas fa-house"></i></span><span class="wds-watch-copy"><b>18 Cooper Drive</b><span>New signal</span></span></div><div class="wds-watch-row"><span class="wds-house-thumb"><i class="fas fa-house"></i></span><span class="wds-watch-copy"><b>93 Main Street</b><span>Stable</span></span></div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="wds-section wds-center">
      <div class="wds-wrap">
        <div class="wds-eyebrows"><span class="wds-pill blue">Inside Watchdog</span></div>
        <h2 class="wds-center-title">Featured workspace tools, <em>built to work together</em></h2>
        <p class="wds-center-copy">Start with a property, keep an eye on what changes, then use the same intelligence across reporting, client work and marketing.</p>
        <div class="wds-product-stage">
          <a class="wds-product-card left" href="/property/home">
            <div class="wds-product-photo" style="background-image:url('https://images.unsplash.com/photo-1758523670991-ee93bc48d81d?fm=jpg&q=80&w=1200&auto=format&fit=crop')"><span class="wds-product-badge green">Property Report</span></div>
            <div class="wds-card-body"><h3>Property intelligence report</h3><p>Tax, assessment, market, appeal and benefit context in one detailed property view.</p><div class="wds-card-foot"><b>One property, full context</b><span class="wds-card-go">Explore <i class="fas fa-arrow-right"></i></span></div></div>
          </a>
          <a class="wds-product-card main" href="/property/dashboard">
            <div class="wds-product-photo" style="background-image:url('https://images.unsplash.com/photo-1772325652571-f1406f80ee01?fm=jpg&q=80&w=1200&auto=format&fit=crop')"><span class="wds-product-badge blue">Dashboard</span></div>
            <div class="wds-card-body"><h3>Your Watchdog workspace</h3><p>Track saved properties, review signals and keep the homes that matter in one place.</p><div class="wds-card-foot"><b>Built for repeat use</b><span class="wds-card-go">Open <i class="fas fa-arrow-right"></i></span></div></div>
          </a>
          <a class="wds-product-card right" href="/property/marketing-studio">
            <div class="wds-product-photo" style="background-image:url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=82')"><span class="wds-product-badge">Marketing Studio</span></div>
            <div class="wds-card-body"><h3>Turn insight into outreach</h3><p>Build audiences, campaigns and property-driven marketing from the same workspace.</p><div class="wds-card-foot"><b>Agent workspace</b><span class="wds-card-go">View studio <i class="fas fa-arrow-right"></i></span></div></div>
          </a>
        </div>
      </div>
    </section>

    <section class="wds-section" style="padding-top:32px">
      <div class="wds-wrap">
        <div class="wds-banner">
          <div class="wds-banner-bg"></div>
          <div class="wds-banner-content">
            <h2 class="wds-banner-title">See the whole <span class="line2"><em>property story</em></span></h2>
            <div class="wds-glass-row">
              <div class="wds-glass"><h4>Smart property lookup</h4><p>Search any New Jersey address and move from the public record into a useful property analysis.</p><a href="#pl-addr" data-wds-focus-search>Find a property <i class="fas fa-arrow-right"></i></a></div>
              <div class="wds-glass"><h4>Benefit intelligence</h4><p>Connect the property picture with ANCHOR, Stay NJ and the relief programs that can affect a household.</p><a href="/anchor-estimator.html">Check benefits <i class="fas fa-arrow-right"></i></a></div>
              <div class="wds-glass"><h4>Appeal &amp; equity signals</h4><p>Understand assessment fairness, market value context and when a number deserves a closer look.</p><a href="/property/fairness">Explore fairness <i class="fas fa-arrow-right"></i></a></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="wds-section wds-center">
      <div class="wds-wrap">
        <div class="wds-eyebrows"><span class="wds-pill pink">One connected workspace</span></div>
        <h2 class="wds-center-title">From a single home to a full pipeline, <em>stay in context</em></h2>
        <p class="wds-center-copy">Watchdog is designed to keep the property record, the homeowner decision and the professional workflow connected instead of scattered across separate tools.</p>

        <div class="wds-bento">
          <a class="wds-bento-card" href="/property/dashboard">
            <h3>Unified dashboard</h3><p>Track properties, signals and the numbers that changed without rebuilding the story every time.</p>
            <div class="wds-ui-chart"><div class="wds-ui-chip">+12% activity</div><div class="wds-ui-grid"><div class="wds-ui-line"></div></div></div>
          </a>
          <a class="wds-bento-card dark" href="/property/marketing-studio">
            <h3>Marketing Studio</h3><p>Take a property-driven audience from idea to campaign while keeping the workflow organized.</p>
            <div class="wds-network"><i class="wds-orbit o1"></i><i class="wds-orbit o2"></i><span class="wds-node n1">Audience</span><span class="wds-node n2">Creative</span><span class="wds-node n3">Campaign</span></div>
          </a>
          <a class="wds-bento-card tall" href="/property/home">
            <div class="wds-report-photo"></div><div class="wds-price-tags"><span class="p1">Tax history</span><span class="p2">Assessment</span><span class="p3">Equity signal</span></div><div class="wds-report-copy"><span class="wds-pill">Property report</span><h3>One home. More context.</h3><p>See the pieces that can change a property decision, together.</p></div>
          </a>
          <a class="wds-bento-card wide" href="/property/marketing-studio">
            <div class="wds-wide-copy"><span class="wds-pill pink">Professional workflow</span><h3>From property records to real outreach</h3><p>Use Watchdog intelligence to build more relevant homeowner conversations, reports and campaigns.</p><span class="wds-card-go">Launch Marketing Studio <i class="fas fa-arrow-right"></i></span></div>
            <div class="wds-mail-preview"><div class="wds-mail-head"><i class="fas fa-dog"></i>Watchdog property update</div><div class="wds-mail-photo"></div><div class="wds-mail-bars"><i></i><i></i><i></i></div></div>
          </a>
        </div>
      </div>
    </section>

    <section class="wds-end">
      <div class="wds-wrap">
        <div class="wds-end-card">
          <div><span>Start with one address</span><h3>See what Watchdog knows about a property.</h3></div>
          <div class="wds-end-actions"><a class="wds-btn" href="#pl-addr" data-wds-focus-search><i class="fas fa-magnifying-glass"></i> Search a property</a><a class="wds-btn light" href="/property/dashboard">Open dashboard</a></div>
        </div>
        <p class="wds-disclosure">Watchdog uses public property and tax records for educational property intelligence. It is not a government website, appraisal, legal opinion or individualized tax advice. Verify important decisions with the appropriate public agency or qualified professional.</p>
      </div>
    </section>
  `;

  footer.parentNode.insertBefore(main, footer);
  document.body.classList.add('wd-showcase-ready');

  main.addEventListener('click', function (event) {
    var link = event.target.closest('[data-wds-focus-search]');
    if (!link) return;
    var input = document.getElementById('pl-addr');
    if (!input) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(function () { input.focus(); }, 450);
  });
})();
