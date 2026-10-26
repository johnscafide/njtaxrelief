/* Reads a Bright MLS PDF printout in the browser and pulls out the public listing fields
   and the photos inside it. Nothing is uploaded here. Agent-only fields (agent remarks,
   showing instructions, lockbox, owner, compensation) are skipped on purpose so they can
   never end up on the public page.
   parseText() is plain JS so it can be tested in Node (property/tests/team-listings-contract.mjs). */
(function(root){
'use strict';
const PDFJS_VERSION='3.11.174';
const PDFJS_BASE='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+PDFJS_VERSION+'/';

// Field labels as Bright prints them, most specific first. Each value runs to the end of its
// column (a wide gap becomes " | " when the lines are built) or to the next "Label:".
const LABELS={
  mls_number:['MLS #','MLS#','MLS Number','Listing ID'],
  status:['Status','Listing Status'],
  price:['List Price','Current Price','Price'],
  beds:['Beds','Bedrooms','Total Bedrooms'],
  baths:['Baths','Bathrooms','Full/Half Baths','Baths Full/Half'],
  baths_full:['Full Baths','Baths Full'],
  baths_half:['Half Baths','Baths Half'],
  sqft:['Above Grade Fin SQFT','Above Grade Finished SQFT','Total Fin SQFT','Finished SQFT','Above Grade Finished Area','Living Area','Total SQFT'],
  year_built:['Year Built'],
  property_type:['Structure Type','Property Type'],
  style:['Architectural Style','Style'],
  lot:['Lot Acres / SQFT','Lot Acres/SQFT','Acres/Lot SF','Lot Size Acres','Lot Size'],
  annual_tax:['Tax Annual Amt / Year','Tax Annual Amt/Year','Tax Annual Amount','Annual Taxes','Tax Annual Amt'],
  school_district:['School District'],
  subdivision:['Subdivision','Subdiv / Neigh','Neighborhood'],
  county:['County'],
  tax_id:['Tax ID #','Tax ID','Tax ID Number','Parcel Number'],
  list_date:['Listing Entry Date','Listing Agreement Date','List Date','Listing Date','Listed On'],
  agent_name:['List Agent','Listing Agent'],
  brokerage:['List Office','Listing Office']
};
const FEATURES=[
  ['Levels','Levels/Stories','Levels / Stories','Stories'],
  ['Heating','Heating','Heat','Heating Fuel'],
  ['Cooling','Cooling','Cooling Type'],
  ['Central air','Central Air'],
  ['Basement','Basement Type','Basement'],
  ['Heating fuel','Heating Fuel'],
  ['Garage','Garage Spaces','Garage'],
  ['Parking','Parking Type','Parking'],
  ['Water','Water Source','Water'],
  ['Sewer','Sewer'],
  ['Pool','Pool'],
  ['Fireplace','Fireplace','Fireplaces'],
  ['Flooring','Flooring Type','Flooring'],
  ['Appliances','Appliances'],
  ['Interior','Interior Features'],
  ['Exterior','Exterior Features'],
  ['Roof','Roof'],
  ['Construction','Construction Materials'],
  ['Waterfront','Waterfront'],
  ['HOA fee','HOA Fee','Association Fee'],
];
// Sections and fields that end a block of remarks, and that are never read.
const STOP=/^(Agent Remarks|Agent|Showing|Lockbox|Owner|Seller|Directions|Listing Details|Listing Office|List Office|Compensation|Buyer Agency|Sub Agency|Exclusions|Inclusions|Disclosures|Rooms|Room|Building Info|Interior|Exterior|Utilities|Location|Taxes|Financial|HOA|Association|Parking|Lot|Contract|Sale|Copyright|Information is believed)\b/i;

function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*')}
function tidy(s){return String(s||'').replace(/\s+/g,' ').replace(/^[\s|:;,-]+|[\s|;,-]+$/g,'').trim()}

// One "Label: value" lookup. Bright often prints the label and value as separate columns
// ("MLS #: | NJGL2079806"), so one column gap right after the colon is skipped. The value stops
// at the next column gap or "Next Label:". A value in the last column can wrap onto the next
// lines ("Basement Type: Daylight, Full, ... Finished, Garage Access"), so those are added on.
const SECTIONS=/^(Location|Lot|Ground Rent|Parking|Rooms|Building Info|Interior Features|Exterior Features|Utilities|Remarks|Listing Office|Showing|Listing Details|Taxes and Assessment|Association \/ Community Info|Agent Full|Client Full)$/i;
function grab(text,labels){
  for(const label of labels){
    const re=new RegExp('(?:^|[\\s|;])'+escapeRe(label)+'\\s*:\\s*(?:\\|\\s*)?([^|\\n]*)(\\n?)','i');
    const m=text.match(re);
    if(!m)continue;
    let v=m[1];
    const cut=v.match(/\s(?:[A-Z][A-Za-z#/&.-]*(?:\s+[A-Za-z#/&.-]+){0,4})\s*:\s.*$/);
    if(cut)v=v.slice(0,cut.index);
    else if(m[2]){
      const rest=text.slice(m.index+m[0].length).split('\n');
      for(const line of rest.slice(0,6)){
        const t=line.trim();
        if(!t||t.includes('|')||SECTIONS.test(t)||STOP.test(t))break;
        const next=t.search(/;?\s*[A-Z][A-Za-z#/&.\s-]{0,30}:/);
        if(next===0)break;
        if(next>0){v+=' '+t.slice(0,next);break}
        v+=' '+t;
      }
    }
    v=tidy(v);
    if(v)return v;
  }
  return '';
}
function num(s){const m=String(s||'').replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):null}
function money(s){const m=String(s||'').match(/\$?\s*([\d,]+(?:\.\d+)?)/);return m?Math.round(Number(m[1].replace(/,/g,''))):null}
function isoDate(s){
  const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0')}
  const i=String(s||'').match(/\d{4}-\d{2}-\d{2}/);
  return i?i[0]:'';
}
function statusKey(s){
  const v=String(s||'').toLowerCase();
  if(!v)return '';
  if(/coming/.test(v))return 'coming_soon';
  if(/under contract|contingent|kick ?out/.test(v))return 'under_contract';
  if(/pending/.test(v))return 'pending';
  if(/closed|sold/.test(v))return 'sold';
  if(/withdrawn|expired|cancel|off market|temp/.test(v))return 'off_market';
  if(/active/.test(v))return 'active';
  return '';
}
function baths(text){
  const out={full:null,half:null};
  const full=grab(text,LABELS.baths_full),half=grab(text,LABELS.baths_half);
  if(full)out.full=num(full);
  if(half)out.half=num(half);
  if(out.full!=null)return out;
  const b=grab(text,LABELS.baths);
  const pair=b.match(/(\d+)\s*[/|]\s*(\d+)/);
  if(pair){out.full=Number(pair[1]);out.half=Number(pair[2]);return out}
  const dot=b.match(/^(\d+)\.(\d)$/);
  if(dot){out.full=Number(dot[1]);out.half=Number(dot[2]);return out}
  if(b)out.full=num(b);
  return out;
}
function remarks(lines){
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^(?:.*\|\s*)?(?:Public Remarks|Public|Remarks)\s*:\s*(.*)$/i);
    if(!m||/agent/i.test(lines[i].split(':')[0]))continue;
    const parts=[m[1].replace(/^\|\s*/,'').split(' | ')[0]];
    for(let j=i+1;j<lines.length&&parts.join(' ').length<6000;j++){
      const line=lines[j].trim();
      if(!line)continue;
      if(STOP.test(line)||/^[A-Z][A-Za-z#/&.\s-]{1,40}:\s/.test(line))break;
      parts.push(line.split(' | ')[0]);
    }
    const out=tidy(parts.join(' ').replace(/\s*[\u2014\u2013]\s*/g,', '));
    if(out.length>20)return out.slice(0,6000);
  }
  return '';
}
const STREET=/^(\d+[A-Z]?(?:-\d+)?\s+[^,|]{2,80}?)(?:,?\s+(?:Unit|Apt|#)\s*([A-Za-z0-9-]+))?,\s*([A-Za-z .'’-]{2,60}?),\s*NJ\s+(\d{5})/;
function address(lines){
  for(const raw of lines.slice(0,40)){
    for(const part of raw.split(' | ')){
      const m=part.trim().match(STREET);
      if(m)return {address:tidy(m[1]),unit:m[2]||'',city:tidy(m[3]),zip:m[4]};
    }
  }
  return {address:'',unit:'',city:'',zip:''};
}
// Bright prints the status on the address line when there's no "Status:" field.
function headerStatus(lines){
  for(const raw of lines.slice(0,12)){
    const parts=raw.split(' | ').map((x)=>x.trim());
    if(parts.length<2||!STREET.test(parts[0]))continue;
    for(const part of parts.slice(1)){const k=statusKey(part);if(k&&part.length<30)return k}
  }
  return '';
}
function headerPrice(lines){
  for(const raw of lines.slice(0,12)){
    const parts=raw.split(' | ').map((x)=>x.trim());
    if(parts.length<2||!STREET.test(parts[0]))continue;
    const hit=parts.slice(1).find((x)=>/^\$[\d,]+$/.test(x));
    if(hit)return money(hit);
  }
  return null;
}
function lotText(v){
  const m=String(v||'').match(/([\d.]+)\s*a\s*\/\s*([\d,]+)\s*sf/i);
  if(!m)return v;
  return Number(m[1])+' acres ('+Number(m[2].replace(/,/g,'')).toLocaleString('en-US')+' sq ft)';
}
function titleCase(v){return /[a-z]/.test(v)?v:String(v||'').toLowerCase().replace(/\b[a-z]/g,(c)=>c.toUpperCase())}
function county(v){return tidy(String(v||'').replace(/,?\s*NJ\b.*$/i,'').replace(/\s+County$/i,''))}
function office(v){return tidy(String(v||'').replace(/\(.*$/,'').replace(/\s+\d{3}[-.)\s]*\d{3}[-.\s]\d{4}.*$/,''))}
function agent(v){return tidy(String(v||'').replace(/\(.*$/,'').replace(/\s+\d{3}[-.)\s]*\d{3}[-.\s]\d{4}.*$/,'').replace(/\S+@\S+/g,''))}

function parseText(lines){
  const text=lines.join('\n');
  const where=address(lines);
  const b=baths(text);
  const sqft=grab(text,LABELS.sqft);
  const features=[];
  for(const [label,...keys] of FEATURES){
    const v=grab(text,keys);
    if(v)features.push({label,value:v.length<=300?v:v.slice(0,300).replace(/[,;][^,;]*$/,'')});
  }
  return {
    mls_number:(grab(text,LABELS.mls_number).match(/[A-Z]{2,6}\d{4,12}/i)||[''])[0].toUpperCase(),
    status:statusKey(grab(text,LABELS.status))||headerStatus(lines),
    price:money(grab(text,LABELS.price))||headerPrice(lines),
    address:where.address,unit:where.unit,city:where.city,zip:where.zip,
    county:county(grab(text,LABELS.county)),
    tax_id:(grab(text,LABELS.tax_id).match(/^[0-9A-Z][0-9A-Z .-]{4,40}/i)||[''])[0].trim(),
    beds:num(grab(text,LABELS.beds)),
    baths_full:b.full,baths_half:b.half,
    sqft:sqft?Math.round(num(sqft)):null,
    lot:lotText(grab(text,LABELS.lot)),
    year_built:num(grab(text,LABELS.year_built)),
    property_type:grab(text,LABELS.property_type),
    style:grab(text,LABELS.style),
    annual_tax:money(grab(text,LABELS.annual_tax)),
    school_district:grab(text,LABELS.school_district),
    subdivision:titleCase(grab(text,LABELS.subdivision)),
    list_date:isoDate(grab(text,LABELS.list_date)),
    agent_name:agent(grab(text,LABELS.agent_name)),
    brokerage:office(grab(text,LABELS.brokerage)),
    remarks:remarks(lines),
    features
  };
}

// ---------- browser only: PDF text and photos through pdf.js ----------
let pdfjsReady=null;
function loadPdfjs(){
  if(pdfjsReady)return pdfjsReady;
  pdfjsReady=new Promise((resolve,reject)=>{
    if(root.pdfjsLib)return resolve(root.pdfjsLib);
    const s=document.createElement('script');
    s.src=PDFJS_BASE+'pdf.min.js';
    s.onload=()=>{root.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_BASE+'pdf.worker.min.js';resolve(root.pdfjsLib)};
    s.onerror=()=>{pdfjsReady=null;reject(new Error('The PDF reader didn’t load. Check your connection and try again.'))};
    document.head.appendChild(s);
  });
  return pdfjsReady;
}

// Text items on the same baseline become one line; a wide gap becomes " | " so columns stay apart.
function pageLines(items){
  const rows=[];
  for(const it of items){
    if(!it.str||!it.str.trim())continue;
    const x=it.transform[4],y=it.transform[5],w=it.width||0;
    let row=rows.find((r)=>Math.abs(r.y-y)<3);
    if(!row){row={y,items:[]};rows.push(row)}
    row.items.push({x,w,str:it.str});
  }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map((r)=>{
    r.items.sort((a,b)=>a.x-b.x);
    let out='',end=null;
    for(const it of r.items){
      if(end!=null){const gap=it.x-end;out+=gap>18?' | ':(gap>1.5&&!/\s$/.test(out)&&!/^\s/.test(it.str)?' ':'')}
      out+=it.str;end=it.x+it.w;
    }
    return out.replace(/\s+/g,' ').trim();
  });
}

function objGet(page,name){
  const store=name.startsWith('g_')?page.commonObjs:page.objs;
  return new Promise((resolve)=>{
    try{store.get(name,(img)=>resolve(img))}catch(_){resolve(null)}
    setTimeout(()=>resolve(null),4000);
  });
}
function imageToCanvas(img){
  const c=document.createElement('canvas');
  c.width=img.width;c.height=img.height;
  const ctx=c.getContext('2d');
  if(img.bitmap){ctx.drawImage(img.bitmap,0,0);return c}
  if(!img.data)return null;
  const out=ctx.createImageData(img.width,img.height);
  const src=img.data,dst=out.data,n=img.width*img.height;
  if(img.kind===3||src.length===n*4){dst.set(src.subarray?src.subarray(0,n*4):src.slice(0,n*4))}
  else if(img.kind===2||src.length===n*3){for(let i=0,j=0;i<n;i++,j+=3){dst[i*4]=src[j];dst[i*4+1]=src[j+1];dst[i*4+2]=src[j+2];dst[i*4+3]=255}}
  else return null;
  ctx.putImageData(out,0,0);
  return c;
}
async function pagePhotos(pdfjs,page){
  const ops=await page.getOperatorList();
  const names=[];
  for(let i=0;i<ops.fnArray.length;i++){
    if(ops.fnArray[i]===pdfjs.OPS.paintImageXObject||ops.fnArray[i]===pdfjs.OPS.paintJpegXObject)names.push(ops.argsArray[i][0]);
  }
  const found=[];
  for(const name of [...new Set(names)]){
    const img=await objGet(page,name);
    if(!img||img.width<240||img.height<160)continue;
    const canvas=imageToCanvas(img);
    if(canvas)found.push({canvas,area:img.width*img.height});
  }
  return found;
}

async function read(file){
  const pdfjs=await loadPdfjs();
  const data=new Uint8Array(await file.arrayBuffer());
  const doc=await pdfjs.getDocument({data,isEvalSupported:false}).promise;
  const lines=[],photos=[];
  for(let p=1;p<=Math.min(doc.numPages,12);p++){
    const page=await doc.getPage(p);
    const content=await page.getTextContent();
    lines.push(...pageLines(content.items));
    try{photos.push(...await pagePhotos(pdfjs,page))}catch(_){/* photos are a bonus; the text still works */}
  }
  doc.destroy();
  const biggest=Math.max(0,...photos.map((ph)=>ph.area));
  const blobs=[];
  for(const ph of photos.filter((x)=>x.area>=biggest*0.5)){
    const blob=await new Promise((resolve)=>ph.canvas.toBlob(resolve,'image/jpeg',0.9));
    if(blob)blobs.push(blob);
  }
  return {fields:parseText(lines),photos:blobs,lines};
}

const api={parseText,read,statusKey};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WatchdogBrightPdf=api;
})(typeof window!=='undefined'?window:globalThis);
