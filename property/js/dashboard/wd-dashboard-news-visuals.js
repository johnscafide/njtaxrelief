/* Adds source-article hero imagery to the dashboard NJ news wire. */
(function(w,d){
'use strict';if(w.__WDD_NEWS_VISUALS__)return;w.__WDD_NEWS_VISUALS__=true;
var cache=new Map(),busy=new Set(),observer=null;
function q(s,r){return(r||d).querySelector(s)}function qa(s,r){return Array.from((r||d).querySelectorAll(s))}
function fallback(story){var item=story.closest('.wdnj-item'),topic=item&&q('.wdnj-topic',item),label=topic?topic.textContent:'NJ',icon=/tax/i.test(label)?'fa-receipt':/commercial/i.test(label)?'fa-building':/residential|housing/i.test(label)?'fa-house':'fa-newspaper';return'<span class="wdnj-thumb-fallback"><i class="fas '+icon+'"></i></span>'}
function apply(node,url){if(!node||!url)return;var img=new Image();img.loading='lazy';img.decoding='async';img.alt='';img.onload=function(){node.innerHTML='';node.appendChild(img)};img.onerror=function(){};img.src=url}
function enhance(){qa('.wdnj-item').forEach(function(item){if(item.dataset.wdVisual==='1')return;var story=q('.wdnj-story',item),content=item.firstElementChild;if(!story||!content)return;item.dataset.wdVisual='1';var thumb=d.createElement('a');thumb.className='wdnj-thumb';thumb.href=story.href;thumb.target='_blank';thumb.rel='noopener noreferrer';thumb.setAttribute('aria-label','Open article');thumb.innerHTML=fallback(story);item.insertBefore(thumb,content);var url=story.href;if(cache.has(url)){apply(thumb,cache.get(url));return}if(busy.has(url))return;busy.add(url);fetch('/api/nj-news-image?url='+encodeURIComponent(url),{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(x){var image=x&&x.imageUrl||'';cache.set(url,image);apply(thumb,image)}).catch(function(){}).finally(function(){busy.delete(url)})})}
function start(){enhance();if(observer)return;observer=new MutationObserver(function(m){if(m.some(function(x){return x.addedNodes&&x.addedNodes.length}))enhance()});observer.observe(d.body,{childList:true,subtree:true});setTimeout(enhance,850);setTimeout(enhance,2200)}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window,document);
