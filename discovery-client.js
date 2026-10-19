(function(){
 'use strict';
 if(window.LonerPayDiscovery)return;
 const categories={hotel:{label:'Hotels',term:'hotels',hint:'Compare hotel listings, view photos and contact the property.'},restaurant:{label:'Restaurants',term:'restaurants',hint:'Explore menus, photos and contact details where listed.'},supermarket:{label:'Supermarkets',term:'supermarkets',hint:'Find shops, opening hours and directions where listed.'}};
 function mapsURL(type,area){
  if(!categories[type])throw Error('Choose a place category.');
  const clean=String(area||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100);
  const url=new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api','1');url.searchParams.set('query',categories[type].term+(clean?' in '+clean:' near me'));return url.href;
 }
 function sheet(id,title,subtitle){
  document.getElementById(id)?.remove();
  const o=document.createElement('div');o.id=id;o.className='lp-discovery-overlay';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-labelledby',id+'Title');
  o.innerHTML='<section class="lp-discovery-sheet"><header><button type="button" class="discovery-back" aria-label="Back">←</button><div><small>LONERPAY</small><h2 id="'+id+'Title"></h2><p></p></div></header><div class="discovery-body"></div></section>';
  o.querySelector('h2').textContent=title;o.querySelector('header p').textContent=subtitle;
  document.body.append(o);o.querySelector('.discovery-back').onclick=()=>o.remove();o.querySelector('.discovery-back').focus();
  return o;
 }
 function openNearbyPlaces(){
  const o=sheet('lpNearbyPlaces','Nearby Places','Good places, closer to you.');
  const body=o.querySelector('.discovery-body');
  body.innerHTML='<div class="discovery-intro"><span class="discovery-eyebrow">EXPLORE YOUR AREA</span><h3>Stay. Eat. Shop.</h3><p>Find places and explore their listings on Google Maps.</p></div><fieldset class="discovery-categories"><legend>What are you looking for?</legend>'+Object.entries(categories).map(([key,x],i)=>'<label><input type="radio" name="placeType" value="'+key+'" '+(i===0?'checked':'')+'><span>'+x.label+'</span></label>').join('')+'</fieldset><label class="discovery-label" for="lpNearbyArea">Town or area (optional)</label><input id="lpNearbyArea" maxlength="100" autocomplete="address-level2" placeholder="For example, Nnewi, Anambra"><p class="discovery-muted">Leave this empty to search near you. Google Maps may ask for location permission or let you choose an area.</p><div class="discovery-result"><h3 data-category-title></h3><p data-category-hint></p><a class="discovery-primary" id="lpMapsSearch" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Find places on Google Maps ↗</a><p class="discovery-muted">Opens Google Maps in another tab or the Maps app. LonerPay does not receive or save your location in this feature.</p></div><div class="discovery-note"><strong>Before booking or ordering</strong><p>Check availability, prices and business details directly with the property or shop. Listings and opening hours may change. Hotel bookings, restaurant orders and supermarket payments are not processed by LonerPay in this version.</p></div><button type="button" class="discovery-secondary discovery-done">Back</button>';
  const area=body.querySelector('input#lpNearbyArea');
  function update(){const type=body.querySelector('[name=placeType]:checked').value;body.querySelector('[data-category-title]').textContent=categories[type].label;body.querySelector('[data-category-hint]').textContent=categories[type].hint;body.querySelector('#lpMapsSearch').href=mapsURL(type,area.value);}
  body.querySelectorAll('[name=placeType]').forEach(r=>r.onchange=update);area.oninput=update;
  area.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();body.querySelector('#lpMapsSearch').click();}};
  body.querySelector('.discovery-done').onclick=()=>o.remove();update();
 }
 function openGiftCards(){
  const o=sheet('lpGiftCards','Gift Cards','Buy and sell — activation in progress.');
  o.querySelector('.discovery-body').innerHTML='<div class="discovery-intro"><span class="discovery-eyebrow">SERVICE NOT ACTIVE YET</span><h3>Your gift-card hub</h3><p>Gift-card trading is being prepared. Buying and selling will open after provider access, live rates and settlement checks are ready.</p></div><section class="discovery-result"><h3>Buy gift cards</h3><p>Choose a supported brand, country and value. Review the final naira price before payment, then receive the confirmed card details.</p><span class="discovery-status">Purchases unavailable</span></section><section class="discovery-result"><h3>Sell gift cards</h3><p>Review a provider-backed offer, submit through the secure trading flow and track verification before any confirmed settlement.</p><span class="discovery-status">Sales unavailable</span></section><div class="discovery-note"><strong>Keep your card codes private</strong><p>We are not collecting gift-card codes, PINs, photos or payments here. Do not send them to support or people promising to activate this service.</p></div><button type="button" class="discovery-secondary discovery-done">Back</button>';
  o.querySelector('.discovery-done').onclick=()=>o.remove();
 }
 function install(){
  if(document.getElementById('lpDiscoveryStyles'))return;
  const style=document.createElement('style');style.id='lpDiscoveryStyles';style.textContent=`
  .lp-discovery-overlay{position:fixed;inset:0;z-index:29700;background:#20180db3;display:flex;align-items:flex-end;justify-content:center;font-family:inherit}.lp-discovery-overlay *{box-sizing:border-box}.lp-discovery-sheet{width:100%;max-width:520px;max-height:94dvh;overflow:auto;background:#faf8f2;color:#28251e;border-radius:26px 26px 0 0;box-shadow:0 -15px 60px #20190833}.lp-discovery-sheet header{display:flex;gap:13px;align-items:flex-start;padding:24px 20px;background:linear-gradient(120deg,#43321a,#936514);color:#fff9e9}.lp-discovery-sheet header small{font-size:10px;letter-spacing:1.8px;color:#f1dcb3}.lp-discovery-sheet h2{font-size:26px;margin:4px 0 7px;line-height:1.15}.lp-discovery-sheet header p{font-size:13px;color:#f1dfc1;margin:0}.lp-discovery-sheet button,.lp-discovery-sheet input,.lp-discovery-sheet a{font:inherit}.lp-discovery-sheet .discovery-back{border:1px solid #ffffff50;border-radius:50%;background:#ffffff12;color:white;padding:7px 13px;font-size:23px;cursor:pointer}.discovery-body{padding:22px 20px 30px}.discovery-intro{margin-bottom:23px}.discovery-eyebrow{font-size:10px;font-weight:750;letter-spacing:1.7px;color:#8b6421}.discovery-body h3{font-size:20px;line-height:1.3;margin:8px 0}.discovery-body p{font-size:14px;line-height:1.65;margin:8px 0;color:#716654}.discovery-categories{border:0;padding:0;margin:0 0 21px;display:flex;gap:7px;flex-wrap:wrap}.discovery-categories legend,.discovery-label{display:block;font-size:13px;font-weight:700;margin-bottom:10px}.discovery-categories label{flex:1;min-width:100px;position:relative;cursor:pointer}.discovery-categories input{position:absolute;opacity:0;width:1px;height:1px}.discovery-categories span{display:block;text-align:center;padding:13px 7px;border:1px solid #dfd1b4;border-radius:13px;background:white;font-size:13px;color:#795519}.discovery-categories input:checked+span{background:#936514;color:white;border-color:#936514}.discovery-categories input:focus-visible+span{outline:3px solid #c69a49;outline-offset:3px}.discovery-body #lpNearbyArea{width:100%;border:1px solid #dfd1b4;border-radius:13px;padding:14px;background:white;color:#28251e}.discovery-body .discovery-muted{font-size:12px}.discovery-result{background:white;border:1px solid #e6d9be;border-radius:17px;padding:19px;margin:18px 0}.discovery-primary,.discovery-secondary{display:block;width:100%;text-align:center;text-decoration:none;cursor:pointer;padding:14px;border:0;border-radius:13px}.discovery-primary{background:#936514;color:white;margin-top:17px;font-weight:700}.discovery-secondary{background:transparent;color:#795519;margin-top:14px}.discovery-note{background:#f3ebd7;border:1px solid #e5d5b3;border-radius:15px;padding:16px;font-size:13px}.discovery-note p{font-size:12px;margin:7px 0 0}.discovery-status{display:inline-block;font-size:12px;background:#f5eddb;color:#795519;padding:6px 10px;border-radius:8px}.lp-discovery-sheet :focus-visible{outline:3px solid #c69a49;outline-offset:3px}
  `;document.head.append(style);
  const services=document.querySelector('.services');if(!services)return;
  for(const [id,name,description,fn] of [['lpGiftCardsService','Gift Cards','Buy & sell · not active',openGiftCards],['lpNearbyService','Nearby Places','Hotels, food & shops',openNearbyPlaces]]){
   if(document.getElementById(id))continue;
   const card=document.createElement('div');card.id=id;card.className='service';card.setAttribute('role','button');card.tabIndex=0;
   card.innerHTML='<div aria-hidden="true">'+(id==='lpGiftCardsService'?'🎁':'⌖')+'</div><h3>'+name+'</h3><p>'+description+'</p>';card.onclick=fn;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}};services.append(card);
  }
 }
 window.openGiftCards=openGiftCards;window.openNearbyPlaces=openNearbyPlaces;
 window.LonerPayDiscovery=Object.freeze({openGiftCards,openNearbyPlaces});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
