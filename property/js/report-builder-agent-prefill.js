(function(){
'use strict';
var p=new URLSearchParams(location.search),pin=String(p.get('pams_pin')||'').trim(),preset=String(p.get('preset')||'').trim(),title=String(p.get('title')||'').trim();
if(!pin&&!preset&&!title)return;
var tries=0,t=setInterval(function(){tries++;var app=document.getElementById('rb-app'),open=document.getElementById('rb-new'),property=document.getElementById('rb-property'),kind=document.getElementById('rb-preset'),name=document.getElementById('rb-title');if(app&&!app.hidden&&open&&property&&kind&&name){clearInterval(t);open.click();if(pin&&Array.from(property.options).some(function(o){return o.value===pin}))property.value=pin;if(preset&&Array.from(kind.options).some(function(o){return o.value===preset&&!o.disabled}))kind.value=preset;if(title)name.value=title;else{var option=property.options[property.selectedIndex];if(option)name.value=option.text+' professional report'}name.focus()}else if(tries>100)clearInterval(t)},100);
})();