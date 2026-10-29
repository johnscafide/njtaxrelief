/* Quote Image (Backoffice owner only).
   Draws John's text as a 1122x1402 post mockup in X, Threads or Instagram style
   and saves it as a PNG. Everything stays in this browser tab.
   The X layout is measured from John's sample image. Apple devices use the
   system font (SF Pro); everything else uses Inter, sized to match. */
(function(){
'use strict';
const W=1122,H=1402;
const NAME='John Scafide',USER='johnvscafide',HANDLE='@'+USER;
const PHOTO='/property/backoffice/quote-image/john-profile.jpg';
const AVATAR={cx:193,r:128};
const HEAD={nameInkX:359,nameInkW:437,nameBase:130,handleInkX:360,handleInkW:384,handleBase:201,badge:68,badgeTop:71,badgeGap:22};
const BODY={inkX:82,maxRight:1040,sample:'A lot of confidence',sampleW:942,firstBase:201,pitch:122,descent:22,minK:.4};
const MARGIN=110;
const TEXT='#000000',X_BLUE='#1d9bf0',META_BLUE='#0095f6',X_PINK='#f91880',META_RED='#ff3040';
const MEDIA_MAX=520,MAX_PHOTOS=4;
const X_BADGE='M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z';
const X_CHECK='M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z';
const ICONS={
  heart:['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  comment:['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
  repost:['m17 2 4 4-4 4','M3 11v-1a4 4 0 0 1 4-4h14','m7 22-4-4 4-4','M21 13v1a4 4 0 0 1-4 4H3'],
  send:['M22 2 11 13','M22 2 15 22 11 13 2 9 22 2Z'],
  share:['M12 2v13','m7 7 5-5 5 5','M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6'],
  bookmark:['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z']
};

const $=(id)=>document.getElementById(id);
const els={};
let photo=null;
let font=null;
let colors={bg:'#ffffff',text:TEXT,highlight:X_BLUE};
let extras={photos:[],background:null,dim:.35,liked:false,saved:false,signature:'',script:true};

function hexRgb(hex){
  const n=parseInt(hex.slice(1),16);
  return [n>>16&255,n>>8&255,n&255];
}

function mix(a,b,amount){
  const x=hexRgb(a),y=hexRgb(b);
  return '#'+x.map((v,i)=>Math.round(v*amount+y[i]*(1-amount)).toString(16).padStart(2,'0')).join('');
}

function hasAppleFont(ctx){
  const probe='A lot of confidence @johnvscafide';
  ctx.font='100px monospace';
  const base=ctx.measureText(probe).width;
  ctx.font='100px -apple-system,BlinkMacSystemFont,"SF Pro Display",monospace';
  return Math.abs(ctx.measureText(probe).width-base)>1;
}

function ink(ctx,text){
  const m=ctx.measureText(text);
  return {left:m.actualBoundingBoxLeft,width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight};
}

function setFont(ctx,weight,size,tracking){
  ctx.font=`${weight} ${size}px ${font.family}`;
  if('letterSpacing' in ctx)ctx.letterSpacing=tracking?`${tracking*size}px`:'0px';
}

function fitSize(ctx,weight,text,target,tracking){
  setFont(ctx,weight,100,tracking);
  return 100*target/ink(ctx,text).width;
}

function pickFont(ctx){
  font=hasAppleFont(ctx)
    ?{family:'-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif',body:400,name:700,handle:400,tracking:0}
    :{family:'Inter,"Helvetica Neue",Arial,sans-serif',body:500,name:700,handle:400,tracking:-.02};
  font.bodySize=fitSize(ctx,font.body,BODY.sample,BODY.sampleW,font.tracking);
  font.nameSize=fitSize(ctx,font.name,NAME,HEAD.nameInkW);
  font.handleSize=fitSize(ctx,font.handle,HANDLE,HEAD.handleInkW);
}

function parse(text){
  const stars=[...text].reduce((list,ch,i)=>(ch==='*'?list.concat(i):list),[]);
  const literal=stars.length%2?stars[stars.length-1]:-1;
  const paras=[[]];
  let word=[],on=false;
  const push=(ch)=>{
    const last=word[word.length-1];
    if(last&&last.hl===on)last.t+=ch;else word.push({t:ch,hl:on});
  };
  const endWord=()=>{if(word.length)paras[paras.length-1].push(word);word=[]};
  [...text].forEach((ch,i)=>{
    if(ch==='*'&&i!==literal){on=!on;return}
    if(ch==='\n'){endWord();paras.push([]);return}
    if(/\s/.test(ch)){endWord();return}
    push(ch);
  });
  endWord();
  return paras;
}

function segFont(ctx,f,hl){
  setFont(ctx,hl?Math.max(700,f.weight):f.weight,f.size,f.tracking);
}

function wordWidth(ctx,word,f){
  return word.reduce((sum,seg)=>{segFont(ctx,f,seg.hl);return sum+ctx.measureText(seg.t).width},0);
}

function lineWidth(ctx,line,f){
  if(!line.length)return 0;
  segFont(ctx,f,false);
  const space=ctx.measureText(' ').width;
  return line.reduce((sum,word)=>sum+wordWidth(ctx,word,f),0)+space*(line.length-1);
}

function wrap(ctx,text,maxWidth,f){
  const lines=[];
  for(const words of parse(text)){
    if(!words.length){lines.push([]);continue}
    let line=[];
    for(const word of words){
      if(!line.length||lineWidth(ctx,line.concat([word]),f)<=maxWidth){line.push(word);continue}
      lines.push(line);
      line=[word];
    }
    lines.push(line);
  }
  while(lines.length&&!lines[lines.length-1].length)lines.pop();
  return lines;
}

function drawLine(ctx,line,x,y,f){
  segFont(ctx,f,false);
  const space=ctx.measureText(' ').width;
  for(const word of line){
    for(const seg of word){
      segFont(ctx,f,seg.hl);
      ctx.fillStyle=seg.hl?colors.highlight:colors.text;
      ctx.fillText(seg.t,x,y);
      x+=ctx.measureText(seg.t).width;
    }
    x+=space;
  }
}

function fitText(ctx,text,opts){
  let size=opts.size;
  for(;;){
    const f={weight:opts.weight,size,tracking:font.tracking};
    const lines=wrap(ctx,text,opts.width,f);
    const widest=Math.max(0,...lines.map((l)=>lineWidth(ctx,l,f)));
    const height=Math.max(1,lines.length)*size*opts.lineHeight;
    if((widest<=opts.width&&height<=opts.height)||size<=opts.minSize)return {size,lines,height,f};
    size=Math.max(opts.minSize,size-2);
  }
}

function drawAvatar(ctx,cx,cy,r){
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle='#e7e9ea';
  ctx.fillRect(cx-r,cy-r,r*2,r*2);
  if(photo){
    const side=Math.min(photo.naturalWidth,photo.naturalHeight);
    const sx=(photo.naturalWidth-side)/2,sy=(photo.naturalHeight-side)/2;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(photo,sx,sy,side,side,cx-r,cy-r,r*2,r*2);
  }
  ctx.restore();
}

function drawXBadge(ctx,x,y,size){
  const scale=size/18.8;
  ctx.save();
  ctx.translate(x-1.6*scale,y-1.6*scale);
  ctx.scale(scale,scale);
  ctx.fillStyle=X_BLUE;
  ctx.fill(new Path2D(X_BADGE));
  ctx.fillStyle='#ffffff';
  ctx.fill(new Path2D(X_CHECK));
  ctx.restore();
}

function drawMetaBadge(ctx,x,y,size){
  const r=size/2,cx=x+r,cy=y+r;
  ctx.save();
  ctx.beginPath();
  for(let i=0;i<=160;i++){
    const a=i/160*Math.PI*2;
    const rr=r*(.92+.08*Math.cos(a*8));
    const px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr;
    if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
  }
  ctx.closePath();
  ctx.fillStyle=META_BLUE;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx-r*.38,cy+r*.02);
  ctx.lineTo(cx-r*.1,cy+r*.3);
  ctx.lineTo(cx+r*.4,cy-r*.26);
  ctx.strokeStyle='#ffffff';
  ctx.lineWidth=r*.17;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.stroke();
  ctx.restore();
}

function drawIcon(ctx,name,x,y,size,color,filled){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(size/24,size/24);
  ctx.strokeStyle=color;
  ctx.fillStyle=color;
  ctx.lineWidth=1.9;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  for(const d of ICONS[name]){
    const path=new Path2D(d);
    if(filled)ctx.fill(path);
    ctx.stroke(path);
  }
  ctx.restore();
}

function cover(ctx,img,x,y,w,h){
  const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight);
  const sw=w/scale,sh=h/scale;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,x,y,w,h);
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);
}

function paintArea(ctx,x,y,w,h,color,img,dim){
  ctx.fillStyle=color;
  ctx.fillRect(x,y,w,h);
  if(!img)return;
  cover(ctx,img,x,y,w,h);
  if(dim>0){
    ctx.fillStyle=`rgba(0,0,0,${dim})`;
    ctx.fillRect(x,y,w,h);
  }
}

function mediaHeight(width){
  const list=extras.photos;
  if(!list.length)return 0;
  if(list.length>1)return Math.min(MEDIA_MAX,Math.round(width*.56));
  const aspect=Math.min(2,Math.max(.75,list[0].naturalWidth/list[0].naturalHeight));
  return Math.min(MEDIA_MAX,Math.round(width/aspect));
}

function drawMedia(ctx,x,y,w,h){
  const list=extras.photos,gap=6;
  if(!list.length)return;
  const half=(w-gap)/2,halfH=(h-gap)/2;
  const cells=list.length===1?[[x,y,w,h]]
    :list.length===2?[[x,y,half,h],[x+half+gap,y,half,h]]
    :list.length===3?[[x,y,half,h],[x+half+gap,y,half,halfH],[x+half+gap,y+halfH+gap,half,halfH]]
    :[[x,y,half,halfH],[x+half+gap,y,half,halfH],[x,y+halfH+gap,half,halfH],[x+half+gap,y+halfH+gap,half,halfH]];
  ctx.save();
  roundRect(ctx,x,y,w,h,28);
  ctx.clip();
  ctx.fillStyle=colors.bg;
  ctx.fillRect(x,y,w,h);
  cells.forEach((c,i)=>cover(ctx,list[i],c[0],c[1],c[2],c[3]));
  ctx.restore();
  ctx.save();
  roundRect(ctx,x+.5,y+.5,w-1,h-1,28);
  ctx.strokeStyle=mix(colors.text,colors.bg,.18);
  ctx.lineWidth=2;
  ctx.stroke();
  ctx.restore();
}

function drawSignature(ctx,right,bottom,color){
  const text=extras.signature.trim();
  if(!text)return;
  ctx.save();
  ctx.textAlign='right';
  ctx.fillStyle=color;
  if('letterSpacing' in ctx)ctx.letterSpacing='0px';
  ctx.font=extras.script?'600 50px Caveat,cursive':`500 30px ${font.family}`;
  ctx.fillText(text,right,bottom);
  ctx.restore();
}

function drawDots(ctx,cx,cy,gap,r,color){
  ctx.fillStyle=color;
  for(const dx of [-gap,0,gap]){ctx.beginPath();ctx.arc(cx+dx,cy,r,0,Math.PI*2);ctx.fill()}
}

function blank(ctx,bg){
  ctx.fillStyle=bg;
  ctx.fillRect(0,0,W,H);
  ctx.textBaseline='alphabetic';
  ctx.textAlign='left';
}

function layoutX(ctx,text){
  let k=1;
  for(;;){
    setFont(ctx,font.body,font.bodySize*k,font.tracking);
    const originX=BODY.inkX+ctx.measureText('A').actualBoundingBoxLeft;
    const maxWidth=BODY.maxRight-originX;
    const f={weight:font.body,size:font.bodySize*k,tracking:font.tracking};
    const lines=wrap(ctx,text,maxWidth,f);
    const widest=Math.max(0,...lines.map((l)=>lineWidth(ctx,l,f)));
    const mh=mediaHeight(BODY.maxRight-BODY.inkX);
    const height=AVATAR.r*2+(BODY.firstBase+Math.max(0,lines.length-1)*BODY.pitch+BODY.descent)*k+(mh?40+mh:0)+(showXActions()?48+52:0);
    if((widest<=maxWidth&&height<=H-MARGIN*2)||k<=BODY.minK)return {k,lines,originX,height,f,mh};
    k=Math.round((k-.02)*100)/100;
  }
}

function showXActions(){
  return extras.liked||extras.saved;
}

function drawX(ctx,text){
  const {k,lines,originX,height,f,mh}=layoutX(ctx,text);
  const top=Math.round((H-height)*.4);
  blank(ctx,colors.bg);
  paintArea(ctx,0,0,W,H,colors.bg,extras.background,extras.dim);
  drawAvatar(ctx,AVATAR.cx,top+AVATAR.r,AVATAR.r);

  ctx.fillStyle=colors.text;
  setFont(ctx,font.name,font.nameSize);
  const name=ink(ctx,NAME);
  ctx.fillText(NAME,HEAD.nameInkX+name.left,top+HEAD.nameBase);
  drawXBadge(ctx,HEAD.nameInkX+name.width+HEAD.badgeGap,top+HEAD.badgeTop,HEAD.badge);

  ctx.fillStyle=mix(colors.text,colors.bg,.67);
  setFont(ctx,font.handle,font.handleSize);
  ctx.fillText(HANDLE,HEAD.handleInkX+ink(ctx,HANDLE).left,top+HEAD.handleBase);

  const first=top+AVATAR.r*2+BODY.firstBase*k;
  lines.forEach((line,i)=>drawLine(ctx,line,originX,first+i*BODY.pitch*k,f));

  let y=first+Math.max(0,lines.length-1)*BODY.pitch*k+BODY.descent*k;
  if(mh){
    drawMedia(ctx,BODY.inkX,y+40,BODY.maxRight-BODY.inkX,mh);
    y+=40+mh;
  }
  if(showXActions()){
    const muted=mix(colors.text,colors.bg,.67),size=52,step=(BODY.maxRight-BODY.inkX-size)/4;
    ['comment','repost','heart','bookmark','share'].forEach((name,i)=>{
      const on=(name==='heart'&&extras.liked)||(name==='bookmark'&&extras.saved);
      drawIcon(ctx,name,BODY.inkX+i*step,y+48,size,on?(name==='heart'?X_PINK:X_BLUE):muted,on);
    });
  }
  drawSignature(ctx,W-56,H-48,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
}

function drawThreads(ctx,text){
  const left=72,right=W-72,r=56,textX=left+r*2+30,nameSize=46,lh=1.32;
  const mh=mediaHeight(right-textX);
  const body=fitText(ctx,text,{weight:400,size:72,minSize:30,lineHeight:lh,width:right-textX,height:H-2*MARGIN-300-(mh?mh+30:0)});
  const height=r*2-10+body.height+(mh?30+mh:0)+40+60;
  const top=Math.round((H-height)*.42);
  blank(ctx,colors.bg);
  paintArea(ctx,0,0,W,H,colors.bg,extras.background,extras.dim);
  drawAvatar(ctx,left+r,top+r,r);

  const nameBase=top+52;
  ctx.fillStyle=colors.text;
  setFont(ctx,700,nameSize);
  ctx.fillText(USER,textX,nameBase);
  const nameW=ctx.measureText(USER).width;
  drawMetaBadge(ctx,textX+nameW+12,nameBase-36,40);
  ctx.fillStyle=mix(colors.text,colors.bg,.4);
  setFont(ctx,400,nameSize);
  ctx.fillText('1h',textX+nameW+12+40+18,nameBase);
  drawDots(ctx,right-24,nameBase-14,14,4.5,colors.text);

  const first=nameBase+18+body.size*lh*.95;
  body.lines.forEach((line,i)=>drawLine(ctx,line,textX,first+i*body.size*lh,body.f));

  let iconY=first+Math.max(0,body.lines.length-1)*body.size*lh+body.size*.3+40;
  if(mh){
    drawMedia(ctx,textX,iconY-10,right-textX,mh);
    iconY+=mh+20;
  }
  ['heart','comment','repost','send'].forEach((name,i)=>{
    const on=name==='heart'&&extras.liked;
    drawIcon(ctx,name,textX-4+i*112,iconY,56,on?META_RED:colors.text,on);
  });
  drawSignature(ctx,W-56,H-48,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
}

function drawInstagram(ctx,text){
  const headH=140,img=W,r=46;
  blank(ctx,'#ffffff');
  drawAvatar(ctx,36+r,headH/2,r);
  ctx.fillStyle=TEXT;
  setFont(ctx,700,38);
  const nameX=36+r*2+24;
  ctx.fillText(USER,nameX,headH/2+13);
  drawMetaBadge(ctx,nameX+ctx.measureText(USER).width+10,headH/2-17,34);
  drawDots(ctx,W-60,headH/2,13,4.5,TEXT);

  const squarePhoto=extras.photos[0]||extras.background;
  paintArea(ctx,0,headH,W,img,colors.bg,squarePhoto,extras.photos.length&&!text?0:extras.dim);
  ctx.fillStyle='#dbdbdb';
  ctx.fillRect(0,headH,W,1);
  ctx.fillRect(0,headH+img-1,W,1);
  const pad=110;
  const body=fitText(ctx,text,{weight:font.body,size:96,minSize:36,lineHeight:1.18,width:W-pad*2,height:img-pad*2});
  const first=headH+(img-body.height)/2+body.size*.9;
  body.lines.forEach((line,i)=>drawLine(ctx,line,pad,first+i*body.size*1.18,body.f));

  drawSignature(ctx,W-48,headH+img-40,squarePhoto?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));

  const iconY=headH+img+(H-headH-img-64)/2;
  ['heart','comment','send'].forEach((name,i)=>{
    const on=name==='heart'&&extras.liked;
    drawIcon(ctx,name,32+i*96,iconY,64,on?META_RED:TEXT,on);
  });
  drawIcon(ctx,'bookmark',W-32-64,iconY,64,TEXT,extras.saved);
  const count=extras.photos.length;
  for(let i=0;i<count&&count>1;i++){
    ctx.fillStyle=i?'#c7c7c7':META_BLUE;
    ctx.beginPath();
    ctx.arc(W/2+(i-(count-1)/2)*22,iconY+32,6,0,Math.PI*2);
    ctx.fill();
  }
}

const STYLES={x:drawX,threads:drawThreads,instagram:drawInstagram};

function style(){
  const picked=document.querySelector('input[name="qi-style"]:checked');
  return picked&&STYLES[picked.value]?picked.value:'x';
}

function readColors(){
  const valid=(v,fallback)=>/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():fallback;
  colors={bg:valid(els.bg.value,'#ffffff'),text:valid(els.color.value,TEXT),highlight:valid(els.highlight.value,X_BLUE)};
  document.querySelectorAll('[data-qi-bg]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.qiBg===colors.bg&&b.dataset.qiText===colors.text)));
}

function readExtras(){
  extras.dim=Number(els.dim.value)/100;
  extras.liked=els.liked.checked;
  extras.saved=els.saved.checked;
  extras.signature=els.signature.value;
  extras.script=els.script.checked;
  els.photosClear.hidden=!extras.photos.length;
  els.backgroundClear.hidden=!extras.background;
  els.dimRow.hidden=!extras.background&&!(style()==='instagram'&&extras.photos.length);
}

function draw(){
  readColors();
  readExtras();
  const ctx=els.canvas.getContext('2d');
  STYLES[style()](ctx,els.text.value.trim());
}

function fileName(){
  const slug=els.text.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').split('-').slice(0,6).join('-');
  return `${USER}-${style()}-${slug||'post'}.png`;
}

function download(){
  draw();
  els.canvas.toBlob((blob)=>{
    if(!blob)return;
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  },'image/png');
}

function copy(){
  draw();
  const label=els.copy.textContent;
  const done=(text)=>{els.copy.textContent=text;setTimeout(()=>{els.copy.textContent=label},2000)};
  const png=new Promise((resolve,reject)=>els.canvas.toBlob((blob)=>blob?resolve(blob):reject(new Error('no image')),'image/png'));
  navigator.clipboard.write([new ClipboardItem({'image/png':png})]).then(()=>done('Copied'),()=>done('Copy failed, use Download'));
}

function loadFile(file){
  return new Promise((resolve)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>resolve(img);
    img.onerror=()=>{URL.revokeObjectURL(url);resolve(null)};
    img.src=url;
  });
}

function release(list){
  list.filter(Boolean).forEach((img)=>URL.revokeObjectURL(img.src));
}

function pickPhotos(){
  const files=[...els.photos.files].filter((f)=>/^image\//.test(f.type)).slice(0,MAX_PHOTOS);
  els.photos.value='';
  if(!files.length)return;
  Promise.all(files.map(loadFile)).then((imgs)=>{
    release(extras.photos);
    extras.photos=imgs.filter(Boolean);
    if(font)draw();
  });
}

function pickBackground(){
  const file=els.background.files[0];
  els.background.value='';
  if(!file||!/^image\//.test(file.type))return;
  loadFile(file).then((img)=>{
    if(!img)return;
    release([extras.background]);
    extras.background=img;
    if(font)draw();
  });
}

function loadPhoto(){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>{photo=img;resolve()};
    img.onerror=()=>resolve();
    img.src=PHOTO;
  });
}

function loadFonts(){
  if(!document.fonts||!document.fonts.load)return Promise.resolve();
  return Promise.all(['400','500','700'].map((w)=>document.fonts.load(`${w} 100px Inter`)).concat(document.fonts.load('600 50px Caveat'))).catch(()=>{});
}

function init(){
  els.canvas=$('qi-canvas');
  els.text=$('qi-text');
  els.download=$('qi-download');
  els.bg=$('qi-bg');
  els.color=$('qi-color');
  els.highlight=$('qi-highlight');
  els.copy=$('qi-copy');
  els.photos=$('qi-photos');
  els.photosClear=$('qi-photos-clear');
  els.background=$('qi-background');
  els.backgroundClear=$('qi-background-clear');
  els.dim=$('qi-dim');
  els.dimRow=$('qi-dim-row');
  els.liked=$('qi-liked');
  els.saved=$('qi-saved');
  els.signature=$('qi-signature');
  els.script=$('qi-script');
  Promise.all([loadPhoto(),loadFonts()]).then(()=>{
    pickFont(els.canvas.getContext('2d'));
    draw();
  });
  els.text.addEventListener('input',()=>{if(font)draw()});
  document.querySelectorAll('input[name="qi-style"]').forEach((input)=>input.addEventListener('change',()=>{if(font)draw()}));
  els.download.addEventListener('click',()=>{if(font)download()});
  if(window.ClipboardItem&&navigator.clipboard&&navigator.clipboard.write){
    els.copy.hidden=false;
    els.copy.addEventListener('click',()=>{if(font)copy()});
  }
  [els.bg,els.color,els.highlight,els.dim,els.signature].forEach((input)=>input.addEventListener('input',()=>{if(font)draw()}));
  [els.liked,els.saved,els.script].forEach((input)=>input.addEventListener('change',()=>{if(font)draw()}));
  els.photos.addEventListener('change',pickPhotos);
  els.background.addEventListener('change',pickBackground);
  els.photosClear.addEventListener('click',()=>{release(extras.photos);extras.photos=[];if(font)draw()});
  els.backgroundClear.addEventListener('click',()=>{release([extras.background]);extras.background=null;if(font)draw()});
  document.querySelectorAll('[data-qi-bg]').forEach((button)=>{
    button.style.background=button.dataset.qiBg;
    button.style.color=button.dataset.qiText;
  });
  document.querySelectorAll('[data-qi-bg]').forEach((button)=>button.addEventListener('click',()=>{
    els.bg.value=button.dataset.qiBg;
    els.color.value=button.dataset.qiText;
    if(font)draw();
  }));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
