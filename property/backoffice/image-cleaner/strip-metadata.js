/* Image Cleaner: removes hidden info (EXIF, GPS, XMP, IPTC, comments, text chunks)
   from JPEG, PNG, WebP and GIF files without re-saving the pixels. Runs in the
   browser and in Node (property/tests/image-cleaner-contract.mjs).
   Kept on purpose: the color profile (ICC) so colors look right, and the JPEG
   rotation flag so sideways photos still show the right way up. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.WatchdogImageCleaner=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

function ascii(bytes,start,length){
  let out='';
  for(let i=start;i<start+length&&i<bytes.length;i++)out+=String.fromCharCode(bytes[i]);
  return out;
}
function startsWith(bytes,list,offset){
  const at=offset||0;
  for(let i=0;i<list.length;i++)if(bytes[at+i]!==list[i])return false;
  return true;
}
function concat(parts){
  let total=0;
  for(const p of parts)total+=p.length;
  const out=new Uint8Array(total);
  let at=0;
  for(const p of parts){out.set(p,at);at+=p.length}
  return out;
}

function detect(bytes){
  if(bytes.length>=3&&bytes[0]===0xFF&&bytes[1]===0xD8&&bytes[2]===0xFF)return 'jpeg';
  if(startsWith(bytes,[0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))return 'png';
  if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP')return 'webp';
  if(ascii(bytes,0,6)==='GIF87a'||ascii(bytes,0,6)==='GIF89a')return 'gif';
  if(ascii(bytes,0,2)==='BM')return 'bmp';
  if(startsWith(bytes,[0x49,0x49,0x2A,0x00])||startsWith(bytes,[0x4D,0x4D,0x00,0x2A]))return 'tiff';
  if(ascii(bytes,4,4)==='ftyp'){
    const brand=ascii(bytes,8,4);
    if(/^(avif|avis)$/.test(brand))return 'avif';
    if(/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand))return 'heic';
  }
  return '';
}

/* ---------- JPEG ---------- */

function exifInfo(seg){
  // seg = APP1 payload starting with "Exif\0\0"
  const info={orientation:1,gps:false};
  const t=6;
  if(seg.length<t+8)return info;
  const little=seg[t]===0x49;
  const u16=(o)=>little?seg[t+o]|seg[t+o+1]<<8:seg[t+o]<<8|seg[t+o+1];
  const u32=(o)=>little?(seg[t+o]|seg[t+o+1]<<8|seg[t+o+2]<<16)+seg[t+o+3]*16777216:seg[t+o]*16777216+(seg[t+o+1]<<16|seg[t+o+2]<<8|seg[t+o+3]);
  const ifd=u32(4);
  if(t+ifd+2>seg.length)return info;
  const count=u16(ifd);
  for(let i=0;i<count;i++){
    const e=ifd+2+i*12;
    if(t+e+12>seg.length)break;
    const tag=u16(e);
    if(tag===0x0112){const v=u16(e+8);if(v>=1&&v<=8)info.orientation=v}
    if(tag===0x8825)info.gps=true;
  }
  return info;
}

function orientationSegment(value){
  // APP1 with a tiny EXIF block holding only the rotation flag.
  return new Uint8Array([
    0xFF,0xE1,0x00,0x22,
    0x45,0x78,0x69,0x66,0x00,0x00,
    0x4D,0x4D,0x00,0x2A,0x00,0x00,0x00,0x08,
    0x00,0x01,
    0x01,0x12,0x00,0x03,0x00,0x00,0x00,0x01,0x00,value,0x00,0x00,
    0x00,0x00,0x00,0x00
  ]);
}

function cleanJfif(seg){
  // Keep version and pixel density, drop any embedded thumbnail.
  const out=new Uint8Array(18);
  out.set([0xFF,0xE0,0x00,0x10]);
  out.set(seg.subarray(4,16),4);
  out[16]=0;out[17]=0;
  return out;
}

function stripJpeg(bytes){
  const parts=[bytes.subarray(0,2)];
  const removed=new Set();
  let orientation=1;
  let pos=2;
  let inScan=false;
  let scanStart=0;
  let ended=false;
  while(pos<bytes.length){
    if(inScan){
      // Walk the compressed data until the next real marker.
      let i=pos;
      while(i<bytes.length-1){
        if(bytes[i]===0xFF){
          const b=bytes[i+1];
          if(b===0x00||(b>=0xD0&&b<=0xD7)||b===0xFF){i+=b===0xFF?1:2;continue}
          break;
        }
        i++;
      }
      if(i>=bytes.length-1){parts.push(bytes.subarray(scanStart));pos=bytes.length;break}
      parts.push(bytes.subarray(scanStart,i));
      inScan=false;
      pos=i;
      continue;
    }
    if(bytes[pos]!==0xFF)throw new Error('This JPEG looks damaged.');
    while(bytes[pos+1]===0xFF)pos++;
    const marker=bytes[pos+1];
    if(marker===0xD9){parts.push(new Uint8Array([0xFF,0xD9]));ended=true;break}
    if(marker===0x01||(marker>=0xD0&&marker<=0xD7)){parts.push(bytes.subarray(pos,pos+2));pos+=2;continue}
    if(pos+4>bytes.length)throw new Error('This JPEG looks damaged.');
    const length=bytes[pos+2]<<8|bytes[pos+3];
    const end=pos+2+length;
    if(length<2||end>bytes.length)throw new Error('This JPEG looks damaged.');
    const seg=bytes.subarray(pos,end);
    const payload=bytes.subarray(pos+4,end);
    let keep=true;
    if(marker===0xE0){
      if(ascii(payload,0,5)==='JFIF\0'&&payload.length>=14){
        parts.push(cleanJfif(seg));
        if(payload.length>14)removed.add('Thumbnail');
        keep=false;
      }else{keep=false;removed.add('Other')}
    }else if(marker===0xE1){
      keep=false;
      if(ascii(payload,0,6)==='Exif\0\0'){
        const info=exifInfo(payload);
        if(info.orientation!==1)orientation=info.orientation;
        removed.add('EXIF');
        if(info.gps)removed.add('GPS location');
      }else if(ascii(payload,0,4)==='http')removed.add('XMP');
      else removed.add('Other');
    }else if(marker===0xE2){
      if(ascii(payload,0,12)!=='ICC_PROFILE\0'){keep=false;removed.add(ascii(payload,0,4)==='MPF\0'?'Extra images':'Other')}
    }else if(marker===0xED){keep=false;removed.add('IPTC')}
    else if(marker===0xEE){keep=ascii(payload,0,5)==='Adobe'}
    else if(marker>=0xE3&&marker<=0xEF){keep=false;removed.add('Other')}
    else if(marker===0xFE){keep=false;removed.add('Comment')}
    if(keep)parts.push(seg);
    pos=end;
    if(marker===0xDA){inScan=true;scanStart=pos}
  }
  if(!ended&&!inScan&&pos<bytes.length)parts.push(bytes.subarray(pos));
  if(ended&&pos+2<bytes.length)removed.add('Extra images');
  if(orientation!==1){
    // Right after the JFIF block (or the start marker), before anything else.
    const at=parts.length>1&&parts[1][1]===0xE0?2:1;
    parts.splice(at,0,orientationSegment(orientation));
  }
  return {bytes:concat(parts),removed:[...removed],kept:orientation!==1?['Rotation']:[]};
}

/* ---------- PNG ---------- */

const PNG_KEEP=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','gAMA','cHRM','sRGB','iCCP','sBIT','bKGD','pHYs','acTL','fcTL','fdAT']);
const PNG_LABEL={tEXt:'Text',zTXt:'Text',iTXt:'Text',eXIf:'EXIF',tIME:'Date'};

function stripPng(bytes){
  const parts=[bytes.subarray(0,8)];
  const removed=new Set();
  let pos=8;
  while(pos+12<=bytes.length){
    const length=(bytes[pos]*16777216)+(bytes[pos+1]<<16|bytes[pos+2]<<8|bytes[pos+3]);
    const type=ascii(bytes,pos+4,4);
    const end=pos+12+length;
    if(end>bytes.length)throw new Error('This PNG looks damaged.');
    if(PNG_KEEP.has(type))parts.push(bytes.subarray(pos,end));
    else if(type==='iTXt'&&ascii(bytes,pos+8,17)==='XML:com.adobe.xmp')removed.add('XMP');
    else removed.add(PNG_LABEL[type]||'Other');
    pos=end;
    if(type==='IEND')break;
  }
  return {bytes:concat(parts),removed:[...removed],kept:[]};
}

/* ---------- WebP ---------- */

function stripWebp(bytes){
  const parts=[];
  const removed=new Set();
  let pos=12;
  while(pos+8<=bytes.length){
    const type=ascii(bytes,pos,4);
    const size=bytes[pos+4]|bytes[pos+5]<<8|bytes[pos+6]<<16|bytes[pos+7]*16777216;
    const end=pos+8+size+(size&1);
    if(pos+8+size>bytes.length)throw new Error('This WebP looks damaged.');
    if(type==='EXIF')removed.add('EXIF');
    else if(type==='XMP ')removed.add('XMP');
    else{
      const chunk=bytes.slice(pos,Math.min(end,bytes.length));
      if(type==='VP8X')chunk[8]&=~0x0C;
      parts.push(chunk);
    }
    pos=end;
  }
  const body=concat(parts);
  const out=new Uint8Array(12+body.length);
  out.set(bytes.subarray(0,12));
  const riff=4+body.length;
  out[4]=riff&255;out[5]=riff>>8&255;out[6]=riff>>16&255;out[7]=riff>>>24&255;
  out.set(body,12);
  return {bytes:out,removed:[...removed],kept:[]};
}

/* ---------- GIF ---------- */

function subBlocksEnd(bytes,pos){
  while(pos<bytes.length){
    const n=bytes[pos];
    pos+=1+n;
    if(n===0)return pos;
  }
  throw new Error('This GIF looks damaged.');
}

function stripGif(bytes){
  const removed=new Set();
  let pos=13;
  const flags=bytes[10];
  if(flags&0x80)pos+=3*(1<<((flags&7)+1));
  const parts=[bytes.subarray(0,pos)];
  while(pos<bytes.length){
    const id=bytes[pos];
    if(id===0x3B){parts.push(bytes.subarray(pos,pos+1));break}
    if(id===0x2C){
      let p=pos+10;
      const f=bytes[pos+9];
      if(f&0x80)p+=3*(1<<((f&7)+1));
      const end=subBlocksEnd(bytes,p+1);
      parts.push(bytes.subarray(pos,end));
      pos=end;
      continue;
    }
    if(id===0x21){
      const label=bytes[pos+1];
      const end=subBlocksEnd(bytes,pos+2);
      let keep=label===0xF9||label===0x01;
      if(label===0xFF){
        const app=ascii(bytes,pos+3,11);
        keep=app==='NETSCAPE2.0'||app==='ANIMEXTS1.0';
        if(!keep)removed.add(app.startsWith('XMP')?'XMP':'Other');
      }else if(label===0xFE)removed.add('Comment');
      if(keep)parts.push(bytes.subarray(pos,end));
      pos=end;
      continue;
    }
    throw new Error('This GIF looks damaged.');
  }
  return {bytes:concat(parts),removed:[...removed],kept:[]};
}

/* ---------- entry ---------- */

const CLEANERS={jpeg:stripJpeg,png:stripPng,webp:stripWebp,gif:stripGif,bmp:(bytes)=>({bytes,removed:[],kept:[]})};

function strip(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  const type=detect(bytes);
  const cleaner=CLEANERS[type];
  if(!cleaner)return {type,supported:false};
  const result=cleaner(bytes);
  return {type,supported:true,bytes:result.bytes,removed:result.removed,kept:result.kept};
}

return {strip,detect};
});
