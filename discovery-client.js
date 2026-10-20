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
  const o=sheet('lpNearbyPlaces','Nearby Places','Stay, eat and shop around you.');
  const body=o.querySelector('.discovery-body');
  body.innerHTML='<div class="discovery-intro"><span class="discovery-eyebrow">EXPLORE YOUR AREA</span><h3>Find your next stop.</h3><p>Browse places, check the details and get directions.</p></div><form id="lpPlacesForm"><fieldset class="discovery-categories"><legend>What are you looking for?</legend>'+Object.entries(categories).map(([key,x],i)=>'<label><input type="radio" name="placeType" value="'+key+'" '+(i===0?'checked':'')+'><span>'+x.label+'</span></label>').join('')+'</fieldset><label class="discovery-label" for="lpNearbyArea">Town or area in Nigeria</label><input id="lpNearbyArea" maxlength="100" autocomplete="address-level2" placeholder="For example, Nnewi, Anambra"><div class="places-location-row"><button type="button" id="lpPlacesLocate" disabled>Use my location</button><button type="button" id="lpPlacesClear" hidden>Clear location</button></div><p class="discovery-muted">Location is optional. If you choose it, your coordinates will be sent to LonerPay and Google to find places within 5 km. They are not saved to your LonerPay account.</p><button type="submit" class="discovery-primary" id="lpPlacesSearch" disabled>Find places</button></form><p id="lpPlacesStatus" role="status" aria-live="polite">Checking place search availability…</p><section id="lpPlacesResults" aria-label="Place results"></section><div class="discovery-result"><h3>Explore on Google Maps</h3><p>Prefer the Maps app? Search there for more listings and directions.</p><a class="discovery-primary" id="lpMapsSearch" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Find places on Google Maps ↗</a></div><div class="discovery-note"><strong>Check before you book or order</strong><p>Confirm prices, opening hours and availability directly with the business. Hotel bookings, restaurant orders and supermarket payments are not processed by LonerPay in this version.</p></div><button type="button" class="discovery-secondary discovery-done">Back</button>';
  const area=body.querySelector('#lpNearbyArea'),status=body.querySelector('#lpPlacesStatus'),results=body.querySelector('#lpPlacesResults'),search=body.querySelector('#lpPlacesSearch'),locate=body.querySelector('#lpPlacesLocate'),clear=body.querySelector('#lpPlacesClear');
  const token=()=>localStorage.getItem('lonerpay_access_token')||'';
  let enabled=false,location=null,sequence=0,controller=null,expiry=null;
  const alive=(seq,t)=>o.isConnected&&sequence===seq&&token()===t;
  const type=()=>body.querySelector('[name=placeType]:checked').value;
  function reset(){sequence++;controller?.abort();clearTimeout(expiry);results.replaceChildren();search.disabled=locate.disabled=!enabled;}
  function maps(){body.querySelector('#lpMapsSearch').href=mapsURL(type(),area.value);}
  function clearLocation(){location=null;clear.hidden=true;locate.textContent='Use my location';}
  area.oninput=()=>{reset();clearLocation();maps();status.textContent=enabled?'Tap Find places to search this area.':'In-app search is not active yet. Google Maps search is available below.';};
  body.querySelectorAll('[name=placeType]').forEach(r=>r.onchange=()=>{reset();maps();status.textContent=enabled?'Tap Find places to search this category.':'In-app search is not active yet. Google Maps search is available below.';});
  clear.onclick=()=>{reset();clearLocation();status.textContent='Location cleared. Enter a town or area.';};
  async function api(payload,signal){
   const t=token();if(!t)throw Error('Please sign in again to search for places.');
   const r=await fetch('/api/places',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify(payload),cache:'no-store',signal});
   const d=await r.json();if(token()!==t)throw Error('Your account session changed. Please reopen Nearby Places.');if(!r.ok)throw Error(d.error||'Places could not be loaded.');return d;
  }
  locate.onclick=()=>{
   if(!enabled)return;
   if(!navigator.geolocation){status.textContent='Location is unavailable in this browser. Enter a town or area instead.';return;}
   reset();const seq=sequence,t=token();locate.disabled=true;status.textContent='Allow location access if prompted. You can enter a town instead.';
   navigator.geolocation.getCurrentPosition(position=>{
    if(!alive(seq,t))return;
    locate.disabled=false;const latitude=position.coords.latitude,longitude=position.coords.longitude;
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){status.textContent='Your location could not be read. Enter a town instead.';return;}
    location={latitude,longitude};area.value='';clear.hidden=false;locate.textContent='Update my location';maps();
    status.textContent='Location ready. Tap Find places.'+(position.coords.accuracy>1000?' Your device location is approximate.':'');
   },error=>{if(!alive(seq,t))return;locate.disabled=false;status.textContent=error.code===1?'Location access was blocked. Enter a town or allow location in your browser settings.':'Your location could not be found. Enter a town or try again.';},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
  };
  const safe=(value,photo=false)=>{try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';if(photo&&!(u.protocol==='https:'&&(/(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$/).test(u.hostname)))return '';return u.href;}catch{return '';}};
  function link(label,url){const a=document.createElement('a');a.textContent=label;a.href=safe(url);a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';return a;}
  function attribution(container,rows){for(const author of rows||[]){const row=document.createElement('span');if(safe(author.avatar,true)){const avatar=document.createElement('img');avatar.src=author.avatar;avatar.alt='';avatar.width=20;avatar.height=20;avatar.referrerPolicy='no-referrer';row.append(avatar);}if(safe(author.uri))row.append(link(author.name,author.uri));else row.append(document.createTextNode(author.name||''));container.append(row);}}
  function render(places,seq,t){
   results.replaceChildren();
   if(!places.length)return;
   const attr=document.createElement('p');attr.className='places-attribution';attr.textContent='Google Maps';attr.setAttribute('translate','no');results.append(attr);
   for(const p of places){
    const card=document.createElement('article');card.className='discovery-result places-card';
    const heading=document.createElement('h3');heading.textContent=p.name;const address=document.createElement('p');address.textContent=p.address||'Address not listed';card.append(heading,address);
    const meta=document.createElement('p');meta.className='places-meta';const bits=[];
    if(Number.isFinite(p.distance_km))bits.push(p.distance_km.toFixed(1)+' km away (straight line)');
    if(Number.isFinite(p.rating))bits.push('★ '+p.rating.toFixed(1)+(p.rating_count!=null?' ('+p.rating_count+' ratings)':''));
    if(p.business_status==='CLOSED_PERMANENTLY')bits.push('Permanently closed');else if(p.business_status==='CLOSED_TEMPORARILY')bits.push('Temporarily closed');else bits.push(p.open_now===true?'Open now':p.open_now===false?'Closed now':'Opening status not listed');
    meta.textContent=bits.join(' · ');card.append(meta);
    if(p.hours?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Opening hours';details.append(summary);for(const day of p.hours){const line=document.createElement('p');line.textContent=day;details.append(line);}card.append(details);}
    const actions=document.createElement('div');actions.className='places-links';
    for(const [label,url] of [['Directions',p.directions_url],['View on Google Maps',p.maps_url],['Visit website',p.website]])if(safe(url))actions.append(link(label,url));
    if(/^\+?[\d ()-]{6,30}$/.test(p.phone||'')){const a=document.createElement('a');a.textContent='Call '+p.phone;a.href='tel:'+p.phone.replace(/[^\d+]/g,'');actions.append(a);}card.append(actions);
    if(p.attributions?.length){const credit=document.createElement('div');credit.className='places-authors';attribution(credit,p.attributions);card.append(credit);}
    if(p.photo?.ticket){
     const photoBox=document.createElement('figure');photoBox.className='places-photo';const b=document.createElement('button');b.type='button';b.textContent='Load photo';photoBox.append(b);card.append(photoBox);
     b.onclick=async()=>{if(b.disabled)return;b.disabled=true;b.textContent='Loading photo…';try{const d=await api({action:'photo',ticket:p.photo.ticket});if(!alive(seq,t)||!b.isConnected)return;const url=safe(d.photo_url,true);if(!url)throw Error('Photo unavailable.');const img=document.createElement('img');img.alt='Photo of '+p.name;img.referrerPolicy='no-referrer';img.src=url;img.onerror=()=>{img.remove();b.hidden=false;b.disabled=false;b.textContent='Photo unavailable — retry';};photoBox.prepend(img);b.hidden=true;const credit=document.createElement('figcaption');credit.className='places-authors';attribution(credit,p.photo.authors);if(safe(p.photo.source))credit.append(link('View original photo on Google Maps',p.photo.source));photoBox.append(credit);}catch(e){if(alive(seq,t)&&b.isConnected){b.disabled=false;b.textContent='Retry photo';status.textContent=e.message;}}};
    }
    results.append(card);
   }
  }
  body.querySelector('#lpPlacesForm').onsubmit=async event=>{
   event.preventDefault();if(search.disabled||!enabled)return;
   if(!location&&area.value.trim().length<2){status.textContent='Enter a town or area, or choose Use my location.';area.focus();return;}
   reset();const seq=sequence,t=token();controller=new AbortController();search.disabled=true;status.textContent='Finding places…';
   try{const d=await api({action:'search',category:type(),...(location?{location}:{area:area.value.trim()})},controller.signal);if(!alive(seq,t))return;render(d.places||[],seq,t);status.textContent=d.places?.length?(d.ranking==='distance'?'Places within 5 km, ordered by distance. Distances shown are approximate straight-line distances.':'Results for your area, ordered by Google Maps relevance.'):'No matching places were found. Try another area or search Google Maps below.';expiry=setTimeout(()=>{if(alive(seq,t)){reset();status.textContent='Results expired. Search again for current details.';}},600000);}catch(e){if(alive(seq,t)&&e.name!=='AbortError')status.textContent=e.message;}finally{if(alive(seq,t))search.disabled=false;}
  };
  body.querySelector('.discovery-done').onclick=()=>o.remove();maps();
  // No automatic location request or billable search. Configuration check only.
  const initialToken=token();fetch('/api/places',{headers:{Authorization:'Bearer '+initialToken},cache:'no-store'}).then(async r=>{const d=await r.json();if(!o.isConnected||token()!==initialToken)return;if(!r.ok)throw Error(d.error||'Place search unavailable');enabled=d.enabled===true;search.disabled=locate.disabled=!enabled;status.textContent=enabled?'Enter an area or choose Use my location, then tap Find places.':'In-app place search is awaiting activation. Google Maps search still works below.';}).catch(e=>{if(o.isConnected)status.textContent=e.message||'In-app search is unavailable. Try Google Maps below.';});
  const observer=new MutationObserver(()=>{if(!o.isConnected){controller?.abort();clearTimeout(expiry);sequence++;locate.disabled=false;observer.disconnect();}});observer.observe(document.body,{childList:true});
 }
 function openGiftCards(){
  if(window.LonerPayGiftCards)return window.LonerPayGiftCards.open();
  const o=sheet('lpGiftCards','Gift Cards','Buy and sell — activation in progress.');
  o.querySelector('.discovery-body').innerHTML='<div class="discovery-intro"><span class="discovery-eyebrow">SERVICE NOT ACTIVE YET</span><h3>Your gift-card hub</h3><p>Gift-card trading is being prepared. Buying and selling will open after provider access, live rates and settlement checks are ready.</p></div><section class="discovery-result"><h3>Buy gift cards</h3><p>Choose a supported brand, country and value. Review the final naira price before payment, then receive the confirmed card details.</p><span class="discovery-status">Purchases unavailable</span></section><section class="discovery-result"><h3>Sell gift cards</h3><p>Review a provider-backed offer, submit through the secure trading flow and track verification before any confirmed settlement.</p><span class="discovery-status">Sales unavailable</span></section><div class="discovery-note"><strong>Keep your card codes private</strong><p>We are not collecting gift-card codes, PINs, photos or payments here. Do not send them to support or people promising to activate this service.</p></div><button type="button" class="discovery-secondary discovery-done">Back</button>';
  o.querySelector('.discovery-done').onclick=()=>o.remove();
 }
 function install(){
  if(document.getElementById('lpDiscoveryStyles'))return;
  const style=document.createElement('style');style.id='lpDiscoveryStyles';style.textContent=`
  .lp-discovery-overlay{position:fixed;inset:0;z-index:29700;background:#20180db3;display:flex;align-items:flex-end;justify-content:center;font-family:inherit}.lp-discovery-overlay *{box-sizing:border-box}.lp-discovery-sheet{width:100%;max-width:520px;max-height:94dvh;overflow:auto;background:#faf8f2;color:#28251e;border-radius:26px 26px 0 0;box-shadow:0 -15px 60px #20190833}.lp-discovery-sheet header{display:flex;gap:13px;align-items:flex-start;padding:24px 20px;background:linear-gradient(120deg,#43321a,#936514);color:#fff9e9}.lp-discovery-sheet header small{font-size:10px;letter-spacing:1.8px;color:#f1dcb3}.lp-discovery-sheet h2{font-size:26px;margin:4px 0 7px;line-height:1.15}.lp-discovery-sheet header p{font-size:13px;color:#f1dfc1;margin:0}.lp-discovery-sheet button,.lp-discovery-sheet input,.lp-discovery-sheet a{font:inherit}.lp-discovery-sheet .discovery-back{border:1px solid #ffffff50;border-radius:50%;background:#ffffff12;color:white;padding:7px 13px;font-size:23px;cursor:pointer}.discovery-body{padding:22px 20px 30px}.discovery-intro{margin-bottom:23px}.discovery-eyebrow{font-size:10px;font-weight:750;letter-spacing:1.7px;color:#8b6421}.discovery-body h3{font-size:20px;line-height:1.3;margin:8px 0}.discovery-body p{font-size:14px;line-height:1.65;margin:8px 0;color:#716654}.discovery-categories{border:0;padding:0;margin:0 0 21px;display:flex;gap:7px;flex-wrap:wrap}.discovery-categories legend,.discovery-label{display:block;font-size:13px;font-weight:700;margin-bottom:10px}.discovery-categories label{flex:1;min-width:100px;position:relative;cursor:pointer}.discovery-categories input{position:absolute;opacity:0;width:1px;height:1px}.discovery-categories span{display:block;text-align:center;padding:13px 7px;border:1px solid #dfd1b4;border-radius:13px;background:white;font-size:13px;color:#795519}.discovery-categories input:checked+span{background:#936514;color:white;border-color:#936514}.discovery-categories input:focus-visible+span{outline:3px solid #c69a49;outline-offset:3px}.discovery-body #lpNearbyArea{width:100%;border:1px solid #dfd1b4;border-radius:13px;padding:14px;background:white;color:#28251e}.discovery-body .discovery-muted{font-size:12px}.discovery-result{background:white;border:1px solid #e6d9be;border-radius:17px;padding:19px;margin:18px 0}.discovery-primary,.discovery-secondary{display:block;width:100%;text-align:center;text-decoration:none;cursor:pointer;padding:14px;border:0;border-radius:13px}.discovery-primary{background:#936514;color:white;margin-top:17px;font-weight:700}.discovery-secondary{background:transparent;color:#795519;margin-top:14px}.discovery-note{background:#f3ebd7;border:1px solid #e5d5b3;border-radius:15px;padding:16px;font-size:13px}.discovery-note p{font-size:12px;margin:7px 0 0}.discovery-status{display:inline-block;font-size:12px;background:#f5eddb;color:#795519;padding:6px 10px;border-radius:8px}.lp-discovery-sheet :focus-visible{outline:3px solid #c69a49;outline-offset:3px}
  .places-location-row{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.places-location-row button,.places-photo button{background:white;border:1px solid #decda8;border-radius:11px;color:#795519;padding:10px 13px;cursor:pointer}.places-links{display:flex;gap:9px;flex-wrap:wrap;margin:15px 0}.places-links a{color:#795519;border:1px solid #e3d5b8;padding:8px 11px;border-radius:10px;text-decoration:none;font-size:12px}.places-card details{font-size:12px;margin:12px 0}.places-card details p{font-size:12px;margin:3px 0}.places-card .places-meta{font-size:12px;color:#6c604c}.places-photo{margin:15px 0 0}.places-photo>img{display:block;width:100%;max-height:230px;object-fit:cover;border-radius:12px}.places-authors{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:11px;margin:10px 0}.places-authors span{display:inline-flex;align-items:center;gap:5px}.places-authors a{color:#5e5e5e}.places-authors img{border-radius:50%;object-fit:cover}.places-attribution{font-family:Arial,sans-serif!important;font-style:normal;font-weight:400!important;font-size:14px!important;letter-spacing:normal;white-space:nowrap;color:#5e5e5e!important;margin:16px 0!important}#lpPlacesStatus{font-size:13px;line-height:1.6;color:#6e5937;min-height:22px}.discovery-body button:disabled{opacity:.55;cursor:wait}
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

