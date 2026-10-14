import {createStoreMap} from './store-map.js';
import {nutritionMarkup,planNutrition,feeMarkup} from './meal-info.js';
import {createCheckoutUI} from './checkout.js';
import {requireCompatibleBackend,requestJSON,budgetView,comparePlans,icon,foodArt,roundChoices,selectedChoice,priceChart,restoreQuotedPlan,createConnectionMonitor,animateFeedback,setDisclosure,installInteractionFeedback,samePlanContext,quotedPlanUsable,proposalDifference} from './api.js';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n/100).toFixed(2);
const letter=i=>'ABC'[i]||String(i+1);
const state={addresses:[],address:null,stores:[],store:null,plans:[],result:null,busy:false,liveReady:false,revision:0,chosen:null,quotedInput:null,conditionsChanged:false};
const storeMap=createStoreMap({container:$('store-visual'),getContext:()=>({stores:state.stores,selected:state.store,city:$('city').value,fulfillment:$('fulfillment').value}),onSelect:selectStore,request:url=>requestJSON(url)});
let waitTimer, retryAction, editorContext;
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const scrollTo=e=>e.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'start'});
const controls=['fulfillment','load-addresses','delivery-address','need-tableware','city','location','budget','preference','priority','flavor','cup','sugar-free','use-coupons','brief','parse-brief','find-stores','recommend','toggle-conditions','regenerate-plans','restore-conditions','compare-prices','compare-plan','compare-store','activity-to-plan','clear-activity-context'];
installInteractionFeedback();
let checkingConnection = false, actionButton = null;
const connectionMonitor=createConnectionMonitor({probe:()=>requestJSON('/api/status',{timeoutMs:8000}),expectedVersion:'0.9.0',onChange:renderConnection});
function renderConnection(status){
 const kind=status.kind,online=kind==='online';
 if(online){state.serviceOnline=true;state.liveReady=status.liveReady;$('service-banner').hidden=true;$('live-status-label').textContent=status.liveReady?'麦当劳连接已配置':'请先连接麦当劳 MCP';$('connection-status').textContent=status.liveReady?`本地服务已连接 · ${status.authSource==='workbuddy'?'已读取 WorkBuddy 配置':'Token 已配置'}；实际接口将在查询时验证。`:'本地服务已连接，请先配置麦当劳 MCP 后查询。';}
 else if(kind==='checking'){$('connection-status').textContent='正在检查本地服务，请稍候…';$('live-status-label').textContent='正在检查连接…';}
 else{
  const banner=['offline','incompatible','slow'].includes(kind);state.serviceOnline=false;state.liveReady=false;$('service-banner').hidden=!banner;
  $('live-status-label').textContent=kind==='uncertain'?'连接暂未确认，自动重试中':kind==='slow'?'连接检查超时':kind==='incompatible'?'本地服务需要更新':'本地服务离线';
  $('service-banner-title').textContent=kind==='slow'?'连接检查超时，服务状态尚未确认':kind==='incompatible'?'本地服务需要更新':'暂时无法连接本地点餐服务';
  $('service-banner-message').textContent=kind==='slow'?'这次检查没有及时返回，不代表服务已关闭。可以重新检查；你的预算与当前方案仍保留。':kind==='incompatible'?status.message:`请确认本页地址 ${location.origin} 的服务已启动，再点重连。新版启动文件默认使用4326；若自定义了端口，以启动终端显示的网页地址为准。当前页面使用 ${location.port}。`;
  $('connection-status').textContent=status.message;
 }
 $('connection').innerHTML=`${icon('settings')}<span>${kind==='offline'?'连接待恢复':'连接设置'}</span>`;
}
function serviceState(online,configured){if(online){const old=connectionMonitor.getState();connectionMonitor.online({version:old?.version||old?.previous?.version,authSource:old?.authSource||old?.previous?.authSource,liveReady:configured??old?.liveReady??old?.previous?.liveReady??state.liveReady});}else checkConnection();}
async function api(route,body){
 try {await requireCompatibleBackend(()=>connectionMonitor.check());const data=await requestJSON(`/api/${route}`,{body,timeoutMs:route==='recommend'?240000:route==='parse'?8000:60000});serviceState(true,route==='parse'?undefined:true);return data;}
 catch(e){if(e.status>0)serviceState(true,e.code==='NOT_CONFIGURED'?false:undefined);else if(e.code==='OFFLINE')serviceState(false);throw e;}
}
async function checkConnection(manual=false){
 if(checkingConnection)return;checkingConnection=true;
 for(const [id,label]of [['reconnect','重新检查中…'],['check-connection','检查中…']]){const b=$(id);b.disabled=true;b.classList.add('is-loading');b.setAttribute('aria-busy','true');b.querySelector('span').textContent=label;}
 try{const before=state.serviceOnline;const result=await connectionMonitor.check({manual});if(manual&&result.kind==='online'){window.dispatchEvent(new CustomEvent('mcd-toast',{detail:'本地连接正常，可以继续查询。'}));if(!before)feedback('本地连接已恢复，你的条件已保留，可以继续查询。');}}
 finally{checkingConnection=false;for(const [id,label]of [['reconnect','重新连接'],['check-connection','检查连接']]){const b=$(id);b.disabled=false;b.classList.remove('is-loading');b.removeAttribute('aria-busy');b.querySelector('span').textContent=label;}}
}
window.addEventListener('mcd-service-response',e=>serviceState(e.detail.online,e.detail.configured));
$('reconnect').onclick=()=>checkConnection(true);$('check-connection').onclick=()=>checkConnection(true);

function input(){return {fulfillment:$('fulfillment').value,addressId:state.address?.id,needTableware:$('fulfillment').value==='delivery'&&$('need-tableware').checked,mode:'live',city:$('city').value,keyword:$('location').value,budget:$('budget').value,preference:$('preference').value,priority:$('priority').value,flavor:$('flavor').value,cup:$('cup').value,sugarFree:$('sugar-free').checked,useCoupons:$('use-coupons').checked,storeCode:state.store?.code};}
function feedback(text,error=false){const changed=$('feedback').textContent!==text;$('feedback').hidden=!text;$('feedback').textContent=text;$('feedback').classList.toggle('error',error);$('query-retry').hidden=!error||!retryAction;if(text&&changed)animateFeedback($('feedback'),[{opacity:.6,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}]);}
$('query-retry').onclick=()=>{if(!state.busy)retryAction?.();};
function busy(value,text='',button=null,label='处理中…'){
 if(value&&button){actionButton={element:button,html:button.innerHTML};button.innerHTML=`${icon('refresh')}<span>${esc(label)}</span>`;button.classList.add('is-loading');button.setAttribute('aria-busy','true');}
 if(!value&&actionButton){const b=actionButton.element;b.innerHTML=actionButton.html;b.classList.remove('is-loading');b.removeAttribute('aria-busy');actionButton=null;}
 state.busy=value;storeMap.setBusy(value);controls.forEach(id=>$(id).disabled=value);
 document.querySelectorAll('[data-budget],[data-scenario],.store,.plan-card button,.plan-card select,#chosen-plan button').forEach(e=>e.disabled=value);
 $('recommend').disabled=value||!state.store;$('query-retry').disabled=value;
 if($('change-store'))$('change-store').disabled=value;
 if(!value)document.querySelectorAll('[data-copy]').forEach(b=>{const p=state.plans[Number(b.dataset.copy)];b.disabled=!p||!quotedPlanUsable(p,state.quotedInput,input());});
 if(!value&&$('checkout-chosen')){const p=state.plans[state.chosen];$('checkout-chosen').disabled=!p||!quotedPlanUsable(p,state.quotedInput,input());}
 if(!value&&$('copy-chosen')){const chosen=state.plans[state.chosen];$('copy-chosen').disabled=!chosen||!quotedPlanUsable(chosen,state.quotedInput,input());}
 if(!value&&state.conditionsChanged)document.querySelectorAll('.plan-card button,.plan-card select').forEach(e=>e.disabled=true);
 document.querySelector('.results-area').setAttribute('aria-busy',String(value));
 $('query-wait').hidden=!value;clearInterval(waitTimer);
 if(value){
  $('query-retry').hidden=true;$('query-wait-label').textContent=text||'正在查询真实价格';
  $('query-wait-detail').textContent='正在等待真实接口，不用重复点击。';$('query-elapsed').textContent='0 秒';
  const started=Date.now();waitTimer=setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);$('query-elapsed').textContent=`${elapsed} 秒`;if(elapsed>=10)$('query-wait-detail').textContent=text.includes('菜单')?'正在读取套餐详情与完整选配，仍在等待接口返回。':'接口还未返回，可以继续查看页面，无需重复点击。';},1000);
 }
 if(text)feedback(text);scenarioControls();
}
function progress(n){[1,2,3].forEach(i=>{const step=$(`step-${i}`);step.classList.toggle('active',i<=n);step.classList.toggle('complete',i<n);if(i===n)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});}
function compactConditions(value){$('workspace').classList.toggle('compact-conditions',value);$('toggle-conditions').setAttribute('aria-expanded',String(!value));$('toggle-conditions').textContent=value?'展开条件 ↓':'收起条件 ↑';}
$('toggle-conditions').onclick=()=>compactConditions(!$('workspace').classList.contains('compact-conditions'));
function clearPlans(){state.quotedInput=null;state.conditionsChanged=false;$('conditions-notice').hidden=true;$('workspace').classList.remove('has-stale-plans');$('price-details').hidden=true;retryAction=null;$('query-retry').hidden=true;progress(state.store?2:1);compactConditions(false);$('chosen-plan').hidden=true;$('proposal-summary').hidden=true;state.chosen=null;$('plan-comparison').hidden=true;$('store-comparison').hidden=true;$('store-compare-result').textContent='';state.plans=[];state.result=null;state.revision++;$('plans').innerHTML='';$('evidence').hidden=true;$('empty-state').hidden=false;$('selection-summary').hidden=true;if(state.store)$('store-section').hidden=false;}
function resetStores(){storeMap.reset();clearPlans();state.store=null;state.stores=[];$('store-coupons-panel').hidden=true;$('store-coupons-result').textContent='请选择门店后查看已有券。';$('store-section').hidden=true;$('recommend').disabled=true;progress(1);}
function scenarioControls(){const delivery=$('fulfillment').value==='delivery';$('pickup-location').hidden=delivery;$('delivery-setup').hidden=!delivery;$('city').disabled=state.busy||delivery;$('location').disabled=state.busy||delivery;$('delivery-address').disabled=state.busy||!state.addresses.length;$('find-stores').disabled=state.busy||(delivery&&!state.address);$('fulfillment-hint').textContent=delivery?'预算为整单上限，配送费、打包费和餐具费都计入。':'到店场景按门店核价。';if(!state.busy)$('find-stores').innerHTML=delivery?'查询可配送门店':'查找附近门店';}
$('fulfillment').onchange=()=>{resetStores();state.address=null;state.addresses=[];$('delivery-address').innerHTML='<option value="">先读取并选择已有地址</option>';scenarioControls();$('result-title').textContent=$('fulfillment').value==='delivery'?'先选地址，再查配送门店':'选好门店，开始搭配';feedback($('fulfillment').value==='delivery'?'已切换麦乐送，自取报价已清除；先读取并选择配送地址。':'已切换到店场景，请重新选择门店。');};
$('load-addresses').onclick=async()=>{resetStores();state.address=null;state.addresses=[];busy(true,'正在读取已有配送地址…',$('load-addresses'),'读取中…');try{const d=await api('addresses',{});state.addresses=d.addresses;$('delivery-address').innerHTML='<option value="">请选择配送地址</option>'+d.addresses.map((a,i)=>`<option value="${i}">${esc(a.fullAddress)} · ${esc(a.phoneHint)}</option>`).join('');$('address-hint').textContent=d.addresses.length?'请选择地址，再查询可配送门店。':'当前账号暂无配送地址；请在官方点餐渠道添加后再读取。';feedback($('address-hint').textContent);}catch(e){$('address-hint').textContent=e.message;feedback(e.message,true);}finally{busy(false);}};
$('delivery-address').onchange=()=>{resetStores();const value=$('delivery-address').value;state.address=value===''?null:state.addresses[Number(value)];scenarioControls();feedback(state.address?'地址已选择，请查询该地址可配送门店。':'请先选择配送地址。');};
$('need-tableware').onchange=()=>{conditionsUpdated();feedback('餐具选择已变化，请重新核价，相关费用计入预算。');};
scenarioControls();
$('load-points').onclick=async()=>{const b=$('load-points');b.disabled=true;b.textContent='查询中…';try{const d=await api('points',{});$('points-result').innerHTML=`<div class="point-values">${[['可用积分',d.available],['本月即将到期',d.expiringThisMonth],['下月即将到期',d.expiringNextMonth]].map(([label,value])=>`<div><small>${label}</small><strong>${value===null?'未返回':esc(value)}</strong></div>`).join('')}</div><p class="micro">官方账号查询 · ${esc(new Date(d.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}。接口未提供具体到期日；积分不能直接抵算这顿现金价格。</p>`;}catch(e){$('points-result').textContent=e.message;}finally{b.disabled=false;b.textContent='更新积分';}};
function rememberPreferences(){try{localStorage.setItem('mcd-meal-preferences',JSON.stringify({budget:$('budget').value,preference:$('preference').value,priority:$('priority').value,flavor:$('flavor').value,cup:$('cup').value,sugarFree:$('sugar-free').checked,useCoupons:$('use-coupons').checked}));}catch{}}
function budgetUI(){$('budget-caption').textContent=`¥${$('budget').value}`;document.querySelectorAll('[data-budget]').forEach(b=>{const selected=b.dataset.budget===$('budget').value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});rememberPreferences();scenarioUI();preferenceCaption();}
function preferenceCaption(){$('preference-caption').textContent=`${{medium:'中杯优先',large:'大杯优先',any:'杯型不限'}[$('cup').value]} · ${$('priority').value==='save'?'省预算':'换着吃'}${$('flavor').value==='any'?'':$('flavor').value==='mild'?' · 尽量少辣':' · 辣味倾向'}`;}
function conditionsUpdated(){
 if(!state.plans.length||!state.quotedInput){clearPlans();return;}
 state.conditionsChanged=!samePlanContext(state.quotedInput,input());
 $('conditions-notice').hidden=!state.conditionsChanged;$('workspace').classList.toggle('has-stale-plans',state.conditionsChanged);
 $('conditions-notice-text').textContent=`当前预算 ¥${$('budget').value||'待填写'}；下面保留上次按 ¥${state.quotedInput.budget} 得到的搭配。新条件未核算，不能直接选用或复制。`;
 $('proposal-summary').textContent=state.conditionsChanged?`上次按 ¥${state.quotedInput.budget} 预算得到的 ${state.plans.length} 套搭配`:`保留上次查询的 ${state.plans.length} 套搭配 · 核算时间见每套依据`;
 $('store-section').hidden=true;$('empty-state').hidden=true;renderSummary();renderPlans();
}
function matchingContext(){if(!state.quotedInput||!state.plans.length)return false;if(samePlanContext(state.quotedInput,input()))return true;conditionsUpdated();feedback('条件已修改，请先按新条件生成方案。');return false;}
$('price-details').addEventListener('toggle',()=>{$('price-details').querySelector('summary > span').textContent=$('price-details').open?'收起价格对比图':'展开价格对比图';});
$('regenerate-plans').onclick=()=>$('recommend').click();
$('restore-conditions').onclick=()=>{if(!state.quotedInput)return;for(const key of ['budget','preference','priority','flavor','cup'])$(key).value=state.quotedInput[key];$('sugar-free').checked=state.quotedInput.sugarFree;$('use-coupons').checked=state.quotedInput.useCoupons===true;budgetUI();conditionsUpdated();feedback('已恢复上次条件与选择；价格仍为原查询时间的核价记录。');};
const scenarios={lunch:{budget:'30',preference:'burger',priority:'save'},snack:{budget:'20',preference:'chicken',priority:'save'},breakfast:{budget:'25',preference:'breakfast',priority:'variety'}};
function scenarioUI(){document.querySelectorAll('[data-scenario]').forEach(b=>{const v=scenarios[b.dataset.scenario],selected=Object.entries(v).every(([key,value])=>$(key).value===value)&&$('flavor').value==='any';b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{for(const[key,value]of Object.entries(scenarios[b.dataset.scenario]))$(key).value=value;$('flavor').value='any';budgetUI();conditionsUpdated();scenarioUI();feedback('预算与主食偏好已填好，可以继续调整，再选门店。');});
function syncNavigationAccessibility(){const closed=window.matchMedia('(max-width:900px)').matches&&!document.body.classList.contains('nav-open');$('app-sidebar').inert=closed;if(closed)$('app-sidebar').setAttribute('aria-hidden','true');else $('app-sidebar').removeAttribute('aria-hidden');}
function closeNavigation(refocus=true){document.body.classList.remove('nav-open');syncNavigationAccessibility();$('nav-backdrop').hidden=true;$('nav-toggle').setAttribute('aria-expanded','false');if(refocus)$('nav-toggle').focus({preventScroll:true});}
$('nav-toggle').onclick=()=>{document.body.classList.add('nav-open');syncNavigationAccessibility();$('nav-backdrop').hidden=false;$('nav-toggle').setAttribute('aria-expanded','true');void $('app-sidebar').offsetWidth;$('nav-close').focus({preventScroll:true});};
$('nav-close').onclick=()=>closeNavigation();$('nav-backdrop').onclick=()=>closeNavigation();
document.querySelectorAll('.page-nav a,.brand').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();const id=a.getAttribute('href').slice(1);if(id==='radar')setDisclosure($('radar-fold'),true);closeNavigation(false);document.querySelectorAll('.page-nav a').forEach(link=>{const active=link.getAttribute('href')===`#${id}`;link.classList.toggle('current',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});history.replaceState(null,'',`#${id}`);scrollTo($(id==='radar'?'radar-fold':id));animateFeedback($(id==='radar'?'radar-fold':'result-title'),[{opacity:.55},{opacity:1}],{duration:190});}));
document.addEventListener('keydown',e=>{if(!document.body.classList.contains('nav-open'))return;if(e.key==='Escape'){e.preventDefault();closeNavigation();}if(e.key==='Tab'){const nodes=[...$('app-sidebar').querySelectorAll('a,button')].filter(x=>x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
window.matchMedia('(max-width:900px)').addEventListener('change',e=>{if(!e.matches)closeNavigation(false);syncNavigationAccessibility();});
syncNavigationAccessibility();
$('toolbar-settings').onclick=()=>$('connection').click();
$('connection').onclick=()=>{closeNavigation(false);$('settings').showModal();document.body.classList.add('dialog-open');};
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.body.classList.remove('dialog-open');}));
$('download-skill').onclick=async()=>{try{let r;try{r=await fetch('/api/skill');}catch{serviceState(false);throw new Error('服务离线，启动本地点餐服务后再下载 Skill。');}if(!r.ok)throw new Error('Skill 读取失败');const blob=new Blob([await r.text()],{type:'text/markdown;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='SKILL.md';a.click();URL.revokeObjectURL(u);feedback('已下载 Skill 入口文件。完整使用请从源代码仓库下载项目，保留 shared 和 scripts。');}catch(e){feedback(e.message,true);}};
document.querySelectorAll('[data-budget]').forEach(b=>b.onclick=()=>{$('budget').value=b.dataset.budget;budgetUI();conditionsUpdated();feedback('预算已更新，可按新条件重新生成。');});
['budget','preference','priority','flavor','cup','sugar-free','use-coupons'].forEach(id=>$(id).addEventListener('change',()=>{budgetUI();conditionsUpdated();progress(state.store?2:1);feedback('条件已更新，可按新条件重新生成。');}));
$('budget').addEventListener('input',()=>{budgetUI();conditionsUpdated();});
['city','location'].forEach(id=>$(id).addEventListener('change',()=>{resetStores();feedback('地点已更新，请重新查询门店。');}));
$('parse-brief').onclick=async()=>{retryAction=()=>$('parse-brief').click();busy(true,'正在提取预算与偏好…',$('parse-brief'),'提取中…');try{const d=await api('parse',{text:$('brief').value});if(d.budget)$('budget').value=d.budget;if(d.preference)$('preference').value=d.preference;if(typeof d.sugarFree==='boolean')$('sugar-free').checked=d.sugarFree;budgetUI();conditionsUpdated();feedback(Object.keys(d).length===1?'没有识别到支持的关键词，请直接修改条件。':'已提取支持的关键词，请核对下方条件。');}catch(e){feedback(e.message,true);}finally{busy(false);}};
function selectStore(code){if(state.busy)return;const store=state.stores.find(s=>s.code===code);if(!store)return;state.store=store;clearPlans();$('store-coupons-result').textContent=`已选择 ${store.name}。点击查询，确认当前门店有哪些已有券。`;renderStores();$('recommend').disabled=false;feedback(`已选择 ${store.name}，可以开始生成方案。`);}
function renderStores(){$('store-coupons-panel').hidden=!state.store;const delivery=$('fulfillment').value==='delivery';$('store-section').querySelector('.section-line > span').textContent=delivery?'点击选择 · 当前地址可配送':'点击选择 · 到店场景';$('stores').innerHTML=state.stores.map((s,i)=>`<button class="store ${state.store?.code===s.code?'selected':''}" data-store="${i}" aria-pressed="${state.store?.code===s.code}"><span class="pin store-number">${i+1}</span><span><strong>${esc(s.name)}</strong><small>${esc(s.address)}</small></span><span class="distance">${delivery?'可配送':Number.isFinite(s.distance)?esc(s.distance)+'m':'距离未知'} ${icon(state.store?.code===s.code?'check':'arrow')}</span></button>`).join('');document.querySelectorAll('[data-store]').forEach(b=>b.onclick=()=>selectStore(state.stores[Number(b.dataset.store)].code));storeMap.render();}
$('search-form').onsubmit=async e=>{e.preventDefault();resetStores();retryAction=()=>$('search-form').requestSubmit();busy(true,'正在查询附近门店…',$('find-stores'),'查找中…');$('empty-state').hidden=true;$('store-section').hidden=false;$('stores').innerHTML=Array.from({length:3},()=>'<div class="store-skeleton result-skeleton" aria-hidden="true"></div>').join('');try{const d=await api('stores',input());state.stores=d.stores;renderStores();$('store-section').hidden=false;progress(2);feedback(d.stores.length?'请先选择一家门店。':'当前没有返回可用门店，请换一个地点。');$('result-title').textContent='选择这顿的门店';scrollTo(document.querySelector('.results-area'));}catch(err){$('stores').innerHTML='';feedback(err.message,true);}finally{busy(false);}};
function renderSummary(){const context=state.conditionsChanged?state.quotedInput:input();$('selection-summary').hidden=false;$('selection-summary').innerHTML=`<div><strong>${icon('location')} ${esc(state.store.name)}</strong><small>一人份 · ${context.fulfillment==='delivery'?'麦乐送（含配送等费用）':'到店自取'} · ${state.conditionsChanged?'上次预算':'预算'} ¥${esc(context.budget)}${context.sugarFree?' · 明确无糖饮品':''}</small></div>${context.fulfillment==='delivery'&&state.address?`<p class="delivery-address-summary">配送到：${esc(state.address.fullAddress)} · ${esc(state.address.phoneHint)}</p>`:''}<div class="summary-actions"><button id="adjust-conditions" class="conditions-toggle">调整条件</button><button id="change-store">换门店 ↗</button></div>`;$('adjust-conditions').onclick=()=>{compactConditions(false);scrollTo(document.querySelector('.controls'));$('budget').focus({preventScroll:true});};$('change-store').onclick=()=>{clearPlans();$('store-section').hidden=false;renderStores();progress(2);};}
function selectedItems(p){return p.detail.rounds.map(r=>{const code=p.changes?.[String(r.id)]||p.roundList.find(x=>x.round===String(r.id))?.comboItemList[0]?.code;return r.choices.find(x=>String(x.code)===String(code))?.name||'选配未确认';});}
function budgetMarkup(p){
 if(state.conditionsChanged)return `<div class="budget-pending">上次按 ¥${esc(state.quotedInput.budget)} 预算核算；新条件尚未核算。</div>`;
 const b=budgetView(p.priceFen,Math.round(Number($('budget').value)*100),p.dirty);
 if(b.kind==='pending')return '<div class="budget-pending"><span>↻</span> 搭配已修改，重新核算后显示预算占用。</div>';
 if(b.kind==='unknown')return '<div class="budget-pending">金额未确认，暂不显示预算占用。</div>';
 return `<div class="budget-label"><span>占预算 <strong>${b.percent}%</strong></span><span class="${b.kind==='over'?'over':''}">${b.kind==='over'?'超出':'还余'} <strong>¥${money(Math.abs(b.remainingFen))}</strong></span></div><progress class="budget-meter ${b.kind==='over'?'over':''}" max="100" value="${b.fill}" aria-label="预算使用${b.percent}%"></progress><p class="budget-note">${b.kind==='over'?'超出预算，调整后再核算。':'预算余量不代表优惠金额。'}</p>`;
}
function evidenceMarkup(p){return p.dirty?'<p class="pending">当前搭配尚未核算；上一份报价不能作为依据。</p>':`<p>${esc(p.evidence)}</p><p>核算时间：${esc(new Date(p.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</p><p>餐品插画仅为示意。菜单记录不保证实时可售；本工具未下单。</p>`;}
function renderComparison(){
 if(state.conditionsChanged){$('plan-comparison').hidden=true;$('price-details').hidden=true;return;}
 const c=comparePlans(state.plans,Math.round(Number($('budget').value)*100));
 const verifiedOver=c.kind==='unavailable'&&state.plans.length>=2&&state.plans.every(p=>!p.dirty&&Number.isSafeInteger(p.priceFen)&&p.priceFen>=0);const box=$('plan-comparison');box.hidden=c.kind==='unavailable'&&!verifiedOver;box.classList.toggle('pending-comparison',c.kind==='pending');$('price-details').hidden=box.hidden;
 $('comparison-caption').textContent=c.kind==='pending'?'待核算':c.kind==='same'?'这些搭配同价':c.kind==='different'?`方案 ${letter(c.cheaperIndex)} 较省 · 最大价差 ¥${money(c.differenceFen)}`:'有搭配超出预算';
 if(c.kind==='pending')box.innerHTML=`<div class="comparison-heading">${icon('refresh')}<div><strong>搭配正在调整</strong><p>重新核算后，再比较方案的金额。</p></div></div>`;
 if(c.kind==='same'||c.kind==='different'||verifiedOver){
  const title=verifiedOver?'有搭配超出预算，调整后再选':c.kind==='same'?'这些搭配同价，按口味选':`本次更省预算：方案 ${letter(c.cheaperIndex)} · 比较高的一套少 ¥${money(c.differenceFen)}`;
  box.innerHTML=`<div class="comparison-heading">${icon('compare')}<div><strong>${title}</strong><p>同一门店 · 不同搭配 · 当前核价</p></div></div>${priceChart(state.plans.map((p,i)=>({label:`方案 ${letter(i)}`,priceFen:p.priceFen,dirty:p.dirty})),Math.round(Number($('budget').value)*100),'几套搭配，价格一眼比')} `;
 }
}
const checkoutUI=createCheckoutUI({api});
function startCheckout(i){const p=state.plans[i];if(state.busy||!quotedPlanUsable(p,state.quotedInput,input()))return;checkoutUI.open({...input(),code:p.id,changes:Object.fromEntries(p.roundList.map(r=>[r.round,r.comboItemList[0].code])),couponRef:p.coupon?.ref},p.priceFen);}
function renderChosen(){
 const i=state.chosen,p=state.plans[i];
 $('chosen-plan').hidden=!p;if(!p)return;
 $('chosen-plan').innerHTML=`<div>${icon('check')}<span><small>我的选择 · 方案 ${letter(i)}</small><strong>${esc(p.name)}</strong></span></div><strong>${state.conditionsChanged?'上次 ':''}${p.dirty?'待核算':`¥${money(p.priceFen)}`}</strong><button id="checkout-chosen" ${!quotedPlanUsable(p,state.quotedInput,input())?'disabled':''}>继续下单 →</button><button id="copy-chosen" ${!quotedPlanUsable(p,state.quotedInput,input())?'disabled':''}>${state.conditionsChanged?'先按新条件生成':p.dirty?'先重新核算':'复制用餐清单'}</button><p class="chosen-meal-list">${selectedItems(p).map(esc).join(' ＋ ')}<small>尚未下单 · 下一步确认门店、搭配与${p.fulfillment==='delivery'?'配送地址':'取餐方式'}</small></p>`;
 $('copy-chosen').onclick=()=>copyPlan(i);$('checkout-chosen').onclick=()=>startCheckout(i);
}
function choosePlan(i){
 if(!matchingContext())return;
 const p=state.plans[i];state.chosen=i;
 document.querySelectorAll('[data-choose]').forEach(b=>{const chosen=Number(b.dataset.choose)===i;b.setAttribute('aria-pressed',String(chosen));b.innerHTML=chosen?`${icon('check')}已选这套`:'选这套';b.closest('.plan-card').classList.toggle('is-chosen',chosen);});
 $('compare-plan').value=String(i);$('store-compare-result').textContent='';renderChosen();
 window.dispatchEvent(new CustomEvent('mcd-toast',{detail:`已选方案 ${letter(i)}，可以继续调整搭配。`}));
}
async function copyPlan(i){
 const p=state.plans[i];if(state.busy||!quotedPlanUsable(p,state.quotedInput,input()))return;
 const text=`【实时核价，未下单】\n${state.store.name}\n${p.name}\n${p.items.join(' + ')}\n${p.fulfillment==='delivery'?'麦乐送 · 含配送等费用':'到店场景'}\n¥${money(p.priceFen)}\n核算时间：${new Date(p.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}\n${p.evidence}`;
 try{await navigator.clipboard.writeText(text);window.dispatchEvent(new CustomEvent('mcd-toast',{detail:'方案已复制，包含选配和核算时间。'}));}
 catch{retryAction=null;feedback('浏览器暂不支持复制，请手动选择餐品内容。',true);}
}
function markChoice(i,round,code){
 const p=state.plans[i];if(String(selectedChoice(p,round)?.code)===String(code))return false;
 p.changes={...(p.changes||{}),[String(round.id)]:String(code)};p.dirty=true;
 renderPlans();feedback('搭配已修改，请重新核算；旧价格已隐藏。');return true;
}
function openRound(i,id){
 if(state.busy||!matchingContext())return;
 const p=state.plans[i],round=p.detail.rounds.find(r=>String(r.id)===id),options=roundChoices(round,$('sugar-free').checked);
 editorContext={i,round,code:String(selectedChoice(p,round)?.code)};
 $('meal-editor-title').textContent=round.name||'调整这一项';$('meal-editor-context').textContent=`方案 ${letter(i)} · ${p.name}`;
 $('meal-editor-hint').textContent=options.length>1?'点选你想换的餐品，再确认核算。图示仅供辨认。':'这是套餐里的固定搭配，当前接口没有其他可选项。';
 $('meal-editor-options').innerHTML=`<legend class="sr-only">${esc(round.name)}</legend>${options.map(x=>`<label class="meal-option" data-choice-name="${esc(x.name)}"><input type="radio" name="meal-choice" value="${esc(x.code)}" ${String(x.code)===editorContext.code?'checked':''}>${foodArt(x.name)}<strong>${esc(x.name)}</strong><small class="food-calorie">${x.nutrition?.kcal===undefined?'热量暂无数据':`约 ${esc(x.nutrition.kcal)} kcal`}</small><span class="option-tick" aria-hidden="true">${icon('check')}</span></label>`).join('')}`;
 $('meal-editor-search').value='';$('meal-editor-search-row').hidden=options.length<6;filterMealOptions();updateMealPreview();
 $('meal-editor').showModal();document.body.classList.add('dialog-open');
}
function updateMealPreview(){
 if(!editorContext)return;const selected=$('meal-editor-options').querySelector('input:checked');
 const option=editorContext.round.choices.find(x=>String(x.code)===selected?.value),current=selectedChoice(state.plans[editorContext.i],editorContext.round);
 const changed=selected?.value!==editorContext.code;
 $('meal-editor-preview').textContent=changed?`${current.name} → ${option?.name||'选配未确认'}`:`当前搭配：${current.name}`;
 $('apply-meal-choice').textContent=changed?'确认更换并核算':'保留当前搭配';
}
function filterMealOptions(){
 const query=$('meal-editor-search').value.normalize('NFKC').trim().toLowerCase();let count=0;
 const labels=$('meal-editor-options').querySelectorAll('.meal-option');labels.forEach(label=>{label.hidden=!label.dataset.choiceName.normalize('NFKC').toLowerCase().includes(query);if(!label.hidden)count++;});
 $('meal-editor-count').textContent=`${count} / ${labels.length} 个选项`;$('meal-editor-empty').hidden=count!==0;$('apply-meal-choice').disabled=count===0;
}
$('meal-editor-search').oninput=filterMealOptions;
$('meal-editor-options').onchange=updateMealPreview;
document.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse'||reducedMotion())return;
 const card=e.target.closest('.meal-component,.meal-option');if(!card)return;card.classList.remove('food-playing');void card.offsetWidth;card.classList.add('food-playing');setTimeout(()=>card.classList.remove('food-playing'),1400);
});
$('apply-meal-choice').onclick=()=>{
 const context=editorContext,checked=$('meal-editor-options').querySelector('input:checked');if(!context||!checked)return;
 $('meal-editor').close();const changed=markChoice(context.i,context.round,checked.value);
 if(changed)recalc(context.i);else window.dispatchEvent(new CustomEvent('mcd-toast',{detail:'保持当前搭配，无需重复核算。'}));
};
function renderPlans(arrive=false){
 $('plans').innerHTML=`<div class="plan-grid">${state.plans.map((p,i)=>{
 const dirty=p.dirty===true,chosen=state.chosen===i,strict=state.conditionsChanged?state.quotedInput.sugarFree:$('sugar-free').checked;
 const fields=p.detail.rounds.filter(r=>roundChoices(r,strict).length>1).map(r=>{
 const selected=selectedChoice(p,r),options=roundChoices(r,strict);
 return `<div class="round-field"><label for="option-${i}-${esc(r.id)}">${esc(r.name)}</label><select id="option-${i}-${esc(r.id)}" data-plan="${i}" data-round="${esc(r.id)}">${options.map(x=>`<option value="${esc(x.code)}" ${String(x.code)===String(selected?.code)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>`;
 }).join('');
 const tray=p.detail.rounds.map(r=>{const selected=selectedChoice(p,r),count=roundChoices(r,strict).length;return `<button class="meal-component" data-edit-plan="${i}" data-edit-round="${esc(r.id)}" aria-label="${esc(r.name)}：${esc(selected?.name)}，${count>1?'点击换搭配':'查看固定搭配'}"><span class="component-round">${esc(r.name||'套餐子项')}</span>${foodArt(selected?.name)}<strong>${esc(selected?.name||'选配未确认')}</strong><small class="food-calorie">${selected?.nutrition?.kcal===undefined?'热量暂无数据':`约 ${esc(selected.nutrition.kcal)} kcal`}</small><span class="component-action">${count>1?'换一换':'固定搭配'} ${icon(count>1?'arrow':'check')}</span></button>`;}).join('');
 return `<article class="plan-card ${dirty?'is-pending':''} ${chosen?'is-chosen':''}" aria-label="方案 ${letter(i)}：${esc(p.name)}"><div class="meal-plan-heading"><span class="plan-letter">${letter(i)}</span><div><small>${i===0&&!p.edited?'优先推荐':p.edited?'按你调整':'备选搭配'} · ${state.conditionsChanged?'上次核价':dirty?'选配待核算':'已核价'}</small><h3>${esc(p.name)}</h3></div><button data-choose="${i}" aria-pressed="${chosen}">${chosen?`${icon('check')}已选这套`:'选这套'}</button></div><div class="plan-body"><p class="proposal-difference">${esc(proposalDifference({...p,items:selectedItems(p)},i===0?null:{...state.plans[0],items:selectedItems(state.plans[0])}))}</p>${p.reason?`<p class="proposal-reason">${esc(p.reason)}</p>`:''}${p.notes?.length?`<p class="proposal-notes">${p.notes.map(esc).join('；')}</p>`:''}<p class="tray-hint">${icon('meal')} ${state.conditionsChanged?'上次搭配，仅供参考':'点击餐品换搭配'} <span>原创示意插画</span></p><div class="meal-tray">${tray}</div><p class="food-list sr-only">${selectedItems(p).map(esc).join(' ＋ ')}</p><div class="price-line"><strong class="${dirty?'pending':''}">${dirty?'待核算':`<small>¥</small>${money(p.priceFen)}`}</strong><span>${state.conditionsChanged?'上次核价 · 新条件未核算':dirty?'新搭配还没有报价':'整套价格 · 按选配提交核算'}</span></div>${!dirty?feeMarkup(p.fees,p.fulfillment):''}<div class="budget-state">${budgetMarkup(p)}</div>${!dirty?couponMarkup(p):''}${nutritionMarkup(planNutrition(p),p.nutritionObservedAt)}${dirty&&restoreQuotedPlan(p)?`<button class="restore-choice" data-restore="${i}">${icon("refresh")}撤销修改，恢复上次搭配</button>`:""}${fields?`<details class="all-rounds"><summary>展开全部选配</summary>${fields}</details>`:''}<div class="plan-actions"><button class="recalc" data-recalc="${i}">${icon('refresh')}${dirty?'核算新搭配':'更新价格'}</button><button data-copy="${i}" ${dirty||!p.withinBudget?'disabled':''}>复制方案</button></div><details><summary>查看核算依据</summary><div class="calculation-evidence">${evidenceMarkup(p)}</div></details></div></article>`;
 }).join('')}</div>`;
 renderComparison();renderStoreComparison();renderChosen();document.querySelectorAll('.plan-card button,.plan-card select').forEach(e=>{if(state.conditionsChanged)e.disabled=true;});if(arrive)document.querySelectorAll('.plan-card').forEach((card,i)=>animateFeedback(card,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,delay:i*35}));
 document.querySelectorAll('[data-round]').forEach(s=>s.onchange=()=>{
  const i=Number(s.dataset.plan),round=state.plans[i].detail.rounds.find(r=>String(r.id)===s.dataset.round);
  const id=s.id;markChoice(i,round,s.value);const replacement=$(id);if(replacement){replacement.closest('details').open=true;replacement.focus({preventScroll:true});}
 });
 document.querySelectorAll('[data-edit-round]').forEach(b=>b.onclick=()=>openRound(Number(b.dataset.editPlan),b.dataset.editRound));
 document.querySelectorAll('[data-choose]').forEach(b=>b.onclick=()=>choosePlan(Number(b.dataset.choose)));
 document.querySelectorAll('[data-recalc]').forEach(b=>b.onclick=()=>recalc(Number(b.dataset.recalc)));
 document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyPlan(Number(b.dataset.copy)));
 document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.restore),restored=restoreQuotedPlan(state.plans[i]);if(!restored||state.busy)return;state.plans[i]=restored;renderPlans();feedback('已恢复上次核算的搭配与报价，查询时间见核算依据；也可以更新价格。');document.querySelector(`[data-recalc="${i}"]`)?.focus({preventScroll:true});});
}
function couponMarkup(p){return p.coupon?`<div class="applied-coupon"><small>按这张已有券提交核价</small><strong>${esc(p.coupon.name)}</strong>${Number.isSafeInteger(p.coupon.baselinePriceFen)?`<p>同选配无券 ¥${money(p.coupon.baselinePriceFen)} → 用券核价 ¥${money(p.priceFen)} · 少 ¥${money(p.coupon.differenceFen)}</p>`:''}<p class="micro">${esc(p.coupon.evidence)}</p></div>`:p.couponIssue?`<p class="coupon-issue">${esc(p.couponIssue.name)}：${esc(p.couponIssue.reason)}</p>`:'';}
$('use-coupons').onchange=()=>{conditionsUpdated();feedback('用券选择已变化，请重新生成或核价；原报价不能直接下单。');};
$('load-store-coupons').onclick=async()=>{if(!state.store||state.busy)return;const selected=state.store.code,b=$('load-store-coupons');b.disabled=true;b.textContent='查询中…';try{const d=await api('coupons',input());if(state.store?.code!==selected)return;const names=[...new Set(d.coupons.map(c=>c.name))];$('store-coupons-result').innerHTML=`<p><strong>卡包总数：${d.ownedTotal===null?'未确认':d.ownedTotal} · 当前门店可用：${d.count}张</strong></p>${d.accountError?`<p>${esc(d.accountError)}</p>`:''}${d.count===0?'<p>这家店当前没有返回可用的已有券。仍按无券实价找预算内搭配；可在官方 App 查看或领券后回来更新。</p>':`<ul>${d.coupons.map(c=>`<li><strong>${esc(c.name)}</strong> · 适用餐品：${esc(c.product.name)}</li>`).join('')}</ul><p>门店可用不等于适用每个套餐，还要匹配餐品并实际算价。只在创建订单时才可能消耗券。</p>`}${d.unsupported.map(c=>`<p>${esc(c.name)}：${esc(c.reason)}</p>`).join('')}<p class="micro">本次不领券 · 查询（北京时间）：${esc(new Date(d.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</p>`;}catch(e){$('store-coupons-result').textContent=e.message;}finally{b.disabled=false;b.textContent='更新已有券';}};
function renderEvidence(){const r=state.result;$('evidence').hidden=false;$('evidence').innerHTML=`<p><strong>本次检查：${r.checked} 个候选完成实时算价${r.failed?`，${r.failed} 个未能确认`:''}。</strong></p>${r.couponError?`<p class="error">${esc(r.couponError)}</p>`:''}<p>${r.couponCount===null?'券数据结构未确认':`查询返回 ${r.couponCount} 张券`}  · ${state.quotedInput?.useCoupons?'已尝试匹配已有券，只选择核价更低的方案':'本次未选择用券'}</p><p>${esc(r.scope)}</p>`;}
$('recommend').onclick=async()=>{if(!state.store||!$('search-form').reportValidity())return;const submitted=input();clearPlans();$('store-section').hidden=true;renderSummary();retryAction=()=>$('recommend').click();$('empty-state').hidden=true;$('plans').innerHTML='<div class="plan-grid result-skeleton" aria-hidden="true"><div class="plan-skeleton"></div><div class="plan-skeleton"></div><div class="plan-skeleton"></div></div>';busy(true,'正在查询菜单与选配，并核算候选方案…',$('recommend'),'正在搭配…');try{const r=await api('recommend',input());state.result=r;state.plans=r.plans;state.quotedInput=submitted;$('store-section').hidden=true;$('empty-state').hidden=true;renderSummary();progress(3);$('result-title').textContent='为这顿，选个合适的';if(r.plans.length){$('proposal-summary').hidden=false;$('proposal-summary').textContent=`找到 ${r.plans.length} 套预算内搭配 · ${$('priority').value==='save'?'优先贴合口味，再按价格排序':'优先贴合口味，再给出不同搭配'}${r.plans.length<3?'；当前已核算的不同选择不足三套':''}`;renderPlans(true);compactConditions(true);if(window.matchMedia('(max-width:640px)').matches)scrollTo(document.querySelector('.results-area'));$('result-title').focus({preventScroll:true});feedback(`查询完成，点击餐品可以换搭配。`);}else{$('plans').innerHTML=`<div class="no-solution"><h3>这次检查，没找到预算内方案。</h3><p>${r.closest?`已核算候选中，较低金额为 ¥${money(r.closest.priceFen)}${r.fulfillment==='delivery'?'（整单金额，含配送等费用）':''}，超过你的预算。`:'候选缺少符合条件的选配或未能成功核算。'}</p><p>不代表全店无解。你可以调整预算或餐品偏好，再试一次。</p>${r.closest?'<button id="raise-budget" class="primary">按这个金额调整预算 →</button>':''}</div>`;if(r.closest)$('raise-budget').onclick=()=>{$('budget').value=money(r.closest.priceFen);budgetUI();clearPlans();$('store-section').hidden=false;renderStores();feedback('预算已更新，请重新生成。');};feedback('没有凑出不符合要求的推荐。');}renderEvidence();}catch(e){$('plans').innerHTML='';feedback(e.message,true);}finally{busy(false);}};
async function recalc(i){if(!matchingContext())return;const old=state.plans[i];retryAction=()=>recalc(i);old.dirty=true;renderPlans();busy(true,'选配已更新，正在重新核算…',document.querySelector(`[data-recalc="${i}"]`),'核算中…');try{const changes=Object.fromEntries(old.roundList.map(r=>[r.round,r.comboItemList[0].code]));Object.assign(changes,old.changes||{});const d=await api('recalculate',{...input(),code:old.id,changes,couponRef:old.coupon?.ref});state.plans[i]={...d.plan,name:old.name};renderPlans();feedback(d.plan.withinBudget?'重新核算完成。':'新选配超过预算，已标明，不能作为预算内方案。');}catch(e){renderPlans();feedback(`重新核算失败：${e.message.replace(/[。！]+$/,'')}。原价格不能用于新选配。`,true);}finally{busy(false);document.querySelector(`[data-recalc="${i}"]`)?.focus({preventScroll:true});}}
function renderStoreComparison(){
 const other=state.stores.filter(s=>s.code!==state.store?.code);$('store-comparison').hidden=state.conditionsChanged||!state.plans.length||!other.length;
 const selected=$('compare-plan').value;$('compare-plan').innerHTML=state.plans.map((p,i)=>`<option value="${i}" ${selected===String(i)?'selected':''}>方案 ${letter(i)} · ${esc(p.name)}${p.dirty?'（待核算）':''}</option>`).join('');
 const store=$('compare-store').value;$('compare-store').innerHTML=other.map(s=>`<option value="${esc(s.code)}" ${store===s.code?'selected':''}>${esc(s.name)}</option>`).join('');
 $('store-compare-result').textContent='';
}
$('compare-plan').onchange=()=>{$('store-compare-result').textContent='';};$('compare-store').onchange=()=>{$('store-compare-result').textContent='';};
$('compare-prices').onclick=async()=>{
 if(!matchingContext())return;
 const p=state.plans[Number($('compare-plan').value)],other=state.stores.find(s=>s.code===$('compare-store').value);
 if(!p||!other)return;if(p.dirty){$('store-compare-result').textContent='先重新核算这套选配，再做同款比价。';return;}
 retryAction=()=>$('compare-prices').click();busy(true,'正在核算两家门店的同款搭配…',$('compare-prices'),'核价中…');$('store-compare-result').textContent='正在分别核算两家门店的同款搭配…';
 try{const r=await api('compare',{...input(),otherStoreCode:other.code,code:p.id,roundList:p.roundList});$('store-compare-result').innerHTML=`<div class="store-price-grid"><div><small>${esc(state.store.name)}</small><strong>¥${money(r.first.priceFen)}</strong><small>${esc(r.first.coupon||'未使用独立券')}</small></div><div><small>${esc(other.name)}</small><strong>¥${money(r.second.priceFen)}</strong><small>${esc(r.second.coupon||'未使用独立券')}</small></div></div><p>${r.cheaper==='same'?'这两家当前核算金额相同。':`${esc(r.cheaper==='first'?state.store.name:other.name)} 少 ¥${money(r.differenceFen)}。`}</p>${priceChart([{label:"当前门店",priceFen:r.first.priceFen},{label:"对比门店",priceFen:r.second.priceFen}],Math.round(Number($('budget').value)*100),"同款搭配，两店核价")}<p class="micro">${esc(r.evidence)}</p>`;}
 catch(e){$('store-compare-result').textContent=`无法确认同款比价：${e.message}`;feedback('本次比价没有取得有效结果，可以重试。',true);}finally{busy(false);}
};

let toastTimer;
window.addEventListener('mcd-toast',e=>{clearTimeout(toastTimer);$('ui-toast').textContent=String(e.detail);$('ui-toast').hidden=false;toastTimer=setTimeout(()=>{$('ui-toast').hidden=true;},3200);});
$('clear-activity-context').onclick=()=>{$('activity-context').hidden=true;};
window.addEventListener('mcd-activity-pick',e=>{
 if(state.busy){window.dispatchEvent(new CustomEvent('mcd-toast',{detail:'正在核算，请完成后再调整活动参考。'}));return;}
 clearPlans();$('activity-context-title').textContent=e.detail.title;$('activity-context').hidden=false;
 $('workspace').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});$('budget').focus({preventScroll:true});
 feedback(state.store?'预算和偏好已保留，点击生成方案重新核算；活动优惠尚未匹配。':'预算和偏好已保留，请先选择门店；活动优惠尚未匹配。');
});
const sectionObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('.page-nav a,.mobile-page-nav a').forEach(a=>{const active=a.getAttribute('href')===`#${entry.target.id}`;a.classList.toggle('current',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-15% 0px -60% 0px'});
['radar','workspace'].forEach(id=>sectionObserver.observe($(id)));

checkConnection();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.busy)checkConnection();});
setInterval(()=>{if(!document.hidden&&!state.busy)checkConnection();},20000);
try{const saved=JSON.parse(localStorage.getItem('mcd-meal-preferences'));if(saved&&Number(saved.budget)>=1&&Number(saved.budget)<=1000)$('budget').value=saved.budget;if(['any','burger','chicken','breakfast'].includes(saved?.preference))$('preference').value=saved.preference;if(['save','variety'].includes(saved?.priority))$('priority').value=saved.priority;if(['any','spicy','mild'].includes(saved?.flavor))$('flavor').value=saved.flavor;if(['any','medium','large'].includes(saved?.cup))$('cup').value=saved.cup;if(typeof saved?.sugarFree==='boolean')$('sugar-free').checked=saved.sugarFree;if(typeof saved?.useCoupons==='boolean')$('use-coupons').checked=saved.useCoupons;}catch{}
budgetUI();progress(1);scenarioUI();
