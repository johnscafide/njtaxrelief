const dns=require('dns').promises;
const net=require('net');

function clean(v,n){return String(v??'').trim().slice(0,n)}
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('security backend unavailable');return{url,key}}
async function requireUser(req){
  const token=String(req.headers&&req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw Object.assign(new Error('Authentication required.'),{status:401});
  const c=backend();
  const r=await fetch(c.url+'/auth/v1/user',{headers:{apikey:c.key,Authorization:'Bearer '+token}});
  if(!r.ok)throw Object.assign(new Error('Authentication required.'),{status:401});
  return r.json();
}
function isPrivateIp(ip){
  if(net.isIP(ip)===4){
    const p=ip.split('.').map(Number);
    return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168);
  }
  const s=String(ip).toLowerCase();
  return s==='::1'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe80:');
}
async function validateUrl(input){
  let u;try{u=new URL(input)}catch(_){throw Object.assign(new Error('Enter a valid brokerage website URL.'),{status:400})}
  if(u.protocol!=='https:')throw Object.assign(new Error('Brokerage website must use HTTPS.'),{status:400});
  if(!u.hostname||u.username||u.password)throw Object.assign(new Error('Invalid brokerage website URL.'),{status:400});
  if(net.isIP(u.hostname)&&isPrivateIp(u.hostname))throw Object.assign(new Error('Private network addresses are not allowed.'),{status:400});
  const addrs=await dns.lookup(u.hostname,{all:true}).catch(()=>[]);
  if(!addrs.length||addrs.some(x=>isPrivateIp(x.address)))throw Object.assign(new Error('Brokerage website could not be resolved safely.'),{status:400});
  return u;
}
async function safeFetch(input,maxBytes=850000){
  let url=await validateUrl(input);
  for(let i=0;i<4;i++){
    const r=await fetch(url,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 WatchdogBrandDiscovery/1.0','Accept':'text/html,text/css;q=0.9,*/*;q=0.5'},signal:AbortSignal.timeout(6500)});
    if([301,302,303,307,308].includes(r.status)){
      const loc=r.headers.get('location');if(!loc)throw new Error('Brokerage website redirect was invalid.');
      url=await validateUrl(new URL(loc,url).toString());continue;
    }
    if(!r.ok)throw Object.assign(new Error('Brokerage website returned HTTP '+r.status+'.'),{status:422});
    const len=Number(r.headers.get('content-length')||0);if(len>maxBytes*2)throw Object.assign(new Error('Brokerage website response was too large.'),{status:422});
    const text=(await r.text()).slice(0,maxBytes);
    return {url,text,type:r.headers.get('content-type')||''};
  }
  throw Object.assign(new Error('Brokerage website redirected too many times.'),{status:422});
}
function decode(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function attr(tag,name){const m=tag.match(new RegExp(name+'\\s*=\\s*["\\\']([^"\\\']+)["\\\']','i'));return m?decode(m[1]):''}
function resolve(base,value){try{return new URL(value,base).toString()}catch(_){return''}}
function extractName(html){
  const og=html.match(/<meta[^>]+property=["']og:site_name["'][^>]*>/i)||html.match(/<meta[^>]+name=["']application-name["'][^>]*>/i);
  if(og){const c=attr(og[0],'content');if(c)return clean(c,140)}
  const t=html.match(/<title[^>]*>([\s\S]{1,220}?)<\/title>/i);return t?clean(decode(t[1].replace(/<[^>]+>/g,' ')),140):'';
}
function extractLogos(html,base){
  const out=[];
  for(const m of html.matchAll(/<(?:img|link|meta)\b[^>]*>/gi)){
    const tag=m[0],hay=tag.toLowerCase();
    let candidate='';
    if(tag.startsWith('<img') && /logo|brand|masthead/.test(hay)) candidate=attr(tag,'src');
    else if(tag.startsWith('<link') && /rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["']/i.test(tag)) candidate=attr(tag,'href');
    else if(tag.startsWith('<meta') && /property=["']og:image["']/i.test(tag)) candidate=attr(tag,'content');
    const url=resolve(base,candidate);
    if(url&&url.startsWith('https://')&&!out.includes(url))out.push(url);
    if(out.length>=6)break;
  }
  return out;
}
function goodColor(hex){
  const h=hex.replace('#','');if(!/^[0-9a-f]{6}$/i.test(h))return false;
  const n=parseInt(h,16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  if(max>245&&min>235)return false;
  if(max<24)return false;
  return max-min>20 || (max<210&&min<210);
}
function extractColors(text){
  const prioritized=[];
  for(const re of [
    /(?:theme-color|--(?:brand|primary|secondary|accent)[-_a-z0-9]*)[^#]{0,40}(#[0-9a-f]{6})/gi,
    /#[0-9a-f]{6}\b/gi
  ]){
    for(const m of text.matchAll(re)){const h=(m[1]||m[0]).toUpperCase();if(goodColor(h)&&!prioritized.includes(h))prioritized.push(h);if(prioritized.length>=8)break}
    if(prioritized.length>=8)break;
  }
  return prioritized.slice(0,5);
}
async function cssColors(html,base){
  const urls=[];
  for(const m of html.matchAll(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)){const href=resolve(base,attr(m[0],'href'));if(href&&new URL(href).hostname===new URL(base).hostname&&!urls.includes(href))urls.push(href);if(urls.length>=2)break}
  let all='';
  for(const u of urls){try{const r=await safeFetch(u,280000);all+='\n'+r.text}catch(_){}}
  return extractColors(all);
}
const OPUS={hosts:['opuselitere.com','opuselitenj.com','opuseliterealestate.com'],name:'Opus Elite Real Estate',primary:'#00778B',secondary:'#E35205',accent:'#222222'};

module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
  try{await requireUser(req)}catch(e){return res.status(e.status||401).json({error:e.message||'Authentication required.'})}
  const raw=clean(req.query&&req.query.url,700);if(!raw)return res.status(400).json({error:'Brokerage website URL is required.'});
  try{
    const page=await safeFetch(raw),host=page.url.hostname.replace(/^www\./,'').toLowerCase(),preset=OPUS.hosts.some(h=>host===h||host.endsWith('.'+h))?OPUS:null;
    const logos=extractLogos(page.text,page.url.toString());
    let colors=extractColors(page.text);const fromCss=await cssColors(page.text,page.url.toString());for(const c of fromCss)if(!colors.includes(c))colors.push(c);
    if(preset)colors=[preset.primary,preset.secondary,preset.accent,...colors.filter(c=>![preset.primary,preset.secondary,preset.accent].includes(c))];
    return res.status(200).json({
      website:page.url.toString(),
      brokerage_name:preset?.name||extractName(page.text)||host,
      logo_url:logos[0]||null,
      logo_candidates:logos.slice(0,4),
      colors:colors.slice(0,5),
      primary_color:(preset&&preset.primary)||colors[0]||'#10294B',
      secondary_color:(preset&&preset.secondary)||colors[1]||'#0B8B85',
      accent_color:(preset&&preset.accent)||colors[2]||'#1F2937',
      source:'public_website'
    });
  }catch(e){return res.status(e.status||422).json({error:e.message||'Could not analyze that brokerage website.'})}
};