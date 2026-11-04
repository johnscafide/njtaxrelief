/* Quote Image (Backoffice owner only).
   Draws John's text as a 1122x1402 post mockup in X, Threads or Instagram style
   and saves it as a PNG. Everything stays in this browser tab.
   The X layout is measured from John's sample image. Apple devices use the
   system font (SF Pro); everything else uses Inter, sized to match. */
(function(){
'use strict';
const W=1122;
const SIZES={portrait:1402,square:1122,story:1995};
let H=SIZES.portrait;
const NAME='John Scafide',USER='johnvscafide',HANDLE='@'+USER;
const PHOTO='/property/backoffice/quote-image/john-profile.jpg';
const AVATAR={cx:193,r:128};
const HEAD={nameInkX:359,nameInkW:437,nameBase:130,handleInkX:360,handleInkW:384,handleBase:201,badge:68,badgeTop:71,badgeGap:22};
const BODY={inkX:82,maxRight:1040,sample:'A lot of confidence',sampleW:942,firstBase:201,pitch:122,descent:22,minK:.4};
const MARGIN=110;
const TEXT='#000000',X_BLUE='#1d9bf0',META_BLUE='#0095f6',X_PINK='#f91880',META_RED='#ff3040';
const MEDIA_MAX=520,MAX_PHOTOS=4,MAX_SLIDES=10;
const IOS_BLUE='#0b84fe',NOTES_GOLD='#e0a400';
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
let slide={i:0,n:1};
let current=0,shown=0;
let question='';
let data=[];
let dataStyle='table';
let slideRaw='';
let extras={photos:[],background:null,dim:.35,liked:false,saved:false,signature:'',script:true,counts:{}};

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

function drawLine(ctx,line,x,y,f,color,hlColor){
  segFont(ctx,f,false);
  const space=ctx.measureText(' ').width;
  for(const word of line){
    for(const seg of word){
      segFont(ctx,f,seg.hl);
      ctx.fillStyle=seg.hl?(hlColor||colors.highlight):(color||colors.text);
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

function splitData(text){
  const rows=[],keep=[];
  for(const line of text.split('\n')){
    if(/\t|\|/.test(line)){
      const cells=line.split(/\t|\|/).map((c)=>c.trim());
      while(cells.length&&!cells[0])cells.shift();
      while(cells.length&&!cells[cells.length-1])cells.pop();
      if(cells.length&&!cells.every((c)=>/^:?-+:?$/.test(c)))rows.push(cells);
    }else keep.push(line);
  }
  return {text:keep.join('\n').replace(/\n{3,}/g,'\n\n').trim(),rows};
}

function cellText(cell){
  const m=/^\*(.+)\*$/.exec(cell);
  return m?{t:m[1],hl:true}:{t:cell.replace(/\*/g,''),hl:false};
}

function numberOf(cell){
  const m=String(cell).replace(/[,$\s*]/g,'').match(/^[-+]?\d*\.?\d+/);
  if(!m)return NaN;
  const n=Number(m[0]),unit=String(cell).replace(/[,$\s*]/g,'').slice(m[0].length).toUpperCase();
  return n*(unit.startsWith('B')?1e9:unit.startsWith('M')?1e6:unit.startsWith('K')?1e3:1);
}

function fitCell(ctx,text,max){
  if(ctx.measureText(text).width<=max)return text;
  let t=text;
  while(t.length>1&&ctx.measureText(t+'\u2026').width>max)t=t.slice(0,-1);
  return t+'\u2026';
}

function dataBase(w){
  return Math.max(20,Math.min(38,w/26));
}

function layoutTable(ctx,w,f){
  const cols=Math.max(...data.map((r)=>r.length));
  const pad=f*.7,rowH=f*2;
  const numeric=[...Array(cols)].map((_,c)=>{
    const body=data.slice(1).map((r)=>r[c]).filter(Boolean);
    return body.length>0&&body.every((v)=>!Number.isNaN(numberOf(v)));
  });
  const widths=[...Array(cols)].map((_,c)=>Math.max(...data.map((r,i)=>{
    setFont(ctx,i===0||cellText(r[c]||'').hl?700:font.body,f);
    return ctx.measureText(cellText(r[c]||'').t).width;
  }))+pad*2);
  const total=widths.reduce((a,b)=>a+b,0);
  if(total<w){
    const text=[...Array(cols).keys()].filter((c)=>!numeric[c]);
    const grow=text.length?text.reduce((a,c)=>(widths[c]>widths[a]?c:a),text[0]):0;
    widths[grow]+=w-total;
  }
  else{const k=w/total;for(let c=0;c<cols;c++)widths[c]*=k}
  return {h:data.length*rowH,draw(x,y){
    ctx.save();
    roundRect(ctx,x,y,w,data.length*rowH,Math.min(24,f*.7));
    ctx.fillStyle=colors.bg;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle=mix(colors.text,colors.bg,.09);
    ctx.fillRect(x,y,w,rowH);
    data.forEach((row,i)=>{
      const top=y+i*rowH;
      if(i>0&&i%2===0){ctx.fillStyle=mix(colors.text,colors.bg,.035);ctx.fillRect(x,top,w,rowH)}
      let cx=x;
      for(let c=0;c<cols;c++){
        const cell=cellText(row[c]||'');
        setFont(ctx,i===0||cell.hl||c===0?700:font.body,i===0?f*.9:f);
        ctx.fillStyle=cell.hl?colors.highlight:i===0?mix(colors.text,colors.bg,.7):colors.text;
        const text=fitCell(ctx,cell.t,widths[c]-pad*2);
        const right=numeric[c]&&c>0;
        ctx.textAlign=right?'right':'left';
        ctx.fillText(text,right?cx+widths[c]-pad:cx+pad,top+rowH/2+f*.36);
        cx+=widths[c];
      }
    });
    ctx.restore();
    ctx.save();
    roundRect(ctx,x+.5,y+.5,w-1,data.length*rowH-1,Math.min(24,f*.7));
    ctx.strokeStyle=mix(colors.text,colors.bg,.16);
    ctx.lineWidth=2;
    ctx.stroke();
    ctx.restore();
  }};
}

function layoutBars(ctx,w,f){
  const rows=data.filter((r)=>r.length>1&&!Number.isNaN(numberOf(r[1])));
  const list=rows.length?rows:data.slice(1);
  const values=list.map((r)=>Math.abs(numberOf(r[1]))||0);
  const max=Math.max(...values,0)||1;
  const rowH=f*2.1,gap=f*.6;
  setFont(ctx,700,f);
  const labelW=Math.min(w*.42,Math.max(...list.map((r)=>ctx.measureText(cellText(r[0]||'').t).width))+f*.6);
  const valueW=Math.max(...list.map((r)=>ctx.measureText(cellText(r[1]||'').t).width))+f*.6;
  const barW=Math.max(f,w-labelW-valueW);
  return {h:list.length*rowH,draw(x,y){
    ctx.save();
    list.forEach((row,i)=>{
      const top=y+i*rowH,mid=top+rowH/2;
      const label=cellText(row[0]||''),value=cellText(row[1]||'');
      setFont(ctx,700,f);
      ctx.fillStyle=colors.text;
      ctx.textAlign='left';
      ctx.fillText(fitCell(ctx,label.t,labelW-f*.6),x,mid+f*.36);
      roundRect(ctx,x+labelW,mid-(rowH-gap)/2,barW,rowH-gap,(rowH-gap)/2.6);
      ctx.fillStyle=mix(colors.text,colors.bg,.08);
      ctx.fill();
      roundRect(ctx,x+labelW,mid-(rowH-gap)/2,Math.max(rowH-gap,barW*values[i]/max),rowH-gap,(rowH-gap)/2.6);
      ctx.fillStyle=colors.highlight;
      ctx.fill();
      ctx.fillStyle=value.hl?colors.highlight:colors.text;
      ctx.fillText(value.t,x+labelW+barW+f*.4,mid+f*.36);
    });
    ctx.restore();
  }};
}

function layoutStats(ctx,w,f){
  const list=data.filter((r)=>r[0]);
  const n=list.length,cols=n===1?1:n===2||n===4?2:3;
  const gap=f*.7,cw=(w-gap*(cols-1))/cols,ch=f*5.3;
  const rowsN=Math.ceil(n/cols);
  return {h:rowsN*ch+(rowsN-1)*gap,draw(x,y){
    ctx.save();
    list.forEach((row,i)=>{
      const cx=x+(i%cols)*(cw+gap),cy=y+Math.floor(i/cols)*(ch+gap);
      roundRect(ctx,cx,cy,cw,ch,Math.min(28,f*.8));
      ctx.fillStyle=lightBg()?mix(colors.text,colors.bg,.06):mix(colors.text,colors.bg,.12);
      ctx.fill();
      const value=cellText(row[0]),label=cellText(row.slice(1).join(' '));
      let size=f*2.2;
      setFont(ctx,800,size);
      while(size>f&&ctx.measureText(value.t).width>cw-f*1.2){size-=2;setFont(ctx,800,size)}
      ctx.fillStyle=colors.highlight;
      ctx.textAlign='left';
      ctx.fillText(value.t,cx+f*.6,cy+f*.5+size*.82);
      setFont(ctx,500,f*.82);
      ctx.fillStyle=mix(colors.text,colors.bg,.72);
      const lines=wrap(ctx,label.t,cw-f*1.2,{weight:500,size:f*.82,tracking:font.tracking}).slice(0,2);
      lines.forEach((line,j)=>drawLine(ctx,line,cx+f*.6,cy+ch-f*.6-(lines.length-1-j)*f*1.05,{weight:500,size:f*.82,tracking:font.tracking},mix(colors.text,colors.bg,.72)));
    });
    ctx.restore();
  }};
}

function layoutData(ctx,w,f){
  if(!data.length)return {h:0,draw(){}};
  if(dataStyle==='bars')return layoutBars(ctx,w,f);
  if(dataStyle==='stats')return layoutStats(ctx,w,f);
  return layoutTable(ctx,w,f);
}

function photosHeight(width){
  const list=extras.photos;
  if(!list.length)return 0;
  if(list.length>1)return Math.min(MEDIA_MAX,Math.round(width*.56));
  const aspect=Math.min(2,Math.max(.75,list[0].naturalWidth/list[0].naturalHeight));
  return Math.min(MEDIA_MAX,Math.round(width/aspect));
}

function dataHeight(width){
  if(!data.length)return 0;
  return Math.min(Math.round(H*.55),Math.round(layoutData(els.canvas.getContext('2d'),width,dataBase(width)).h));
}

function mediaHeight(width){
  const ph=photosHeight(width),dh=dataHeight(width);
  return ph+dh+(ph&&dh?30:0);
}

function drawMedia(ctx,x,y,w,h){
  let dh=dataHeight(w);
  const ph0=photosHeight(w);
  let ph=ph0;
  if(ph&&dh){
    const room=h-30,k=Math.min(1,room/(ph+dh));
    ph=Math.round(ph*k);dh=Math.round(dh*k);
  }else if(dh)dh=Math.min(dh,h);
  else ph=h;
  if(ph)drawPhotos(ctx,x,y,w,ph);
  if(dh)drawData(ctx,x,y+(ph?ph+30:0),w,dh);
}

function drawData(ctx,x,top,w,dh){
  let f=dataBase(w),lay=layoutData(ctx,w,f);
  if(lay.h>dh){f*=dh/lay.h;lay=layoutData(ctx,w,f)}
  if(extras.background&&dataStyle!=='table'){
    ctx.save();
    roundRect(ctx,x-f*.6,top-f*.6,w+f*1.2,lay.h+f*1.2,Math.min(28,f));
    ctx.fillStyle=colors.bg;
    ctx.globalAlpha=.9;
    ctx.fill();
    ctx.restore();
  }
  lay.draw(x,top);
}

function drawPhotos(ctx,x,y,w,h){
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

function shortCount(raw){
  const v=String(raw||'').trim();
  if(!/^\d[\d,]*$/.test(v))return v;
  const n=Number(v.replace(/,/g,''));
  const cut=(x,unit)=>(x<10?Math.floor(x*10)/10:Math.floor(x))+unit;
  if(n>=1e6)return cut(n/1e6,'M');
  if(n>=1e4||(n>=1e3&&n%1000!==0))return cut(n/1e3,'K');
  if(n>=1e3)return (n/1e3)+'K';
  return String(n);
}

function hasCounts(){
  return Object.values(extras.counts).some(Boolean);
}

function iconRow(ctx,items,x,y,size,gap,fontSize){
  setFont(ctx,500,fontSize);
  for(const item of items){
    drawIcon(ctx,item.name,x,y,size,item.color,item.on);
    x+=size;
    const label=shortCount(extras.counts[item.count]);
    if(label){
      ctx.fillStyle=item.textColor||item.color;
      ctx.fillText(label,x+fontSize*.3,y+size/2+fontSize*.36);
      x+=fontSize*.3+ctx.measureText(label).width;
    }
    x+=gap;
  }
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

function measureQ(ctx,q,width,size){
  if(!q)return {h:0};
  const pad=Math.round(size*.7);
  const f={weight:font.body,size,tracking:font.tracking};
  const lines=wrap(ctx,q,width-pad*2,f);
  return {h:lines.length*size*1.3+pad*2-size*.3,lines,f,pad,size};
}

function drawQ(ctx,box,x,y,w){
  if(!box.h)return;
  ctx.save();
  roundRect(ctx,x,y,w,box.h,Math.min(36,box.size));
  ctx.fillStyle=mix(colors.text,colors.bg,.07);
  ctx.fill();
  ctx.restore();
  const color=mix(colors.text,colors.bg,.75);
  box.lines.forEach((line,i)=>drawLine(ctx,line,x+box.pad,y+box.pad+box.size*.82+i*box.size*1.3,box.f,color));
}

function drawCounter(ctx,color){
  if(slide.n<2)return;
  ctx.save();
  ctx.textAlign='right';
  ctx.fillStyle=color;
  setFont(ctx,500,34);
  ctx.fillText(`${slide.i+1}/${slide.n}`,W-56,84);
  ctx.restore();
}

function lightBg(){
  const [r,g,b]=hexRgb(colors.bg);
  return r*.299+g*.587+b*.114>140;
}

function drawFooter(ctx,y,color){
  const r=40;
  drawAvatar(ctx,64+r,y-r,r);
  ctx.fillStyle=color;
  setFont(ctx,700,34);
  ctx.fillText(NAME,64+r*2+20,y-r+2);
  const nameW=ctx.measureText(NAME).width;
  drawMetaBadge(ctx,64+r*2+20+nameW+10,y-r-26,30);
  ctx.fillStyle=mix(colors.text,colors.bg,.6);
  setFont(ctx,400,28);
  ctx.fillText(HANDLE,64+r*2+20,y-r+38);
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

function layoutX(ctx,text,q){
  let k=1;
  for(;;){
    setFont(ctx,font.body,font.bodySize*k,font.tracking);
    const originX=BODY.inkX+ctx.measureText('A').actualBoundingBoxLeft;
    const maxWidth=BODY.maxRight-originX;
    const f={weight:font.body,size:font.bodySize*k,tracking:font.tracking};
    const lines=wrap(ctx,text,maxWidth,f);
    const widest=Math.max(0,...lines.map((l)=>lineWidth(ctx,l,f)));
    const mh=mediaHeight(BODY.maxRight-BODY.inkX);
    const qb=measureQ(ctx,q,BODY.maxRight-BODY.inkX,Math.round(48*Math.max(k,.7)));
    const height=(qb.h?qb.h+40:0)+AVATAR.r*2+(BODY.firstBase+Math.max(0,lines.length-1)*BODY.pitch+BODY.descent)*k+(mh?40+mh:0)+(showXActions()?48+52:0);
    if((widest<=maxWidth&&height<=H-MARGIN*2)||k<=BODY.minK)return {k,lines,originX,height,f,mh,qb};
    k=Math.round((k-.02)*100)/100;
  }
}

function showXActions(){
  return extras.liked||extras.saved||hasCounts();
}

function drawX(ctx,text,q){
  const {k,lines,originX,height,f,mh,qb}=layoutX(ctx,text,q);
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

  drawQ(ctx,qb,BODY.inkX,top+AVATAR.r*2+48,BODY.maxRight-BODY.inkX);
  const first=top+AVATAR.r*2+(qb.h?qb.h+40:0)+BODY.firstBase*k;
  lines.forEach((line,i)=>drawLine(ctx,line,originX,first+i*BODY.pitch*k,f));

  let y=first+Math.max(0,lines.length-1)*BODY.pitch*k+BODY.descent*k;
  if(mh){
    drawMedia(ctx,BODY.inkX,y+40,BODY.maxRight-BODY.inkX,mh);
    y+=40+mh;
  }
  if(showXActions()){
    const muted=mix(colors.text,colors.bg,.67),size=52,step=(BODY.maxRight-BODY.inkX-size)/4;
    const counts={comment:'comments',repost:'reposts',heart:'likes'};
    setFont(ctx,500,40);
    ['comment','repost','heart','bookmark','share'].forEach((name,i)=>{
      const on=(name==='heart'&&extras.liked)||(name==='bookmark'&&extras.saved);
      const color=on?(name==='heart'?X_PINK:X_BLUE):muted;
      drawIcon(ctx,name,BODY.inkX+i*step,y+48,size,color,on);
      const label=shortCount(extras.counts[counts[name]]);
      if(label){
        ctx.fillStyle=color;
        ctx.fillText(label,BODY.inkX+i*step+size+12,y+48+size/2+14);
      }
    });
  }
  drawSignature(ctx,W-56,H-48,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
  drawCounter(ctx,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
}

function drawThreads(ctx,text,q){
  const left=72,right=W-72,r=56,textX=left+r*2+30,nameSize=46,lh=1.32;
  const mh=mediaHeight(right-textX);
  const qb=measureQ(ctx,q,right-textX,40);
  const qh=qb.h?qb.h+30:0;
  const body=fitText(ctx,text,{weight:400,size:72,minSize:30,lineHeight:lh,width:right-textX,height:H-2*MARGIN-300-(mh?mh+30:0)-qh});
  const height=r*2-10+qh+body.height+(mh?30+mh:0)+40+60;
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

  drawQ(ctx,qb,textX,nameBase+30,right-textX);
  const first=nameBase+18+qh+body.size*lh*.95;
  body.lines.forEach((line,i)=>drawLine(ctx,line,textX,first+i*body.size*lh,body.f));

  let iconY=first+Math.max(0,body.lines.length-1)*body.size*lh+body.size*.3+40;
  if(mh){
    drawMedia(ctx,textX,iconY-10,right-textX,mh);
    iconY+=mh+20;
  }
  if(hasCounts()){
    iconRow(ctx,[['heart','likes'],['comment','comments'],['repost','reposts'],['send','shares']].map(([name,count])=>{
      const on=name==='heart'&&extras.liked;
      return {name,count,on,color:on?META_RED:colors.text,textColor:mix(colors.text,colors.bg,.6)};
    }),textX-4,iconY,56,56,38);
  }else{
    ['heart','comment','repost','send'].forEach((name,i)=>{
      const on=name==='heart'&&extras.liked;
      drawIcon(ctx,name,textX-4+i*112,iconY,56,on?META_RED:colors.text,on);
    });
  }
  drawSignature(ctx,W-56,H-48,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
  drawCounter(ctx,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
}

function drawInstagram(ctx,text,q){
  const headH=140,img=Math.min(W,H-280),r=46,footH=140;
  blank(ctx,'#ffffff');
  ctx.save();
  ctx.translate(0,Math.round((H-headH-img-footH)/2));
  drawAvatar(ctx,36+r,headH/2,r);
  ctx.fillStyle=TEXT;
  setFont(ctx,700,38);
  const nameX=36+r*2+24;
  ctx.fillText(USER,nameX,headH/2+13);
  drawMetaBadge(ctx,nameX+ctx.measureText(USER).width+10,headH/2-17,34);
  drawDots(ctx,W-60,headH/2,13,4.5,TEXT);

  const squarePhoto=extras.background;
  paintArea(ctx,0,headH,W,img,colors.bg,squarePhoto,extras.dim);
  ctx.fillStyle='#dbdbdb';
  ctx.fillRect(0,headH,W,1);
  ctx.fillRect(0,headH+img-1,W,1);
  const pad=extras.photos.length?80:110,lh=1.18,gap=text?40:0;
  const sig=extras.signature.trim()?60:0;
  const mh=Math.min(mediaHeight(W-pad*2),Math.round(img*.5));
  const qb=measureQ(ctx,q,W-pad*2,40);
  const qh=qb.h?qb.h+36:0;
  const body=text?fitText(ctx,text,{weight:font.body,size:96,minSize:30,lineHeight:lh,width:W-pad*2,height:img-pad*2-sig-qh-(mh?mh+gap:0)}):{lines:[],height:0};
  const blockTop=headH+(img-sig-(qh+body.height+(mh?gap+mh:0)))/2;
  drawQ(ctx,qb,pad,blockTop,W-pad*2);
  const first=blockTop+qh+(body.size||0)*.9;
  body.lines.forEach((line,i)=>drawLine(ctx,line,pad,first+i*body.size*lh,body.f));
  if(mh)drawMedia(ctx,pad,blockTop+qh+body.height+gap,W-pad*2,mh);

  drawSignature(ctx,W-48,headH+img-40,squarePhoto?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));

  if(slide.n>1){
    setFont(ctx,500,30);
    const label=`${slide.i+1}/${slide.n}`,lw=ctx.measureText(label).width+36;
    roundRect(ctx,W-36-lw,headH+30,lw,56,28);
    ctx.fillStyle='rgba(18,18,18,.72)';
    ctx.fill();
    ctx.fillStyle='#ffffff';
    ctx.textAlign='center';
    ctx.fillText(label,W-36-lw/2,headH+30+39);
    ctx.textAlign='left';
    for(let i=0;i<slide.n;i++){
      ctx.beginPath();
      ctx.arc(W/2+(i-(slide.n-1)/2)*24,headH+img+footH/2,6,0,Math.PI*2);
      ctx.fillStyle=i===slide.i?META_BLUE:'#c7c7c7';
      ctx.fill();
    }
  }
  const iconY=headH+img+(footH-64)/2;
  if(hasCounts()){
    iconRow(ctx,[['heart','likes'],['comment','comments'],['send','shares']].map(([name,count])=>{
      const on=name==='heart'&&extras.liked;
      return {name,count,on,color:on?META_RED:TEXT,textColor:TEXT};
    }),32,iconY,64,48,40);
  }else{
    ['heart','comment','send'].forEach((name,i)=>{
      const on=name==='heart'&&extras.liked;
      drawIcon(ctx,name,32+i*96,iconY,64,on?META_RED:TEXT,on);
    });
  }
  drawIcon(ctx,'bookmark',W-32-64,iconY,64,TEXT,extras.saved);
  ctx.restore();
}

function drawNotes(ctx,text,q){
  blank(ctx,colors.bg);
  paintArea(ctx,0,0,W,H,colors.bg,extras.background,extras.dim);
  const left=72,width=W-left*2,gold=NOTES_GOLD;
  ctx.strokeStyle=gold;
  ctx.lineWidth=7;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(left+22,96);ctx.lineTo(left,122);ctx.lineTo(left+22,148);
  ctx.stroke();
  ctx.fillStyle=gold;
  setFont(ctx,500,46);
  ctx.fillText('Notes',left+44,138);
  drawIcon(ctx,'share',W-left-150,96,52,gold,false);
  ctx.beginPath();
  ctx.arc(W-left-28,122,28,0,Math.PI*2);
  ctx.strokeStyle=gold;
  ctx.lineWidth=4;
  ctx.stroke();
  drawDots(ctx,W-left-28,122,11,4,gold);

  const now=new Date();
  const stamp=now.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+' at '+now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  ctx.textAlign='center';
  ctx.fillStyle=mix(colors.text,colors.bg,.5);
  setFont(ctx,400,30);
  ctx.fillText(stamp,W/2,230);
  ctx.textAlign='left';

  let title=q,rest=text;
  if(!title){
    const cut=text.indexOf('\n');
    title=cut<0?text:text.slice(0,cut);
    rest=cut<0?'':text.slice(cut+1).replace(/^\s*\n/,'');
  }
  const footer=160,top=290;
  const mh=mediaHeight(width);
  const room=H-top-footer-(mh?mh+40:0);
  const head=fitText(ctx,title,{weight:700,size:76,minSize:36,lineHeight:1.18,width,height:Math.round(room*(rest?.4:1))});
  const body=rest?fitText(ctx,rest,{weight:400,size:52,minSize:28,lineHeight:1.4,width,height:room-head.height-30}):{lines:[],height:0,size:0};
  head.lines.forEach((line,i)=>drawLine(ctx,line,left,top+head.size*.95+i*head.size*1.18,head.f));
  const bodyTop=top+head.height+30;
  body.lines.forEach((line,i)=>drawLine(ctx,line,left,bodyTop+body.size*1.02+i*body.size*1.4,body.f));
  if(mh)drawMedia(ctx,left,bodyTop+body.height+(body.height?30:0),width,mh);
  drawFooter(ctx,H-56,colors.text);
  drawSignature(ctx,W-56,H-48,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
  drawCounter(ctx,mix(colors.text,colors.bg,.6));
}

function bubbleLayout(ctx,text,q,size,maxW){
  const pad={x:Math.round(size*.62),y:Math.round(size*.42)},lh=size*1.28;
  const f={weight:400,size,tracking:font.tracking};
  const list=[];
  if(q)list.push({out:true,text:q});
  text.split(/\n\s*\n/).map((t)=>t.trim()).filter(Boolean).forEach((t)=>list.push({out:false,text:t}));
  let h=0,prev=null;
  for(const b of list){
    b.lines=wrap(ctx,b.text,maxW-pad.x*2,f);
    b.w=Math.max(size*1.6,...b.lines.map((l)=>lineWidth(ctx,l,f)))+pad.x*2;
    b.h=b.lines.length*lh-(lh-size)+pad.y*2+size*.25;
    b.gap=prev===null?0:(prev===b.out?12:34);
    h+=b.gap+b.h;
    prev=b.out;
  }
  return {list,h,f,pad,lh,size};
}

function bubble(ctx,x,y,w,h,r,out,color){
  ctx.fillStyle=color;
  roundRect(ctx,x,y,w,h,r);
  ctx.fill();
  ctx.beginPath();
  if(out){
    ctx.moveTo(x+w-30,y+h-36);
    ctx.quadraticCurveTo(x+w-4,y+h-6,x+w+14,y+h);
    ctx.quadraticCurveTo(x+w-22,y+h+2,x+w-46,y+h-14);
  }else{
    ctx.moveTo(x+30,y+h-36);
    ctx.quadraticCurveTo(x+4,y+h-6,x-14,y+h);
    ctx.quadraticCurveTo(x+22,y+h+2,x+46,y+h-14);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMessages(ctx,text,q){
  blank(ctx,colors.bg);
  paintArea(ctx,0,0,W,H,colors.bg,extras.background,extras.dim);
  const r=64;
  drawAvatar(ctx,W/2,64+r,r);
  ctx.textAlign='center';
  ctx.fillStyle=colors.text;
  setFont(ctx,500,32);
  ctx.fillText(NAME+'  \u203a',W/2,64+r*2+50);
  ctx.fillStyle=mix(colors.text,colors.bg,.12);
  ctx.fillRect(0,64+r*2+84,W,2);

  const side=56,maxW=Math.round((W-side*2)*.76),top=64+r*2+120,bottom=H-90;
  const mw=data.length?maxW:Math.round(W*.6),mh=(extras.photos.length||data.length)?Math.min(mediaHeight(mw),Math.round((bottom-top)*.55)):0;
  let lay;
  for(let size=54;;size-=2){
    lay=bubbleLayout(ctx,text,q,size,maxW);
    if(lay.h+(mh?mh+34:0)+80<=bottom-top||size<=26)break;
  }
  const total=80+lay.h+(mh?mh+34:0);
  const start=top+Math.max(0,(bottom-top-total)*.4);
  let y=start;
  const now=new Date();
  ctx.textAlign='center';
  ctx.fillStyle=mix(colors.text,colors.bg,.5);
  setFont(ctx,400,26);
  ctx.fillText('Today '+now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),W/2,y+30);
  ctx.textAlign='left';
  y+=80;
  const inFill=lightBg()?mix(colors.text,colors.bg,.09):mix(colors.text,colors.bg,.18);
  const radius=Math.round(lay.size*.85);
  let heartAt=null;
  lay.list.forEach((b,i)=>{
    y+=b.gap;
    const x=b.out?W-side-b.w:side;
    const next=lay.list[i+1];
    const tail=!next||next.out!==b.out;
    if(tail)bubble(ctx,x,y,b.w,b.h,radius,b.out,b.out?IOS_BLUE:inFill);
    else{ctx.fillStyle=b.out?IOS_BLUE:inFill;roundRect(ctx,x,y,b.w,b.h,radius);ctx.fill()}
    b.lines.forEach((line,j)=>drawLine(ctx,line,x+lay.pad.x,y+lay.pad.y+lay.size*.92+j*lay.lh,lay.f,b.out?'#ffffff':colors.text,b.out?'#ffffff':colors.highlight));
    if(!b.out)heartAt={x:x+b.w-6,y:y-6};
    y+=b.h;
  });
  if(mh){
    y+=34;
    drawMedia(ctx,side,y,mw,mh);
  }
  if(extras.liked&&heartAt){
    ctx.beginPath();
    ctx.arc(heartAt.x,heartAt.y,34,0,Math.PI*2);
    ctx.fillStyle=IOS_BLUE;
    ctx.fill();
    ctx.lineWidth=5;
    ctx.strokeStyle=colors.bg;
    ctx.stroke();
    drawIcon(ctx,'heart',heartAt.x-18,heartAt.y-17,36,'#ffffff',true);
  }
  drawSignature(ctx,W-56,H-40,extras.background?'rgba(255,255,255,.88)':mix(colors.text,colors.bg,.6));
  drawCounter(ctx,mix(colors.text,colors.bg,.6));
}

function drawCard(ctx,text,q){
  blank(ctx,colors.bg);
  paintArea(ctx,0,0,W,H,colors.bg,extras.background,extras.dim);
  const pad=96,width=W-pad*2,footer=200;
  const muted=extras.background?'rgba(255,255,255,.8)':mix(colors.text,colors.bg,.6);
  const qf={weight:font.body,size:46,tracking:font.tracking};
  const qLines=q?wrap(ctx,q,width,qf):[];
  const qh=qLines.length?qLines.length*46*1.3+40:0;
  const mh=mediaHeight(width);
  const body=fitText(ctx,text,{weight:700,size:128,minSize:36,lineHeight:1.1,width,height:H-pad*2-footer-qh-(mh?mh+40:0)});
  const total=qh+body.height+(mh?mh+40:0);
  const top=pad+Math.max(0,(H-pad*2-footer-total)*.45);
  qLines.forEach((line,i)=>drawLine(ctx,line,pad,top+46*.9+i*46*1.3,qf,muted));
  body.lines.forEach((line,i)=>drawLine(ctx,line,pad,top+qh+body.size*.92+i*body.size*1.1,body.f));
  if(mh)drawMedia(ctx,pad,top+qh+body.height+40,width,mh);
  drawFooter(ctx,H-72,extras.background?'#ffffff':colors.text);
  drawSignature(ctx,W-56,H-60,muted);
  drawCounter(ctx,muted);
}

function centerLines(ctx,fit,y,lh,color){
  fit.lines.forEach((line,i)=>drawLine(ctx,line,(W-lineWidth(ctx,line,fit.f))/2,y+fit.size*.9+i*fit.size*lh,fit.f,color));
}

function drawPhotoLook(ctx,text,q){
  blank(ctx,colors.bg);
  paintArea(ctx,0,0,W,H,colors.bg,extras.background,extras.dim);
  const pad=88,width=W-pad*2,top0=104,footer=130,gap=48;
  const avail=H-top0-footer;
  const muted=extras.background?'rgba(255,255,255,.8)':mix(colors.text,colors.bg,.6);
  const paras=text.split(/\n[ \t]*\n/).map((t)=>t.trim()).filter(Boolean);
  const head=paras[0]||'',tail=paras.slice(1).join('\n');
  const list=extras.photos;
  let ph=0;
  if(list.length){
    const aspect=list.length>1?1.2:Math.min(1.9,Math.max(.8,list[0].naturalWidth/list[0].naturalHeight));
    ph=Math.round(Math.min(width/aspect,avail*(head||tail?.56:.9)));
  }
  const dh=data.length?Math.min(Math.round(avail*(ph?.28:.6)),Math.round(layoutData(ctx,width,dataBase(width)).h)):0;
  const mh=ph+dh+(ph&&dh?30:0);
  const qb=measureQ(ctx,q,width,38),qh=qb.h?qb.h+32:0;
  const room=avail-qh-mh-(mh&&head?gap:0)-(mh&&tail?gap:0)-(!mh&&head&&tail?gap:0);
  const headRoom=tail?room*.62:room,tailRoom=head?room-headRoom:room;
  const hf=head?fitText(ctx,head,{weight:700,size:mh?84:120,minSize:30,lineHeight:1.12,width,height:headRoom}):null;
  const tf=tail?fitText(ctx,tail,{weight:font.body,size:mh?48:60,minSize:26,lineHeight:1.3,width,height:tailRoom}):null;
  const used=qh+(hf?hf.height:0)+(tf?tf.height:0)+mh+(mh&&hf?gap:0)+(mh&&tf?gap:0)+(!mh&&hf&&tf?gap:0);
  let y=top0+Math.max(0,(avail-used)/2);
  drawQ(ctx,qb,pad,y,width);
  y+=qh;
  if(hf){centerLines(ctx,hf,y,1.12);y+=hf.height+(mh||tf?gap:0)}
  if(ph){drawPhotos(ctx,pad,y,width,ph);y+=ph+(dh?30:0)}
  if(dh){drawData(ctx,pad,y,width,dh);y+=dh}
  if(mh&&tf)y+=gap;
  if(tf)centerLines(ctx,tf,y,1.3,extras.background?'#ffffff':colors.text);
  ctx.save();
  ctx.textAlign='center';
  ctx.fillStyle=muted;
  setFont(ctx,500,30);
  ctx.fillText(HANDLE,W/2,H-60);
  ctx.restore();
  drawSignature(ctx,W-56,H-50,muted);
  drawCounter(ctx,muted);
}

function starsOf(text){
  const t=text.replace(/\*/g,'').trim();
  if(/^[★☆]+$/.test(t))return {on:(t.match(/★/g)||[]).length,of:t.length};
  const m=/^(\d(?:\.5)?)\s*(?:\/\s*5\s*)?stars?$/i.exec(t);
  return m&&Number(m[1])<=5?{on:Number(m[1]),of:5}:null;
}

function starPath(ctx,cx,cy,r){
  ctx.beginPath();
  for(let k=0;k<10;k++){
    const a=-Math.PI/2+k*Math.PI/5,rad=k%2?r*.45:r;
    ctx.lineTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad);
  }
  ctx.closePath();
}

function drawStars(ctx,stars,cx,cy,size,color){
  const gap=size*.18,total=stars.of*size+(stars.of-1)*gap;
  let x=cx-total/2+size/2;
  for(let k=0;k<stars.of;k++){
    const fill=Math.max(0,Math.min(1,stars.on-k));
    ctx.save();
    starPath(ctx,x,cy,size/2);
    ctx.strokeStyle=color;
    ctx.lineWidth=Math.max(1.5,size*.07);
    ctx.lineJoin='round';
    ctx.stroke();
    if(fill>0){
      ctx.clip();
      ctx.fillStyle=color;
      ctx.fillRect(x-size/2,cy-size/2,size*fill,size);
    }
    ctx.restore();
    x+=size+gap;
  }
}

function inkOn(hex){
  const [r,g,b]=hexRgb(hex);
  return r*.299+g*.587+b*.114>150?'#111111':'#ffffff';
}

function gridLayout(ctx,w,maxH,f){
  const cols=Math.max(...data.map((r)=>r.length)),gap=8,pad=f*.55,lh=1.25;
  const want=[...Array(cols)].map((_,c)=>Math.max(f*3,...data.map((r,i)=>{
    const cell=r[c]||'',st=i>0&&starsOf(cell);
    if(st)return st.of*f*.95+pad*2;
    setFont(ctx,i===0||c===0?700:font.body,f);
    return Math.min(ctx.measureText(cell.replace(/\*/g,'')).width,f*9)+pad*2;
  })));
  const room=w-gap*(cols-1),sum=want.reduce((a,b)=>a+b,0);
  const widths=want.map((v)=>v*room/sum);
  let ok=true;
  const cells=data.map((row,i)=>[...Array(cols)].map((_,c)=>{
    const raw=row[c]||'',st=i>0&&starsOf(raw);
    const cf={weight:i===0||c===0?700:font.body,size:f,tracking:font.tracking};
    if(st){if(st.of*f*.95>widths[c]-pad)ok=false;return {stars:st,lines:[],f:cf}}
    const lines=wrap(ctx,raw,widths[c]-pad*2,cf);
    if(lines.some((l)=>lineWidth(ctx,l,cf)>widths[c]-pad*2+1))ok=false;
    return {lines,f:cf};
  }));
  const heights=cells.map((row)=>Math.max(f*2.4,...row.map((cell)=>Math.max(1,cell.lines.length)*f*lh+pad*2)));
  let h=heights.reduce((a,b)=>a+b,0)+gap*(heights.length-1);
  if(h>maxH)ok=false;
  else{const k=Math.min(2,(maxH-gap*(heights.length-1))/(h-gap*(heights.length-1)));for(let i=0;i<heights.length;i++)heights[i]*=k;h=heights.reduce((a,b)=>a+b,0)+gap*(heights.length-1)}
  return {ok,h,draw(x,y){
    const head=colors.highlight,body=mix(colors.highlight,colors.bg,.16),headInk=inkOn(head);
    let top=y;
    cells.forEach((row,i)=>{
      let cx=x;
      row.forEach((cell,c)=>{
        ctx.fillStyle=i===0?head:body;
        roundRect(ctx,cx,top,widths[c],heights[i],8);
        ctx.fill();
        const mid=top+heights[i]/2;
        if(cell.stars)drawStars(ctx,cell.stars,cx+widths[c]/2,mid,f*.8,colors.text);
        else{
          const n=cell.lines.length,first=mid-(n*f*lh)/2+f*.9;
          cell.lines.forEach((line,j)=>drawLine(ctx,line,cx+(widths[c]-lineWidth(ctx,line,cell.f))/2,first+j*f*lh,cell.f,i===0?headInk:colors.text,i===0?headInk:colors.highlight));
        }
        cx+=widths[c]+gap;
      });
      top+=heights[i]+gap;
    });
  }};
}

function drawGrid(ctx,text,q){
  blank(ctx,colors.bg);
  paintArea(ctx,0,0,W,H,colors.bg,extras.background,extras.dim);
  const pad=56,r=118,headTop=60;
  const muted=extras.background?'rgba(255,255,255,.8)':mix(colors.text,colors.bg,.6);
  ctx.save();
  ctx.beginPath();
  ctx.arc(pad+r,headTop+r,r+10,0,Math.PI*2);
  ctx.fillStyle=colors.highlight;
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx,pad+r,headTop+r,r);
  const hx=pad+r*2+44,hw=W-hx-pad;
  const head=text.toUpperCase();
  if(head){
    const roomH=data.length?r*2+20:H-headTop*2-140;
    const hf=fitText(ctx,head,{weight:800,size:data.length?96:120,minSize:34,lineHeight:1.02,width:hw,height:roomH});
    const y0=headTop+(data.length?Math.max(0,(r*2-hf.height)/2):0);
    hf.lines.forEach((line,i)=>drawLine(ctx,line,hx,y0+hf.size*.86+i*hf.size*1.02,hf.f,extras.background?'#ffffff':colors.text));
  }
  let y=headTop+r*2+48;
  const qb=measureQ(ctx,q,W-pad*2,38);
  drawQ(ctx,qb,pad,y,W-pad*2);
  if(qb.h)y+=qb.h+28;
  if(data.length){
    const maxH=H-y-110;
    let f=52,lay=gridLayout(ctx,W-pad*2,maxH,f);
    while(!lay.ok&&f>16){f-=1;lay=gridLayout(ctx,W-pad*2,maxH,f)}
    lay.draw(pad,y);
  }
  ctx.save();
  ctx.textAlign='center';
  ctx.fillStyle=muted;
  setFont(ctx,500,30);
  ctx.fillText(HANDLE,W/2,H-48);
  ctx.restore();
  drawSignature(ctx,W-56,H-40,muted);
  drawCounter(ctx,muted);
}

const GRADIENTS={
  midnight:{name:'Midnight',from:'#03050c',to:'#0e2fa0',accent:'#c8f53a'},
  violet:{name:'Violet',from:'#0b0418',to:'#5b21b6',accent:'#f9a8d4'},
  emerald:{name:'Emerald',from:'#02130d',to:'#0f766e',accent:'#fde047'},
  sunset:{name:'Sunset',from:'#1a0b24',to:'#c2410c',accent:'#fed7aa'},
  ocean:{name:'Ocean',from:'#020f1a',to:'#0369a1',accent:'#67e8f9'},
  graphite:{name:'Graphite',from:'#050505',to:'#3f3f46',accent:'#facc15'}
};
let gradient='midnight';
const NOTE=/^(†|‡|\*\s|note:|notes:|source:|sources:)/i;

function paintGradient(ctx){
  const g=GRADIENTS[gradient]||GRADIENTS.midnight;
  const fill=ctx.createLinearGradient(0,H*.15,W,H*.55);
  fill.addColorStop(0,g.from);
  fill.addColorStop(.45,mix(g.from,g.to,.55));
  fill.addColorStop(1,g.to);
  ctx.fillStyle=fill;
  ctx.fillRect(0,0,W,H);
  if(extras.background){
    ctx.save();
    ctx.globalAlpha=.25;
    cover(ctx,extras.background,0,0,W,H);
    ctx.restore();
  }
}

function gradientParts(raw){
  const lines=raw.replace(/\r/g,'').split('\n');
  const first=lines.findIndex((l)=>/\t|\|/.test(l));
  let last=-1;
  lines.forEach((l,i)=>{if(/\t|\|/.test(l))last=i});
  const before=(first<0?lines:lines.slice(0,first)).join('\n');
  const after=first<0?'':lines.slice(last+1).join('\n');
  const paras=(t)=>t.split(/\n[ \t]*\n/).map((p)=>p.trim()).filter(Boolean);
  const top=paras(before),bottom=paras(after);
  const notes=[],closing=[];
  bottom.forEach((p)=>(NOTE.test(p)?notes:closing).push(p));
  if(first<0){
    for(let i=top.length-1;i>0&&NOTE.test(top[i]);i--)notes.unshift(top.pop());
  }
  return {head:top[0]||'',sub:top.slice(1).join('\n'),closing:closing.join('\n'),notes:notes.join('\n')};
}

function splitMark(text){
  const m=/^(.*?)([†‡]+)$/.exec(text);
  return m?{t:m[1].trim(),mark:m[2]}:{t:text,mark:''};
}

function gradientTable(ctx,w,s){
  if(!data.length)return {h:0,draw(){}};
  const cols=Math.max(...data.map((r)=>r.length));
  const rows=data.map((r,i)=>i===0&&r.length<cols?Array(cols-r.length).fill('').concat(r):r);
  const cells=rows.map((r)=>[...Array(cols)].map((_,c)=>{
    const parts=String(r[c]||'').split(';').map((p)=>p.trim());
    return {main:parts[0].replace(/\*/g,''),sub:parts.slice(1).join(' ')};
  }));
  const fMain=46*s,fLabel=36*s,fSub=26*s,fHead=32*s,line=2;
  setFont(ctx,800,fLabel);
  let c0=Math.max(...cells.slice(1).map((r)=>ctx.measureText(r[0].main).width))+20*s;
  c0=Math.min(w*.36,Math.max(w*.22,c0));
  const rest=cols>1?(w-c0)/(cols-1):0;
  const widths=[c0,...Array(Math.max(0,cols-1)).fill(rest)];
  let fits=true;
  const subF={weight:font.body,size:fSub,tracking:font.tracking};
  const subLines=cells.map((r)=>r.map((cell,c)=>cell.sub?wrap(ctx,cell.sub,widths[c]-(c?12*s:16*s),subF):[]));
  cells.forEach((r,i)=>r.forEach((cell,c)=>{
    if(i===0||c===0)return;
    setFont(ctx,800,fMain);
    const m=splitMark(cell.main);
    if(ctx.measureText(m.t).width+(m.mark?fMain*.5:0)>widths[c]-8*s)fits=false;
  }));
  const headH=fHead*2;
  const rowH=cells.slice(1).map((r,k)=>{
    const i=k+1;
    const left=fLabel*1.2+subLines[i][0].length*fSub*1.3;
    const other=Math.max(0,...r.slice(1).map((cell,c)=>(cell.main?fMain*1.15:0)+subLines[i][c+1].length*fSub*1.3));
    return Math.max(left,other)+34*s;
  });
  const h=headH+line+rowH.reduce((a,b)=>a+b+line,0);
  return {h,fits,draw(x,y){
    const rule='rgba(255,255,255,.28)',muted='rgba(255,255,255,.66)';
    ctx.save();
    ctx.textBaseline='alphabetic';
    let cx=x;
    cells[0].forEach((cell,c)=>{
      setFont(ctx,font.body,fHead);
      ctx.fillStyle=muted;
      ctx.textAlign=c?'center':'left';
      ctx.fillText(cell.main,c?cx+widths[c]/2:cx,y+fHead*1.1);
      cx+=widths[c];
    });
    let top=y+headH;
    ctx.fillStyle=rule;
    ctx.fillRect(x,top,w,line);
    top+=line;
    cells.slice(1).forEach((r,k)=>{
      const i=k+1,rh=rowH[k];
      let cx2=x;
      r.forEach((cell,c)=>{
        const subs=subLines[i][c];
        if(c===0){
          const block=fLabel*1.2+subs.length*fSub*1.3;
          let yy=top+(rh-block)/2+fLabel*.95;
          setFont(ctx,800,fLabel);
          ctx.textAlign='left';
          ctx.fillStyle='#ffffff';
          ctx.fillText(fitCell(ctx,cell.main,widths[0]-8*s),cx2,yy);
          subs.forEach((ln,j)=>drawLine(ctx,ln,cx2,yy+fSub*1.3*(j+1)+2*s,subF,muted,muted));
        }else{
          const block=(cell.main?fMain*1.15:0)+subs.length*fSub*1.3;
          let yy=top+(rh-block)/2;
          const mid=cx2+widths[c]/2;
          if(cell.main){
            const m=splitMark(cell.main);
            setFont(ctx,800,fMain);
            const tw=ctx.measureText(m.t).width;
            ctx.textAlign='left';
            ctx.fillStyle='#ffffff';
            ctx.fillText(m.t,mid-tw/2,yy+fMain*.92);
            if(m.mark){
              setFont(ctx,700,fMain*.55);
              ctx.fillStyle=colors.highlight;
              ctx.fillText(m.mark,mid+tw/2+3*s,yy+fMain*.42);
            }
            yy+=fMain*1.15;
          }
          subs.forEach((ln,j)=>drawLine(ctx,ln,mid-lineWidth(ctx,ln,subF)/2,yy+fSub*1.05+j*fSub*1.3,subF,muted,muted));
        }
        cx2+=widths[c];
      });
      top+=rh;
      ctx.fillStyle=rule;
      ctx.fillRect(x,top,w,line);
      top+=line;
    });
    ctx.restore();
  }};
}

function drawGradient(ctx,_text,q){
  paintGradient(ctx);
  const raw=slideRaw||'';
  const parts=gradientParts(raw);
  const pad=84,w=W-pad*2,accent=colors.highlight;
  const muted='rgba(255,255,255,.72)',faint='rgba(255,255,255,.55)';
  let head=parts.head;
  if(head&&!head.includes('*')){
    const ls=head.split('\n');
    if(ls.length>1)head=ls.slice(0,-1).join('\n')+'\n*'+ls[ls.length-1]+'*';
  }
  const brandH=60;
  let s=Math.min(1.25,Math.max(1,H/1402*.9)),lay;
  for(;;){
    const hf=head?{weight:800,size:Math.round(112*s),tracking:-.025}:null;
    const hl=hf?wrap(ctx,head,w,hf):[];
    const sf={weight:font.body,size:Math.round(40*s),tracking:font.tracking};
    const sl=parts.sub?wrap(ctx,parts.sub,w,sf):[];
    const cf={weight:600,size:Math.round(36*s),tracking:font.tracking};
    const cl=parts.closing?wrap(ctx,parts.closing,w,cf):[];
    const nf={weight:font.body,size:Math.round(26*s),tracking:font.tracking};
    const nl=parts.notes?wrap(ctx,parts.notes,w,nf):[];
    const qb=measureQ(ctx,q,w,Math.round(36*s));
    const tb=gradientTable(ctx,w,s);
    const wide=hl.some((l)=>lineWidth(ctx,l,hf)>w+1);
    const gap=46*s;
    const body=brandH+(qb.h?qb.h+gap*.6:0)+hl.length*(hf?hf.size*1.04:0)+(sl.length?gap*.5+sl.length*sf.size*1.32:0)+(tb.h?gap+tb.h:0)+(cl.length?gap+cl.length*cf.size*1.3:0);
    const notesH=nl.length?nl.length*nf.size*1.32+gap:0;
    const total=body+notesH;
    if((total<=H-pad*2&&!wide&&tb.fits!==false)||s<=.45){lay={hf,hl,sf,sl,cf,cl,nf,nl,qb,tb,gap,body,notesH};break}
    s-=.03;
  }
  let y=pad;
  ctx.save();
  ctx.fillStyle=accent;
  ctx.beginPath();
  ctx.arc(pad+9,y+18,9,0,Math.PI*2);
  ctx.fill();
  setFont(ctx,600,30);
  ctx.fillStyle=accent;
  ctx.textAlign='left';
  ctx.fillText(HANDLE,pad+30,y+29);
  ctx.restore();
  y+=brandH;
  const room=H-pad*2-lay.body-lay.notesH;
  y+=Math.max(0,room*.35);
  if(lay.qb.h){drawQ(ctx,lay.qb,pad,y,w);y+=lay.qb.h+lay.gap*.6}
  lay.hl.forEach((l)=>{drawLine(ctx,l,pad,y+lay.hf.size*.9,lay.hf,'#ffffff',accent);y+=lay.hf.size*1.04});
  if(lay.sl.length){y+=lay.gap*.5;lay.sl.forEach((l)=>{drawLine(ctx,l,pad,y+lay.sf.size*.95,lay.sf,muted,accent);y+=lay.sf.size*1.32})}
  if(lay.tb.h){y+=lay.gap;lay.tb.draw(pad,y);y+=lay.tb.h}
  if(lay.cl.length){y+=lay.gap;lay.cl.forEach((l)=>{drawLine(ctx,l,pad,y+lay.cf.size*.95,lay.cf,'#ffffff',accent);y+=lay.cf.size*1.3})}
  if(lay.nl.length){
    let ny=H-pad-lay.nl.length*lay.nf.size*1.32;
    lay.nl.forEach((l)=>{drawLine(ctx,l,pad,ny+lay.nf.size*.95,lay.nf,faint,accent);ny+=lay.nf.size*1.32});
  }
  drawSignature(ctx,W-56,H-40,muted);
  drawCounter(ctx,muted);
}

const GROUP_COLORS=['#ff9f45','#c9cfdc','#f472b6','#67e8f9','#a78bfa'];

function drawRanked(ctx,_text,q){
  paintGradient(ctx);
  const accent=colors.highlight,muted='rgba(255,255,255,.72)',faint='rgba(255,255,255,.55)';
  let avg=null;
  const kept=[];
  for(const line of (slideRaw||'').replace(/\r/g,'').split('\n')){
    const m=/^\s*(average[^|\t]*?)[:\s]+([-+]?\$?\d[\d,]*\.?\d*\s*[%KMB]?)\s*$/i.exec(line);
    if(m&&!/\t|\|/.test(line)){avg={label:line.trim().replace(/\s*:\s*/,', '),value:numberOf(m[2])};continue}
    kept.push(line);
  }
  const parts=gradientParts(kept.join('\n'));
  let rows=data.map((r)=>{
    const lab=String(r[0]||'').split(';').map((t)=>t.trim());
    return {label:lab[0].replace(/\*/g,''),tag:lab.slice(1).join(' '),valueText:String(r[1]||'').replace(/\*/g,'').trim(),value:numberOf(r[1]||''),group:String(r[2]||'').trim()};
  });
  if(rows.length&&Number.isNaN(rows[0].value))rows=rows.slice(1);
  rows=rows.filter((r)=>!Number.isNaN(r.value));
  const groups=[];
  rows.forEach((r)=>{if(r.group&&!groups.includes(r.group))groups.push(r.group)});
  const colorOf=(g)=>{const i=groups.indexOf(g);return i<=0?accent:GROUP_COLORS[(i-1)%GROUP_COLORS.length]};
  let head=parts.head;
  if(head&&!head.includes('*')){
    const ls=head.split('\n');
    if(ls.length>1)head=ls.slice(0,-1).join('\n')+'\n*'+ls[ls.length-1]+'*';
  }
  const pad=58,w=W-pad*2,top0=64;
  const hf={weight:800,size:84,tracking:-.025};
  let hl=head?wrap(ctx,head,w,hf):[];
  while(hf.size>40&&(hl.length>3||hl.some((l)=>lineWidth(ctx,l,hf)>w))){hf.size-=2;hl=wrap(ctx,head,w,hf)}
  const sf={weight:font.body,size:32,tracking:font.tracking};
  const sl=parts.sub?wrap(ctx,parts.sub,w*.86,sf):[];
  const nf={weight:font.body,size:22,tracking:font.tracking};
  const brandW=(()=>{setFont(ctx,700,24);return ctx.measureText(HANDLE).width+36})();
  const nl=parts.notes?wrap(ctx,parts.notes,w-brandW-40,nf):[];
  const closing=parts.closing?wrap(ctx,parts.closing,w,{weight:600,size:28,tracking:font.tracking}):[];
  let y=top0;
  const qb=measureQ(ctx,q,w,32);
  if(qb.h){drawQ(ctx,qb,pad,y,w);y+=qb.h+24}
  hl.forEach((l)=>{drawLine(ctx,l,pad,y+hf.size*.88,hf,'#ffffff',accent);y+=hf.size*1.02});
  if(sl.length){y+=18;sl.forEach((l)=>{drawLine(ctx,l,pad,y+sf.size*.92,sf,muted,'#ffffff');y+=sf.size*1.3})}
  const showLegend=groups.length>1||avg;
  if(showLegend){
    y+=30;
    let lx=pad;
    setFont(ctx,600,24);
    ctx.textAlign='left';
    groups.forEach((g)=>{
      if(groups.length<2)return;
      ctx.fillStyle=colorOf(g);
      roundRect(ctx,lx,y,20,20,4);ctx.fill();
      ctx.fillStyle='#ffffff';
      ctx.fillText(g,lx+30,y+18);
      lx+=30+ctx.measureText(g).width+34;
    });
    if(avg){
      ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(lx+4,y-2);ctx.lineTo(lx+4,y+22);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#ffffff';
      ctx.fillText(avg.label,lx+18,y+18);
    }
    y+=20;
  }
  const footH=(nl.length?nl.length*nf.size*1.35:30)+40;
  const closeH=closing.length?closing.length*28*1.3+24:0;
  const areaTop=y+(showLegend?30:34),areaBottom=H-pad-footH-closeH-10;
  const n=Math.max(1,rows.length);
  const rowH=Math.min(H>1500?92:72,(areaBottom-areaTop)/n);
  const lf=Math.max(15,Math.min(H>1500?40:34,rowH*.6)),tf=Math.max(12,lf*.5);
  setFont(ctx,800,lf);
  const valW=Math.max(90,...rows.map((r)=>ctx.measureText(r.valueText).width))+8;
  const rankW=lf*1.7;
  let labelW=0;
  rows.forEach((r)=>{setFont(ctx,800,lf);let lw=ctx.measureText(r.label).width;if(r.tag){setFont(ctx,600,tf);lw+=ctx.measureText(r.tag).width+lf*.4}labelW=Math.max(labelW,lw)});
  const barX=pad+rankW+Math.min(w*.5,Math.max(w*.3,labelW+24));
  const barR=W-pad-valW-24,barW=Math.max(60,barR-barX);
  const max=Math.max(avg?avg.value:0,...rows.map((r)=>r.value))/.94||1;
  const barH=Math.max(8,rowH*.42);
  rows.forEach((r,i)=>{
    const cy=areaTop+i*rowH+rowH/2;
    ctx.textAlign='left';
    setFont(ctx,600,lf*.78);
    ctx.fillStyle=faint;
    ctx.fillText(String(i+1),pad,cy+lf*.3);
    setFont(ctx,800,lf);
    ctx.fillStyle='#ffffff';
    const label=fitCell(ctx,r.label,barX-pad-rankW-16);
    ctx.fillText(label,pad+rankW,cy+lf*.33);
    if(r.tag){
      const lw=ctx.measureText(label).width;
      setFont(ctx,600,tf);
      ctx.fillStyle=faint;
      if('letterSpacing' in ctx)ctx.letterSpacing=(tf*.08)+'px';
      if(pad+rankW+lw+lf*.4+ctx.measureText(r.tag).width<barX-12)ctx.fillText(r.tag,pad+rankW+lw+lf*.4,cy+lf*.33);
      if('letterSpacing' in ctx)ctx.letterSpacing='0px';
    }
    ctx.fillStyle='rgba(255,255,255,.09)';
    roundRect(ctx,barX,cy-barH/2,barW,barH,Math.min(6,barH/2));ctx.fill();
    ctx.fillStyle=colorOf(r.group);
    roundRect(ctx,barX,cy-barH/2,Math.max(barH,barW*Math.max(0,r.value)/max),barH,Math.min(6,barH/2));ctx.fill();
    setFont(ctx,800,lf);
    ctx.fillStyle='#ffffff';
    ctx.textAlign='right';
    ctx.fillText(r.valueText,W-pad,cy+lf*.33);
  });
  if(avg&&rows.length){
    const ax=barX+barW*avg.value/max;
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=2;ctx.setLineDash([5,6]);
    ctx.beginPath();ctx.moveTo(ax,areaTop-10);ctx.lineTo(ax,areaTop+rows.length*rowH+4);ctx.stroke();
    ctx.restore();
  }
  let by=areaTop+rows.length*rowH+24;
  ctx.textAlign='left';
  closing.forEach((l)=>{drawLine(ctx,l,pad,by+28,{weight:600,size:28,tracking:font.tracking},'#ffffff',accent);by+=28*1.3});
  const footTop=H-pad-footH+14;
  ctx.fillStyle='rgba(255,255,255,.22)';
  ctx.fillRect(pad,footTop,w,2);
  let ny=footTop+24;
  nl.forEach((l)=>{drawLine(ctx,l,pad,ny+nf.size*.9,nf,faint,'#ffffff');ny+=nf.size*1.35});
  ctx.textAlign='right';
  setFont(ctx,700,24);
  ctx.fillStyle='#ffffff';
  const brandY=footTop+24+Math.max(nf.size,(nl.length*nf.size*1.35)/2);
  ctx.fillText(HANDLE,W-pad,brandY);
  ctx.fillStyle=accent;
  ctx.beginPath();ctx.arc(W-pad-ctx.measureText(HANDLE).width-16,brandY-8,8,0,Math.PI*2);ctx.fill();
  ctx.textAlign='left';
  drawSignature(ctx,W-56,H-20,muted);
  drawCounter(ctx,muted);
}

let layers=[],selected=null,drag=null;

function layerBox(ctx,l){
  if(l.type==='image')return {w:l.w,h:l.h};
  const f={weight:l.bold?800:font.body,size:l.size,tracking:font.tracking};
  const lines=wrap(ctx,l.text||' ',99999,f);
  const w=Math.max(l.size,...lines.map((ln)=>lineWidth(ctx,ln,f)));
  return {w:w+l.size*.4,h:Math.max(1,lines.length)*l.size*1.2+l.size*.3,lines,f};
}

function drawLayers(ctx,i){
  for(const l of layers){
    if(l.slide!==i)continue;
    const box=layerBox(ctx,l);
    ctx.save();
    ctx.translate(l.x,l.y);
    ctx.rotate(l.rot||0);
    if(l.type==='image'){
      ctx.imageSmoothingQuality='high';
      ctx.drawImage(l.img,-l.w/2,-l.h/2,l.w,l.h);
    }else{
      box.lines.forEach((ln,j)=>drawLine(ctx,ln,-lineWidth(ctx,ln,box.f)/2,-box.h/2+l.size*.15+l.size*.95+j*l.size*1.2,box.f,l.color,colors.highlight));
    }
    ctx.restore();
  }
}

function canvasPoint(e){
  const r=els.canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height,k:r.width/W};
}

function hitLayer(p){
  const ctx=els.canvas.getContext('2d');
  for(let k=layers.length-1;k>=0;k--){
    const l=layers[k];
    if(l.slide!==shown)continue;
    const box=layerBox(ctx,l),c=Math.cos(-(l.rot||0)),s=Math.sin(-(l.rot||0));
    const dx=p.x-l.x,dy=p.y-l.y,lx=dx*c-dy*s,ly=dx*s+dy*c;
    if(Math.abs(lx)<=box.w/2+10&&Math.abs(ly)<=box.h/2+10)return l;
  }
  return null;
}

function placeOverlay(){
  const box=els.layerBox;
  const l=selected&&layers.includes(selected)&&selected.slide===shown?selected:null;
  els.layerPanel.hidden=!l;
  if(!l){box.hidden=true;return}
  const ctx=els.canvas.getContext('2d');
  const r=els.canvas.getBoundingClientRect(),stage=els.stage.getBoundingClientRect(),k=r.width/W;
  const b=layerBox(ctx,l);
  box.hidden=false;
  box.style.width=b.w*k+'px';
  box.style.height=b.h*k+'px';
  box.style.left=(r.left-stage.left+l.x*k-b.w*k/2)+'px';
  box.style.top=(r.top-stage.top+l.y*k-b.h*k/2)+'px';
  box.style.transform=`rotate(${l.rot||0}rad)`;
  els.layerText.hidden=l.type!=='text';
  els.layerTextLabel.hidden=l.type!=='text';
  els.layerStyleRow.hidden=l.type!=='text';
  if(l.type==='text'){
    if(document.activeElement!==els.layerText)els.layerText.value=l.text;
    els.layerColor.value=l.color;
    els.layerBold.checked=!!l.bold;
  }
}

function selectLayer(l){
  selected=l;
  placeOverlay();
}

function addTextLayer(){
  const l={type:'text',text:'Your text',x:W/2,y:H/2,size:72,rot:0,color:style()==='gradient'||style()==='ranked'||extras.background?'#ffffff':colors.text,bold:true,slide:shown};
  layers.push(l);
  draw();
  selectLayer(l);
  els.layerText.focus();
  els.layerText.select();
}

async function addStickers(){
  const files=[...els.stickerInput.files].slice(0,6);
  els.stickerInput.value='';
  for(const file of files){
    const img=await loadFile(file);
    if(!img)continue;
    const scale=Math.min(1,(W*.45)/img.naturalWidth,(H*.35)/img.naturalHeight);
    const l={type:'image',img,x:W/2,y:H/2,w:img.naturalWidth*scale,h:img.naturalHeight*scale,rot:0,slide:shown};
    layers.push(l);
    selected=l;
  }
  draw();
  placeOverlay();
}

function removeLayer(){
  if(!selected)return;
  if(selected.type==='image')release([selected.img]);
  layers=layers.filter((l)=>l!==selected);
  selected=null;
  draw();
}

function startDrag(e){
  const handle=e.target.closest('[data-qi-handle]');
  const p=canvasPoint(e);
  let l=handle?selected:hitLayer(p);
  if(!l){if(e.target===els.canvas&&selected){selectLayer(null)}return}
  e.preventDefault();
  selected=l;
  const ctx=els.canvas.getContext('2d'),b=layerBox(ctx,l);
  drag={mode:handle?handle.dataset.qiHandle:'move',start:p,x:l.x,y:l.y,rot:l.rot||0,size:l.size,w:l.w,h:l.h,dist:Math.hypot(p.x-l.x,p.y-l.y)||1,angle:Math.atan2(p.y-l.y,p.x-l.x),bw:b.w,bh:b.h};
  els.stage.setPointerCapture(e.pointerId);
  placeOverlay();
}

function moveDrag(e){
  if(!drag||!selected)return;
  const p=canvasPoint(e),l=selected;
  if(drag.mode==='move'){
    l.x=Math.round(drag.x+p.x-drag.start.x);
    l.y=Math.round(drag.y+p.y-drag.start.y);
  }else if(drag.mode==='rotate'){
    let a=drag.rot+Math.atan2(p.y-l.y,p.x-l.x)-drag.angle;
    const step=Math.PI/12,near=Math.round(a/step)*step;
    if(!e.shiftKey&&Math.abs(a-near)<.05)a=near;
    l.rot=a;
  }else{
    const k=Math.max(.1,Math.hypot(p.x-l.x,p.y-l.y)/drag.dist);
    if(l.type==='image'){l.w=Math.max(30,drag.w*k);l.h=Math.max(30,drag.h*k)}
    else l.size=Math.max(18,Math.min(400,Math.round(drag.size*k)));
  }
  draw();
}

function endDrag(){
  drag=null;
}

function nudge(e){
  if(!selected||selected.slide!==shown)return;
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable)return;
  const step=e.shiftKey?20:4;
  const moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(moves[e.key]){e.preventDefault();selected.x+=moves[e.key][0];selected.y+=moves[e.key][1];draw();return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeLayer();return}
  if(e.key==='Escape')selectLayer(null);
}

function initLayers(){
  els.stage=$('qi-stage');
  els.layerBox=$('qi-layer-box');
  els.layerPanel=$('qi-layer-panel');
  els.layerText=$('qi-layer-text');
  els.layerTextLabel=$('qi-layer-text-label');
  els.layerStyleRow=$('qi-layer-style');
  els.layerColor=$('qi-layer-color');
  els.layerBold=$('qi-layer-bold');
  els.stickerInput=$('qi-sticker');
  $('qi-add-text').addEventListener('click',()=>{if(font)addTextLayer()});
  els.stickerInput.addEventListener('change',()=>{if(font)addStickers()});
  $('qi-layer-delete').addEventListener('click',removeLayer);
  $('qi-layer-front').addEventListener('click',()=>{if(!selected)return;layers=layers.filter((l)=>l!==selected).concat(selected);draw()});
  $('qi-layer-center').addEventListener('click',()=>{if(!selected)return;selected.x=W/2;selected.rot=0;draw()});
  els.layerText.addEventListener('input',()=>{if(selected&&selected.type==='text'){selected.text=els.layerText.value;draw()}});
  els.layerColor.addEventListener('input',()=>{if(selected&&selected.type==='text'){selected.color=els.layerColor.value;draw()}});
  els.layerBold.addEventListener('change',()=>{if(selected&&selected.type==='text'){selected.bold=els.layerBold.checked;draw()}});
  els.stage.addEventListener('pointerdown',startDrag);
  els.stage.addEventListener('pointermove',(e)=>{
    moveDrag(e);
    if(!drag)els.canvas.classList.toggle('is-over-layer',!!hitLayer(canvasPoint(e)));
  });
  els.stage.addEventListener('pointerup',endDrag);
  els.stage.addEventListener('pointercancel',endDrag);
  els.stage.addEventListener('dblclick',(e)=>{const l=hitLayer(canvasPoint(e));if(l&&l.type==='text'){selectLayer(l);els.layerText.focus();els.layerText.select()}});
  document.addEventListener('keydown',nudge);
  window.addEventListener('resize',placeOverlay);
}

const COUNTS=['likes','comments','reposts','shares'];
const STYLES={x:drawX,threads:drawThreads,instagram:drawInstagram,notes:drawNotes,messages:drawMessages,card:drawCard,photo:drawPhotoLook,grid:drawGrid,gradient:drawGradient,ranked:drawRanked};
const FEED=['x','threads','instagram'];

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
  extras.counts={};
  for(const key of COUNTS)extras.counts[key]=els.counts[key].value.trim().slice(0,8);
  els.photosClear.hidden=!extras.photos.length;
  els.backgroundClear.hidden=!extras.background;
  els.dimRow.hidden=!extras.background;
  const feed=FEED.includes(style());
  els.checksRow.hidden=!(feed||style()==='messages');
  els.savedLabel.hidden=!feed;
  els.countsRow.hidden=!feed;
  const dark=style()==='gradient'||style()==='ranked';
  els.gradients.hidden=!dark;
  els.solidSwatches.hidden=dark;
  document.querySelectorAll('[data-qi-grad]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.qiGrad===gradient)));
  question=els.question.value.trim();
}

function slideTexts(){
  const parts=els.text.value.replace(/\r/g,'').split(/^[ \t]*-{3,}[ \t]*$/m).map((t)=>t.trim());
  const list=parts.filter((t,i)=>t||i===0).slice(0,MAX_SLIDES);
  return list.length?list:[''];
}

function render(i,list){
  const size=document.querySelector('input[name="qi-size"]:checked');
  H=SIZES[size&&size.value]||SIZES.portrait;
  if(els.canvas.height!==H)els.canvas.height=H;
  slide={i,n:list.length};
  slideRaw=list[i];
  const parts=splitData(list[i]);
  data=parts.rows;
  const picked=document.querySelector('input[name="qi-data"]:checked');
  dataStyle=picked?picked.value:'table';
  const ctx=els.canvas.getContext('2d');
  STYLES[style()](ctx,parts.text,i===0?question:'');
  drawLayers(ctx,i);
}

function draw(){
  readColors();
  readExtras();
  const list=slideTexts();
  shown=Math.min(current,list.length-1);
  els.slides.hidden=list.length<2;
  els.slideLabel.textContent=`Slide ${shown+1} of ${list.length}`;
  els.prev.disabled=shown===0;
  els.next.disabled=shown===list.length-1;
  els.download.textContent=list.length>1?`Download all ${list.length}`:'Download PNG';
  render(shown,list);
  placeOverlay();
}

function fileName(text,i,n){
  const slug=text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').split('-').slice(0,6).join('-');
  return `${USER}-${style()}-${slug||'post'}${n>1?`-${i+1}of${n}`:''}.png`;
}

function save(name){
  return new Promise((resolve)=>els.canvas.toBlob((blob)=>{
    if(blob){
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),4000);
    }
    resolve();
  },'image/png'));
}

async function download(){
  draw();
  const list=slideTexts();
  for(let i=0;i<list.length;i++){
    render(i,list);
    await save(fileName(list[0]||question,i,list.length));
    if(i<list.length-1)await new Promise((r)=>setTimeout(r,400));
  }
  draw();
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

const TRENDS_API='/api/watchdog-trends';
let trends=null,trendTab='us';

function ago(time){
  if(!time)return '';
  const mins=Math.max(1,Math.round((Date.now()-time)/60000));
  if(mins<60)return `${mins}m ago`;
  const hours=Math.round(mins/60);
  return hours<48?`${hours}h ago`:`${Math.round(hours/24)}d ago`;
}

function el(tagName,className,text){
  const node=document.createElement(tagName);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
}

function link(story,label){
  const a=el('a','',label);
  a.href=story.url;
  a.target='_blank';
  a.rel='noopener noreferrer';
  return a;
}

function showTrends(){
  const list=els.trendList;
  list.replaceChildren();
  document.querySelectorAll('[data-qi-tab]').forEach((b)=>b.setAttribute('aria-selected',String(b.dataset.qiTab===trendTab)));
  if(!trends){list.append(el('li','qi-trend-empty','Loading...'));return}
  if(trends.error){list.append(el('li','qi-trend-empty','Trends are unavailable right now. Try Refresh.'));return}
  const rows=trends[trendTab]||[];
  if(!rows.length){list.append(el('li','qi-trend-empty','Nothing here right now.'));return}
  for(const row of rows){
    const li=el('li');
    if(trendTab==='money'){
      li.append(el('strong','',row.title),el('span','qi-trend-meta',[row.topic,row.source,ago(row.published)].filter(Boolean).join(' \u00b7 ')),link(row,'Read it'));
    }else{
      li.append(el('strong','',row.topic),el('span','qi-trend-meta',[row.traffic?`${row.traffic} searches`:'',ago(row.started)].filter(Boolean).join(' \u00b7 ')));
      for(const story of row.news)li.append(link(story,`${story.title}${story.source?` (${story.source})`:''}`));
    }
    list.append(li);
  }
}

function loadTrends(){
  trends=null;
  els.trendsUpdated.textContent='';
  showTrends();
  fetch(TRENDS_API,{headers:{Accept:'application/json'}})
    .then((r)=>r.ok?r.json():Promise.reject(new Error(String(r.status))))
    .then((data)=>{
      trends=data;
      els.trendsUpdated.textContent=data.updated?`Updated ${new Date(data.updated).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`:'';
      showTrends();
    })
    .catch(()=>{trends={error:true};showTrends()});
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
  els.question=$('qi-question');
  els.checksRow=$('qi-checks');
  els.savedLabel=$('qi-saved-label');
  els.countsRow=$('qi-counts');
  els.slides=$('qi-slides');
  els.slideLabel=$('qi-slide-label');
  els.prev=$('qi-prev');
  els.next=$('qi-next');
  els.addSlide=$('qi-add-slide');
  els.addTable=$('qi-add-table');
  els.trendList=$('qi-trend-list');
  els.trendsUpdated=$('qi-trends-updated');
  $('qi-trends-refresh').addEventListener('click',loadTrends);
  document.querySelectorAll('[data-qi-tab]').forEach((b)=>b.addEventListener('click',()=>{trendTab=b.dataset.qiTab;showTrends()}));
  loadTrends();
  els.gradients=$('qi-gradients');
  els.solidSwatches=$('qi-solid-swatches');
  document.querySelectorAll('[data-qi-grad]').forEach((button)=>{
    const g=GRADIENTS[button.dataset.qiGrad];
    button.style.background=`linear-gradient(135deg,${g.from},${g.to})`;
    button.addEventListener('click',()=>{
      gradient=button.dataset.qiGrad;
      els.highlight.value=g.accent;
      if(font)draw();
    });
  });
  document.querySelectorAll('input[name="qi-style"]').forEach((input)=>input.addEventListener('change',()=>{
    if((input.value==='gradient'||input.value==='ranked')&&input.checked&&els.highlight.value.toLowerCase()===X_BLUE)els.highlight.value=GRADIENTS[gradient].accent;
    const accents=Object.values(GRADIENTS).map((g)=>g.accent);
    if(input.value!=='gradient'&&input.value!=='ranked'&&input.checked&&accents.includes(els.highlight.value.toLowerCase()))els.highlight.value=X_BLUE;
  }));
  initLayers();
  els.counts={};
  for(const key of COUNTS)els.counts[key]=$('qi-'+key);
  Promise.all([loadPhoto(),loadFonts()]).then(()=>{
    pickFont(els.canvas.getContext('2d'));
    draw();
  });
  els.text.addEventListener('input',()=>{if(font)draw()});
  document.querySelectorAll('input[name="qi-style"],input[name="qi-size"]').forEach((input)=>input.addEventListener('change',()=>{if(font)draw()}));
  els.question.addEventListener('input',()=>{if(font)draw()});
  els.prev.addEventListener('click',()=>{current=Math.max(0,shown-1);if(font)draw()});
  els.next.addEventListener('click',()=>{current=shown+1;if(font)draw()});
  document.querySelectorAll('input[name="qi-data"]').forEach((input)=>input.addEventListener('change',()=>{if(font)draw()}));
  els.addTable.addEventListener('click',()=>{
    const value=els.text.value.replace(/\s+$/,'');
    const list=slideTexts();
    if(!splitData(list[list.length-1]).rows.length)els.text.value=(value?value+'\n\n':'')+'Name | Value\nFirst | 10\nSecond | 20\nThird | 30';
    els.text.focus();
    if(font)draw();
  });
  els.addSlide.addEventListener('click',()=>{
    els.text.value=els.text.value.replace(/\s+$/,'')+'\n---\n';
    els.text.focus();
    els.text.setSelectionRange(els.text.value.length,els.text.value.length);
    current=slideTexts().length;
    if(font)draw();
  });
  els.download.addEventListener('click',()=>{if(font)download()});
  if(window.ClipboardItem&&navigator.clipboard&&navigator.clipboard.write){
    els.copy.hidden=false;
    els.copy.addEventListener('click',()=>{if(font)copy()});
  }
  [els.bg,els.color,els.highlight,els.dim,els.signature,...COUNTS.map((key)=>els.counts[key])].forEach((input)=>input.addEventListener('input',()=>{if(font)draw()}));
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
