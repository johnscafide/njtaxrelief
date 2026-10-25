/* Image Cleaner (Backoffice owner only).
   Photos and .zip files are read, cleaned and zipped in this browser tab.
   Nothing is sent to a server. Cleaning lives in strip-metadata.js; zips use fflate. */
(function(){
'use strict';
const JUNK=/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$|\._)/i;
const CONVERT={heic:'HEIC',avif:'AVIF',tiff:'TIFF'};

const $=(id)=>document.getElementById(id);
const els={};
let downloadUrl='';
let busy=false;

function readBytes(file){
  if(file.arrayBuffer)return file.arrayBuffer().then((b)=>new Uint8Array(b));
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(new Uint8Array(r.result));r.onerror=()=>reject(r.error);r.readAsArrayBuffer(file)});
}

function unzipAsync(bytes){
  return new Promise((resolve,reject)=>{
    window.fflate.unzip(bytes,{filter:(f)=>!f.name.endsWith('/')&&!JUNK.test(f.name)},(err,files)=>err?reject(err):resolve(files));
  });
}

function zipAsync(files){
  return new Promise((resolve,reject)=>{
    window.fflate.zip(files,{level:0},(err,data)=>err?reject(err):resolve(data));
  });
}

function isZip(name,bytes){
  return /\.zip$/i.test(name)||(bytes.length>3&&bytes[0]===0x50&&bytes[1]===0x4B&&bytes[2]===0x03&&bytes[3]===0x04);
}

function baseName(path){return path.split('/').pop()}
function stripExt(name){return name.replace(/\.[^./]+$/,'')}

// Browsers that can open HEIC/AVIF/TIFF redraw them as a new JPG with no hidden info.
async function convertToJpeg(bytes){
  const bitmap=await createImageBitmap(new Blob([bytes]));
  const canvas=document.createElement('canvas');
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  canvas.getContext('2d').drawImage(bitmap,0,0);
  bitmap.close&&bitmap.close();
  const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/jpeg',0.92));
  if(!blob)throw new Error('convert failed');
  return new Uint8Array(await blob.arrayBuffer());
}

async function collect(fileList){
  const items=[];
  const zips=[];
  for(const file of fileList){
    const path=file.webkitRelativePath||file.name;
    if(JUNK.test(path))continue;
    let bytes;
    try{bytes=await readBytes(file)}
    catch(_){items.push({path,error:'Couldn’t read this. For a folder, use Choose a folder.'});continue}
    if(isZip(file.name,bytes))zips.push({name:file.name,bytes});
    else items.push({path,bytes});
  }
  for(const zip of zips){
    let files;
    try{files=await unzipAsync(zip.bytes)}
    catch(_){items.push({path:zip.name,error:'Couldn’t open this .zip'});continue}
    const prefix=zips.length>1||items.length?stripExt(zip.name)+'/':'';
    for(const name of Object.keys(files))items.push({path:prefix+name,bytes:files[name]});
  }
  return items;
}

function uniquePath(path,used){
  let candidate=path;
  let n=2;
  while(used.has(candidate.toLowerCase())){
    const dot=path.lastIndexOf('.');
    candidate=dot>path.lastIndexOf('/')?path.slice(0,dot)+' ('+n+')'+path.slice(dot):path+' ('+n+')';
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function cleanOne(item){
  if(item.error)return {path:item.path,skipped:item.error};
  const cleaner=window.WatchdogImageCleaner;
  const type=cleaner.detect(item.bytes);
  if(CONVERT[type]){
    try{
      const jpeg=await convertToJpeg(item.bytes);
      return {path:stripExt(item.path)+'.jpg',bytes:jpeg,tags:['Saved as JPG']};
    }catch(_){return {path:item.path,skipped:'This browser can’t open '+CONVERT[type]+' files. Try Safari.'}}
  }
  if(!type)return {path:item.path,skipped:'Not an image, left out'};
  try{
    const result=cleaner.strip(item.bytes);
    const tags=result.removed.length?result.removed:['Nothing hidden'];
    return {path:item.path,bytes:result.bytes,tags};
  }catch(err){return {path:item.path,skipped:(err&&err.message)||'Couldn’t read this file'}}
}

function addRow(result){
  const row=els.row.content.firstElementChild.cloneNode(true);
  row.querySelector('.ic-name').textContent=result.path;
  const tags=row.querySelector('.ic-tags');
  const list=result.skipped?[result.skipped]:result.tags;
  for(const text of list){
    const pill=document.createElement('span');
    pill.className='bo-pill '+(result.skipped?'is-warn':text==='Nothing hidden'?'':'is-good');
    pill.textContent=text;
    tags.append(pill);
  }
  if(result.skipped)row.classList.add('is-skipped');
  els.list.append(row);
}

function zipName(fileList){
  const files=[...fileList];
  if(files.length===1&&/\.zip$/i.test(files[0].name))return stripExt(files[0].name)+'-cleaned.zip';
  if(files.length&&files[0].webkitRelativePath)return files[0].webkitRelativePath.split('/')[0]+'-cleaned.zip';
  return 'cleaned-photos-'+new Date().toISOString().slice(0,10)+'.zip';
}

function plural(n,word){return n.toLocaleString()+' '+word+(n===1?'':'s')}

async function run(fileList){
  if(busy||!fileList||!fileList.length)return;
  if(!window.fflate||!window.WatchdogImageCleaner){els.status.textContent='Still loading. Try again in a second.';els.work.hidden=false;return}
  busy=true;
  reset(false);
  els.pick.hidden=true;
  els.work.hidden=false;
  els.status.textContent='Reading files...';
  try{
    const items=await collect(fileList);
    if(!items.length){els.status.textContent='No files found.';return}
    const used=new Set();
    const out={};
    let cleaned=0;let skipped=0;
    els.progress.max=items.length;
    for(let i=0;i<items.length;i++){
      els.status.textContent='Cleaning '+(i+1).toLocaleString()+' of '+items.length.toLocaleString()+'...';
      const result=await cleanOne(items[i]);
      items[i].bytes=null;
      if(result.bytes){result.path=uniquePath(result.path,used);out[result.path]=result.bytes;cleaned++}
      else skipped++;
      addRow(result);
      els.progress.value=i+1;
    }
    els.summary.textContent=plural(cleaned,'photo')+' cleaned'+(skipped?', '+plural(skipped,'file')+' left out':'');
    if(!cleaned){els.status.textContent='Nothing to clean';return}
    els.status.textContent='Zipping...';
    const zipped=await zipAsync(out);
    downloadUrl=URL.createObjectURL(new Blob([zipped],{type:'application/zip'}));
    els.download.href=downloadUrl;
    els.download.download=zipName(fileList);
    els.download.hidden=false;
    els.status.textContent='Done';
  }catch(err){
    els.status.textContent='Something went wrong: '+((err&&err.message)||'unknown error');
  }finally{
    busy=false;
    els.progress.hidden=true;
    els.reset.hidden=false;
    els.files.value='';els.folder.value='';
  }
}

function reset(showPicker){
  if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=''}
  els.list.replaceChildren();
  els.summary.textContent='';
  els.download.hidden=true;
  els.download.removeAttribute('href');
  els.reset.hidden=true;
  els.progress.value=0;
  els.progress.hidden=false;
  if(showPicker){els.work.hidden=true;els.pick.hidden=false}
}

function init(){
  for(const id of ['pick','drop','files','folder','work','status','summary','download','reset','progress','list','row'])els[id]=$('ic-'+id);
  els.files.addEventListener('change',()=>run(els.files.files));
  els.folder.addEventListener('change',()=>run(els.folder.files));
  els.reset.addEventListener('click',()=>reset(true));
  ['dragenter','dragover'].forEach((type)=>els.drop.addEventListener(type,(e)=>{e.preventDefault();els.drop.classList.add('is-over')}));
  ['dragleave','drop'].forEach((type)=>els.drop.addEventListener(type,()=>els.drop.classList.remove('is-over')));
  els.drop.addEventListener('drop',(e)=>{e.preventDefault();run(e.dataTransfer&&e.dataTransfer.files)});
  // A file dropped outside the box shouldn't open in the tab.
  window.addEventListener('dragover',(e)=>e.preventDefault());
  window.addEventListener('drop',(e)=>e.preventDefault());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
