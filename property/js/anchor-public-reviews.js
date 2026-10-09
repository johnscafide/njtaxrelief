(function(){
'use strict';
if(window.__watchdogAnchorPublicReviews)return;
window.__watchdogAnchorPublicReviews=true;

var API='/api/watchdog-anchor-reviews';
var FIRST_SHOWN=3;
var MIN_RATINGS=3;

function starText(value){
  var n=Math.max(0,Math.min(5,Math.round(Number(value)||0)));
  return '★★★★★'.slice(0,n)+'☆☆☆☆☆'.slice(0,5-n);
}

function load(){
  return fetch(API,{headers:{Accept:'application/json'}})
    .then(function(response){if(!response.ok)throw new Error('reviews_failed');return response.json()});
}

function paintNav(data){
  var average=Number(data.average_rating)||0,count=Number(data.rating_count)||0;
  document.querySelectorAll('[data-anchor-nav-rating]').forEach(function(host){
    if(count<MIN_RATINGS||average<=0){host.hidden=true;return}
    var value=host.querySelector('[data-anchor-nav-rating-value]');
    if(value)value.textContent=average.toFixed(1);
    host.hidden=false;
  });
}

function reviewItem(template,review,index){
  var node=template.content.firstElementChild.cloneNode(true);
  var stars=node.querySelector('[data-review-stars]'),rating=node.querySelector('[data-review-rating]'),text=node.querySelector('[data-review-text]');
  var replyBox=node.querySelector('[data-review-reply]'),replyText=node.querySelector('[data-review-reply-text]');
  if(stars)stars.textContent=starText(review.rating);
  if(rating)rating.textContent=String(review.rating);
  if(text)text.textContent='“'+review.comment+'”';
  if(review.reply&&replyBox&&replyText){replyText.textContent=review.reply;replyBox.hidden=false}
  if(index>=FIRST_SHOWN)node.hidden=true;
  return node;
}

function paintList(data){
  var section=document.getElementById('wd-app-reviews');
  if(!section)return;
  var average=Number(data.average_rating)||0,count=Number(data.rating_count)||0;
  var reviews=Array.isArray(data.reviews)?data.reviews.filter(function(r){return r&&String(r.comment||'').trim()}):[];
  if(count<MIN_RATINGS&&!reviews.length)return;
  var avg=section.querySelector('[data-reviews-average]'),total=section.querySelector('[data-reviews-count]'),stars=section.querySelector('[data-reviews-stars]'),score=section.querySelector('[data-reviews-score]');
  if(score&&count>=MIN_RATINGS&&average>0){
    if(avg)avg.textContent=average.toFixed(1);
    if(total)total.textContent=count.toLocaleString();
    if(stars)stars.textContent=starText(average);
    score.hidden=false;
  }
  var list=section.querySelector('[data-reviews-list]'),template=document.getElementById('wd-app-review-template'),more=section.querySelector('[data-reviews-more]');
  if(list&&template){
    list.textContent='';
    reviews.forEach(function(review,index){list.appendChild(reviewItem(template,review,index))});
  }
  if(more&&reviews.length>FIRST_SHOWN){
    more.hidden=false;
    more.addEventListener('click',function(){
      list.querySelectorAll('li[hidden]').forEach(function(li){li.hidden=false});
      more.hidden=true;
    },{once:true});
  }
  section.hidden=false;
}

function start(){
  if(!document.querySelector('[data-anchor-nav-rating]')&&!document.getElementById('wd-app-reviews'))return;
  load().then(function(data){paintNav(data||{});paintList(data||{})}).catch(function(){});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
