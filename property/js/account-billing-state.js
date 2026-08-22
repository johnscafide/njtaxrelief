(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var client=window.NJPTRSupabaseRuntime.createClient();
var state=null,loading=null;
function label(value){value=String(value||'').toLowerCase();if(value==='stripe')return'Stripe';if(value==='paddle')return'Paddle';if(value==='manual')return'Watchdog';return value?value.charAt(0).toUpperCase()+value.slice(1):'No paid billing account';}
function currentMembershipCard(){var cards=document.querySelectorAll('.ac-card.ac-plan');for(var i=0;i<cards.length;i++){if(cards[i].querySelector('.ac-meta'))return cards[i];}return null;}
function apply(){if(!state)return;var card=currentMembershipCard();if(!card)return;var rows=card.querySelectorAll('.ac-meta>div');for(var i=0;i<rows.length;i++){var small=rows[i].querySelector('small'),value=rows[i].querySelector('b');if(small&&value&&small.textContent.trim()==='Billing provider')value.textContent=label(state.provider);}if(state.provider_customer_id&&!card.querySelector('[data-billing-portal]')){var button=document.createElement('button');button.type='button';button.className='ac-primary';button.setAttribute('data-billing-portal','');button.innerHTML='<i class="fas fa-arrow-up-right-from-square"></i> Manage subscription &amp; invoices';card.appendChild(button);document.dispatchEvent(new CustomEvent('watchdog:billing-controls-added'));}}
function load(){if(state)return Promise.resolve(state);if(loading)return loading;loading=client.rpc('get_my_account_billing_state').then(function(result){if(result.error)throw result.error;state=(Array.isArray(result.data)?result.data[0]:result.data)||{};apply();return state;}).catch(function(error){console.warn('[Account] billing provider state unavailable',error);return null;}).finally(function(){loading=null;});return loading;}
document.addEventListener('watchdog:account-rendered',function(){load().then(apply);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(load,250);},{once:true});else setTimeout(load,250);
})();
