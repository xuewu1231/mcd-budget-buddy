export function position(lon,lat){
 const number=x=>typeof x==='number'?x:typeof x==='string'&&/^-?\d+(\.\d+)?$/.test(x)?Number(x):NaN;
 const lng=number(lon),latitude=number(lat);return Number.isFinite(lng)&&Number.isFinite(latitude)&&Math.abs(lng)<=180&&Math.abs(latitude)<=90&&(lng!==0||latitude!==0)?{longitude:lng,latitude}:null;
}
export function distance(value){const n=typeof value==='number'?value:typeof value==='string'&&/^\d+(\.\d+)?$/.test(value)?Number(value):NaN;return Number.isFinite(n)&&n>=0?n:null;}
export function storeView(s){return {code:String(s.storeCode),name:String(s.storeName||''),address:String(s.address||''),distance:distance(s.distance),position:position(s.longitude,s.latitude)};}
export function distanceRows(stores){const maximum=Math.max(1,...stores.map(s=>s.distance??0));return stores.map((s,index)=>({...s,index,ratio:s.distance===null||!Number.isFinite(s.distance)?null:s.distance/maximum})).sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity));}
export function mapSearchURL(store,city){const url=new URL('https://uri.amap.com/search');url.search=new URLSearchParams({keyword:store.name,city:String(city||''),view:'map',src:'mcd-budget-buddy',callnative:'0'}).toString();return url.href;}
const branch=(name,city)=>String(name).normalize('NFKC').replace(/麦当劳|McDonald's/ig,'').replace(new RegExp('^'+String(city||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'').replace(/[\s()（）·-]/g,'').replace(/餐厅$|店$/g,'');
export function matchStorePoi(store,pois,city){
 const key=branch(store.name,city);if(!key)return null;
 const exact=pois.filter(p=>branch(p.name,city)===key&&position(p.location?.lng,p.location?.lat));
 return exact.length===1?exact[0]:null;
}
