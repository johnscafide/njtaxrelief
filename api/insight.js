const SUPABASE_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
const SUPABASE_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const WATCHDOG_ORIGIN='https://www.watchdogindex.com';
const WATCHDOG_ORG=WATCHDOG_ORIGIN+'/#organization';
const WATCHDOG_SITE=WATCHDOG_ORIGIN+'/#website';
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeJson(v){return JSON.stringify(v).replace(/</g,'\\u003c');}
module.exports=async function handler(req,res){
  const slug=String(req.query.slug||'').toLowerCase();
  if(!/^[a-z0-9-]{2,100}$/.test(slug)){res.status(404).send('Not found');return;}
  const url=SUPABASE_URL+'/rest/v1/insights_articles?slug=eq.'+encodeURIComponent(slug)+'&published=eq.true&select=*';
  let rows=[];
  try{const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});if(!r.ok)throw new Error('upstream');rows=await r.json();}catch(e){res.status(503).setHeader('Retry-After','60').send('Insight temporarily unavailable');return;}
  if(!rows.length){res.status(404).send('Insight not found');return;}
  const a=rows[0],title=String(a.title||'NJ Property Tax Insight'),desc=String(a.meta_description||a.dek||'New Jersey property tax insight.'),canonical=WATCHDOG_ORIGIN+'/insights/'+slug,faq=Array.isArray(a.faq)?a.faq:[];
  const authorName=String(a.author||'Watchdog').trim();
  const author=/^watchdog(?: property intelligence)?$/i.test(authorName)?{'@id':WATCHDOG_ORG,'@type':'Organization','name':'Watchdog'}:{'@type':'Person','name':authorName};
  const articleSchema={
    '@context':'https://schema.org','@type':'Article','@id':canonical+'#article',headline:title,description:desc,
    datePublished:a.published_at,dateModified:a.updated_at||a.published_at,inLanguage:'en-US',isAccessibleForFree:true,
    mainEntityOfPage:{'@type':'WebPage','@id':canonical,'url':canonical,'isPartOf':{'@id':WATCHDOG_SITE}},
    author:author,
    publisher:{'@type':'Organization','@id':WATCHDOG_ORG,'name':'Watchdog','alternateName':'Watchdog Property Intelligence','url':WATCHDOG_ORIGIN+'/'},
    articleSection:String(a.kicker||'Watchdog Insight'),
    image:a.hero_image_url||undefined
  };
  const faqSchema=faq.length?{'@context':'https://schema.org','@type':'FAQPage','@id':canonical+'#faq',mainEntity:faq.map(f=>({'@type':'Question',name:String(f.q||''),acceptedAnswer:{'@type':'Answer',text:String(f.a||'')}}))}:null;
  const faqHtml=faq.length?'<section class="p-faq"><h2>Frequently asked questions</h2>'+faq.map(f=>'<div><h3>'+esc(f.q)+'</h3><p>'+esc(f.a)+'</p></div>').join('')+'</section>':'';
  const hero=a.hero_image_url?'<img class="p-hero" src="'+esc(a.hero_image_url)+'" alt="'+esc(a.hero_image_alt||title)+'">':'';
  const date=a.published_at?new Date(a.published_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'America/New_York'}):'';
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>'+esc(title)+' | Watchdog</title><meta name="description" content="'+esc(desc)+'"><link rel="canonical" href="'+esc(canonical)+'"><meta property="og:type" content="article"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(desc)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta name="twitter:card" content="summary_large_image"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box}body{margin:0;font-family:"Source Sans 3",sans-serif;color:#17263a}.p-shell{max-width:780px;margin:auto;padding:0 24px}.p-nav{padding:22px 0;display:flex;justify-content:space-between}.p-nav a{font-weight:800;color:#102a4c;text-decoration:none}.p-head{padding:45px 0 28px}.p-k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#078486;font-weight:800}.p-head h1{font:700 clamp(34px,5vw,52px)/1.08 "Playfair Display",serif;margin:10px 0 15px}.p-dek{font-size:20px;line-height:1.55;color:#637287}.p-meta{font-size:13px;color:#85909c}.p-hero{width:100%;border-radius:16px;aspect-ratio:16/9;object-fit:cover;margin:16px 0 30px}.p-body{font-size:18px;line-height:1.8}.p-body h2{font:800 25px "Plus Jakarta Sans",sans-serif;margin:38px 0 10px}.p-body a{color:#0b6570}.p-faq{margin:45px 0;border-top:1px solid #dde5ea;padding-top:25px}.p-faq h2{font:800 24px "Plus Jakarta Sans",sans-serif}.p-faq h3{font-size:17px;margin:22px 0 6px}.p-cta{margin:50px 0 80px;padding:28px;background:#102a4c;color:#fff;border-radius:16px;text-align:center}.p-cta a{display:inline-block;margin-top:10px;background:#fff;color:#102a4c;padding:11px 18px;border-radius:8px;font-weight:800;text-decoration:none}</style><script type="application/ld+json">'+safeJson(articleSchema)+'</script>'+(faqSchema?'<script type="application/ld+json">'+safeJson(faqSchema)+'</script>':'')+'</head><body><div class="p-shell"><nav class="p-nav"><a href="'+WATCHDOG_ORIGIN+'/">Watchdog</a><a href="'+WATCHDOG_ORIGIN+'/insights">All insights</a></nav><article><header class="p-head"><span class="p-k">'+esc(a.kicker||'Insight')+'</span><h1>'+esc(title)+'</h1><p class="p-dek">'+esc(a.dek||'')+'</p><div class="p-meta">'+esc(authorName)+' · '+esc(date)+' · '+esc(a.reading_minutes||5)+' min read</div></header>'+hero+'<div class="p-body">'+String(a.body_html||'')+'</div>'+faqHtml+'<div class="p-cta"><strong>Check your own property record</strong><br>Assessment, tax and property context for any New Jersey address.<br><a href="'+WATCHDOG_ORIGIN+'/">Open Watchdog</a></div></article></div></body></html>';
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=3600');res.status(200).send(html);
};
