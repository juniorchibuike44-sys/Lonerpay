import {createHmac,timingSafeEqual} from 'node:crypto';
import {cleanText,enforceRateLimit,hardenResponse,requireUser} from './_security.js';
const types={hotel:'hotel',restaurant:'restaurant',supermarket:'supermarket'};
const names={hotel:'hotels',restaurant:'restaurants',supermarket:'supermarkets'};
const fields='places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.rating,places.userRatingCount,places.currentOpeningHours,places.internationalPhoneNumber,places.websiteUri,places.photos,places.attributions,places.businessStatus';
const text=(v,n=300)=>cleanText(v,n);
function safeURL(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function googleURL(v){const url=safeURL(v);if(!url)return '';const h=new URL(url).hostname;return h==='google.com'||h.endsWith('.google.com')||h==='maps.app.goo.gl'?url:'';}
function photoURL(v){const url=safeURL(v);if(!url)return '';const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com')||u.hostname==='gstatic.com'||u.hostname.endsWith('.gstatic.com'))?url:'';}
const coordinate=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=max;
function km(a,b){const r=x=>x*Math.PI/180,dlat=r(b.latitude-a.latitude),dlon=r(b.longitude-a.longitude);return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.sin(dlat/2)**2+Math.cos(r(a.latitude))*Math.cos(r(b.latitude))*Math.sin(dlon/2)**2)));}
function sign(value,key){return createHmac('sha256',key).update(value).digest('base64url');}
function ticket(photo,user,key){const payload=Buffer.from(JSON.stringify({name:photo,user,expires:Date.now()+10*60_000})).toString('base64url');return payload+'.'+sign(payload,key);}
function readTicket(raw,user,key){
 if(typeof raw!=='string'||raw.length>5000)throw Error('BAD_TICKET');
 const [payload,signature,...extra]=raw.split('.');const expected=Buffer.from(sign(payload||'',key));const actual=Buffer.from(signature||'');
 if(extra.length||expected.length!==actual.length||!timingSafeEqual(expected,actual))throw Error('BAD_TICKET');
 const d=JSON.parse(Buffer.from(payload,'base64url').toString());
 if(d.user!==user||!Number.isFinite(d.expires)||d.expires<Date.now()||!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(d.name))throw Error('BAD_TICKET');return d.name;
}
function attributions(rows){return (Array.isArray(rows)?rows:[]).slice(0,10).map(a=>({name:text(a.displayName||a.provider,120),uri:safeURL(a.uri||a.providerUri),avatar:photoURL(a.photoUri)})).filter(a=>a.name);}
export default async function handler(req,res){
 hardenResponse(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'places-ip',limit:40,windowMs:10*60_000}))return;
 try{
  const auth=await requireUser(req,res);if(!auth)return;
  const enabled=process.env.PLACES_ENABLED==='true'&&!!process.env.GOOGLE_PLACES_API_KEY;
  if(req.method==='GET')return res.status(200).json({enabled});
  if(!enabled)return res.status(503).json({code:'PLACES_NOT_CONFIGURED',error:'In-app place search is not active yet. You can still search using Google Maps below.'});
  const action=req.body?.action||'search';
  if(!['search','photo'].includes(action))return res.status(400).json({error:'Invalid places action'});
  if(!enforceRateLimit({headers:{'x-forwarded-for':auth.user.id}},res,{key:'places-user-'+action,limit:action==='photo'?24:10,windowMs:10*60_000}))return;
  const key=process.env.GOOGLE_PLACES_API_KEY;
  if(action==='photo'){
   let name;try{name=readTicket(req.body?.ticket,auth.user.id,auth.secretKey);}catch{return res.status(400).json({error:'This photo link expired or is invalid. Search again to refresh it.'});}
   const url=new URL('https://places.googleapis.com/v1/'+name+'/media');url.searchParams.set('maxWidthPx','640');url.searchParams.set('skipHttpRedirect','true');
   const response=await fetch(url,{headers:{'X-Goog-Api-Key':key},cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!response.ok)return res.status(response.status===429?429:502).json({error:'The photo could not be loaded. Please try again later.'});
   const uri=photoURL((await response.json())?.photoUri);if(!uri)return res.status(502).json({error:'This photo is unavailable.'});
   return res.status(200).json({photo_url:uri});
  }
  const category=req.body?.category;if(!Object.hasOwn(types,category))return res.status(400).json({error:'Choose hotels, restaurants or supermarkets.'});
  const area=text(req.body?.area,100),location=req.body?.location;let origin=null,requestBody,path;
  if(location!==undefined&&location!==null){
   if(!coordinate(location.latitude,90)||!coordinate(location.longitude,180))return res.status(400).json({error:'Invalid location. Use your location again or enter a town.'});
   origin={latitude:location.latitude,longitude:location.longitude};path='places:searchNearby';
   requestBody={includedTypes:[types[category]],maxResultCount:8,rankPreference:'DISTANCE',locationRestriction:{circle:{center:origin,radius:5000}},languageCode:'en'};
  }else{
   if(area.length<2)return res.status(400).json({error:'Enter a town or area, or choose Use my location.'});
   path='places:searchText';requestBody={textQuery:names[category]+' in '+area+', Nigeria',includedType:types[category],strictTypeFiltering:true,pageSize:8,languageCode:'en',regionCode:'NG'};
  }
  const response=await fetch('https://places.googleapis.com/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fields},body:JSON.stringify(requestBody),cache:'no-store',signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!response.ok){if(response.status===429){res.setHeader('Retry-After','60');return res.status(429).json({error:'Place search is busy. Please wait before retrying.'});}return res.status(502).json({error:'The places service is unavailable. Please try Google Maps below.'});}
  const data=await response.json();if(data.places!==undefined&&!Array.isArray(data.places))return res.status(502).json({error:'Place results could not be read. Please try again.'});
  const places=(data.places||[]).slice(0,8).map(p=>{
   const id=text(p.id,200),name=text(p.displayName?.text,200),point=coordinate(p.location?.latitude,90)&&coordinate(p.location?.longitude,180)?p.location:null;
   const photo=p.photos?.[0],photoName=photo?.name;
   const maps=googleURL(p.googleMapsUri)||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name)+'&query_place_id='+encodeURIComponent(id);
   const directions=new URL('https://www.google.com/maps/dir/');directions.searchParams.set('api','1');directions.searchParams.set('destination',name);directions.searchParams.set('destination_place_id',id);
   return {id,name,address:text(p.formattedAddress,400),maps_url:maps,directions_url:directions.href,website:safeURL(p.websiteUri),phone:/^\+?[\d ()-]{6,30}$/.test(p.internationalPhoneNumber||'')?p.internationalPhoneNumber:'',rating:Number.isFinite(p.rating)?p.rating:null,rating_count:Number.isInteger(p.userRatingCount)?p.userRatingCount:null,open_now:typeof p.currentOpeningHours?.openNow==='boolean'?p.currentOpeningHours.openNow:null,hours:(p.currentOpeningHours?.weekdayDescriptions||[]).slice(0,7).map(x=>text(x,180)),business_status:text(p.businessStatus,40),distance_km:origin&&point?Math.round(km(origin,point)*10)/10:null,attributions:attributions(p.attributions),photo:typeof photoName==='string'&&/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)?{ticket:ticket(photoName,auth.user.id,auth.secretKey),authors:attributions(photo.authorAttributions),source:googleURL(photo.googleMapsUri)||maps}:null};
  }).filter(p=>p.id&&p.name);
  return res.status(200).json({places,ranking:origin?'distance':'relevance',radius_m:origin?5000:null,expires_in:600});
 }catch{return res.status(503).json({error:'Place search could not finish. Please try again or open Google Maps below.'});}
}
