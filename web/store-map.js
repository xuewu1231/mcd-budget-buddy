import {distanceRows,mapSearchURL} from './store-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createStoreMap({container,getContext,onSelect,request}){
 let revision=0,mapRequest=null,storeSignature='',busy=false;
 const clear=()=>{revision++;mapRequest=null;};
 function updateBusy(){container.querySelectorAll('button').forEach(b=>b.disabled=busy||(b.id==='open-store-map'&&Boolean(mapRequest)));}
 function selected(){const c=getContext();container.querySelectorAll('[data-distance-store]').forEach(b=>{const active=c.selected?.code===b.dataset.distanceStore;b.setAttribute('aria-pressed',String(active));b.querySelector('.store-address').hidden=!active;});}
 function render(){
  const c=getContext(),signature=c.stores.map(s=>s.code).join('|')+'|'+c.city+'|'+c.fulfillment;
  if(signature!==storeSignature){clear();storeSignature=signature;}
  if(!container.childElementCount||signature!==container.dataset.signature){
   container.dataset.signature=signature;const rows=distanceRows(c.stores);
   container.innerHTML=`<div class="store-view-heading"><div><strong>选一家餐厅</strong><p>${c.fulfillment==='delivery'?'按所选地址确认可配送门店':'点选看地址，再生成这顿的搭配'}</p></div><button type="button" id="open-store-map" class="nav-button">地图说明</button></div><div id="embedded-store-map" class="embedded-store-map" hidden aria-label="高德门店地图"></div><p id="store-map-status" class="micro" role="status">可在高德核对门店位置与地址。</p><div class="store-distance-chart" role="list" aria-label="可选门店">${rows.map(s=>`<div class="distance-row" role="listitem"><button type="button" data-distance-store="${esc(s.code)}" aria-pressed="${s.code===c.selected?.code}"><span class="store-number">${s.index+1}</span><span class="distance-row-name"><span>${esc(s.name)}</span><small class="store-address" ${s.code===c.selected?.code?'':'hidden'}>${esc(s.address)}</small><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="4" class="distance-track"/>${s.ratio!==null?`<rect width="${Math.max(0,Math.min(100,s.ratio*100))}" height="8" rx="4" class="distance-fill"/>`:''}</svg></span><strong>${c.fulfillment==='delivery'?'可配送':s.distance===null?'距离未知':s.distance>=1000?(s.distance/1000).toFixed(2)+'km':s.distance+'m'}</strong></button><a href="${esc(mapSearchURL(s,c.fulfillment==='delivery'?'':c.city))}" target="_blank" rel="noopener noreferrer" aria-label="在高德查找${esc(s.name)}">高德定位 ↗</a></div>`).join('')}</div><p class="micro">${c.fulfillment==='delivery'?'不估算门店距离或送达时间。':'距离相对搜索地点，非当前位置或步行路线。'}请核对所选门店地址。</p>`;
   container.querySelectorAll('[data-distance-store]').forEach(b=>b.onclick=()=>onSelect(b.dataset.distanceStore));container.querySelector('#open-store-map').onclick=toggle;
  }
  selected();updateBusy();
 }
 async function toggle(){
  if(mapRequest||busy)return;const status=container.querySelector('#store-map-status'),context={revision};mapRequest=context;updateBusy();
  try{await request('/api/map-config');if(context.revision!==revision)return;status.textContent='当前展示门店接口返回的距离，内嵌地图暂未开放；“高德定位”可查找门店。';}catch{if(context.revision===revision)status.textContent='地图说明暂不可用，仍可选择餐厅或在高德查找门店。';}
  finally{if(mapRequest===context){mapRequest=null;updateBusy();}}
 }
 return {render,reset(){clear();storeSignature='';container.innerHTML='';},setBusy(value){busy=value;updateBusy();}};
}
