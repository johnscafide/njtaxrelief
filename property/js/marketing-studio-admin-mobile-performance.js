(function(){'use strict';
if(!window.matchMedia||!window.matchMedia('(max-width: 720px)').matches)return;
let timer=0;
document.addEventListener('input',function(event){
  const input=event.target;
  if(!input||!input.matches||!input.matches('[data-customer-search]')||event.__dmaaDebounced)return;
  event.stopImmediatePropagation();
  clearTimeout(timer);
  timer=window.setTimeout(function(){
    if(!input.isConnected)return;
    const deferred=new Event('input',{bubbles:true});
    Object.defineProperty(deferred,'__dmaaDebounced',{value:true});
    input.dispatchEvent(deferred);
  },160);
},true);
})();
