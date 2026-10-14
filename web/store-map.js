import {distanceRows,mapSearchURL} from './store-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createStoreMap({container,getContext,onSelect,request}){
 let revision=0,mapLoading=false,storeSignature='';
 const clear=()=>{revision++;};
 function selected(){const context=getContext();container.querySelectorAll('[data-distance-store]').forEach(b=>b.setAttribute('aria-pressed',String(context.selected?.code===b.dataset.distanceStore)));}
 function render(){
  const c=getContext(),signature=c.stores.map(s=>s.code).join('|')+'|'+c.city+'|'+c.fulfillment;if(signature!==storeSignature){clear();storeSignature=signature;}
  if(!container.childElementCount||signature!==container.dataset.signature){
   container.dataset.signature=signature;const rows=distanceRows(c.stores);
   container.innerHTML=`<div class="store-view-heading"><div><strong>门店距离与位置</strong><p>${c.fulfillment==='delivery'?'这些门店可配送到所选地址':'看距离、选门店；点编号与列表联动'}</p></div><button type="button" id="open-store-map" class="nav-button">地图说明</button></div><div id="embedded-store-map" class="embedded-store-map" hidden aria-label="高德门店地图"></div><p id="store-map-status" class="micro" role="status">${c.stores.every(s=>!s.position)?'暂未获取门店坐标，先比较距离；可在高德核对门店位置。':'门店位置请在高德核对，当前展示距离比较。'}</p><div class="store-distance-chart">${rows.map(s=>`<div class="distance-row"><button type="button" data-distance-store="${esc(s.code)}" aria-pressed="${s.code===c.selected?.code}"><span class="store-number">${s.index+1}</span><span class="distance-row-name">${esc(s.name)}<svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="4" class="distance-track"/>${s.ratio!==null?`<rect width="${Math.max(0,Math.min(100,s.ratio*100))}" height="8" rx="4" class="distance-fill"/>`:''}</svg></span><strong>${c.fulfillment==='delivery'?'可配送':s.distance===null?'距离未知':s.distance>=1000?(s.distance/1000).toFixed(2)+'km':s.distance+'m'}</strong></button><a href="${esc(mapSearchURL(s,c.fulfillment==='delivery'?'':c.city))}" target="_blank" rel="noopener noreferrer" aria-label="在高德查找${esc(s.name)}">高德定位 ↗</a></div>`).join('')}</div><p class="micro">${c.fulfillment==='delivery'?'配送资格按所选地址查询，不估算门店距离或送达时间。':'距离来自门店接口，相对搜索地点，非当前位置或步行路线。'}定位时请核对门店名称与地址。</p>`;
   container.querySelectorAll('[data-distance-store]').forEach(b=>b.onclick=()=>onSelect(b.dataset.distanceStore));container.querySelector('#open-store-map').onclick=toggle;
  }selected();
 }
 async function toggle(){
  if(mapLoading)return;const button=container.querySelector('#open-store-map'),status=container.querySelector('#store-map-status');mapLoading=true;button.disabled=true;const rev=revision;
  try{const config=await request('/api/map-config');if(rev!==revision)return;status.textContent=config.configured?'当前可以在高德查找门店，内嵌地图暂未开放。定位时请核对门店名称与地址。':'当前展示门店接口返回的距离。点击“高德定位”可查找门店，内嵌地图暂未开放。';}catch{if(rev===revision)status.textContent='地图配置查询失败，距离图和门店列表仍可用。';}
  finally{mapLoading=false;if(rev===revision)button.disabled=false;}
 }

 return {render,reset(){clear();storeSignature='';container.innerHTML='';},setBusy(value){container.querySelectorAll('button').forEach(b=>b.disabled=value||mapLoading);}};
}
