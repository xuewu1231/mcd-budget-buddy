import {requestJSON,budgetView,comparePlans} from './api.js';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n/100).toFixed(2);
const state={mode:'demo',stores:[],store:null,plans:[],result:null,busy:false,liveReady:false,revision:0};
const controls=['city','location','budget','preference','sugar-free','brief','parse-brief','demo-mode','live-mode','find-stores','recommend','toggle-conditions','compare-prices','compare-plan','compare-store'];
async function api(route,body){
 try {const data=await requestJSON(`/api/${route}`,{body,timeoutMs:route==='recommend'?240000:route==='parse'?8000:60000});serviceState(true);return data;}
 catch(e){if(e.code==='OFFLINE')serviceState(false);throw e;}
}
function serviceState(online){state.serviceOnline=online;$('service-banner').hidden=online;$('connection').textContent=online?'连接设置 ↗':'服务离线 · 查看';if(!online){state.liveReady=false;$('connection-status').textContent='无法连接本地服务，请先启动项目，再重新检查。';}}
async function checkConnection(){
 $('reconnect').disabled=true;$('check-connection').disabled=true;
 try{const d=await requestJSON('/api/status',{timeoutMs:5000});if(d.app!=='mcd-budget-buddy')throw new Error('此地址不是麦麦预算助手，请检查启动命令。');serviceState(true);state.liveReady=d.liveReady;$('connection-status').textContent=d.liveReady?`本地服务已连接 · ${d.authSource==='workbuddy'?'已读取 WorkBuddy 配置':'Token 已配置'}；实际接口将在查询时验证。`:'本地服务正常，演示可用；真实查询尚未配置。';if($('feedback').textContent.includes('无法连接本地点餐服务'))feedback('本地连接已恢复，可以重新查询。');}
 catch(e){serviceState(false);$('connection-status').textContent=e.message;}
 finally{$('reconnect').disabled=false;$('check-connection').disabled=false;}
}
$('reconnect').onclick=checkConnection;$('check-connection').onclick=checkConnection;

function input(){return {mode:state.mode,city:$('city').value,keyword:$('location').value,budget:$('budget').value,preference:$('preference').value,sugarFree:$('sugar-free').checked,storeCode:state.store?.code};}
function feedback(text,error=false){$('feedback').hidden=!text;$('feedback').textContent=text;$('feedback').classList.toggle('error',error);}
function busy(value,text=''){state.busy=value;controls.forEach(id=>$(id).disabled=value);document.querySelectorAll('[data-budget],.store,.plan-card button,.plan-card select').forEach(e=>e.disabled=value);$('recommend').disabled=value||!state.store;if($('change-store'))$('change-store').disabled=value;if(!value)document.querySelectorAll('[data-copy]').forEach(b=>{const p=state.plans[Number(b.dataset.copy)];b.disabled=Boolean(p?.dirty||!p?.withinBudget);});if(text)feedback(text);}
function progress(n){[1,2,3].forEach(i=>$(`step-${i}`).classList.toggle('active',i<=n));}
function compactConditions(value){$('workspace').classList.toggle('compact-conditions',value);$('toggle-conditions').setAttribute('aria-expanded',String(!value));$('toggle-conditions').textContent=value?'展开条件 ↓':'收起条件 ↑';}
$('toggle-conditions').onclick=()=>compactConditions(!$('workspace').classList.contains('compact-conditions'));
function clearPlans(){progress(state.store?2:1);compactConditions(false);$('plan-comparison').hidden=true;$('store-comparison').hidden=true;$('store-compare-result').textContent='';state.plans=[];state.result=null;state.revision++;$('plans').innerHTML='';$('evidence').hidden=true;$('empty-state').hidden=false;$('selection-summary').hidden=true;if(state.store)$('store-section').hidden=false;}
function resetStores(){clearPlans();state.store=null;state.stores=[];$('store-section').hidden=true;$('recommend').disabled=true;progress(1);}
function budgetUI(){$('budget-caption').textContent=`¥${$('budget').value}`;document.querySelectorAll('[data-budget]').forEach(b=>b.classList.toggle('selected',b.dataset.budget===$('budget').value));}
function mode(value){if(state.busy)return;state.mode=value;window.dispatchEvent(new CustomEvent('mcd-mode',{detail:value}));resetStores();feedback('');$('demo-mode').classList.toggle('active',value==='demo');$('live-mode').classList.toggle('active',value==='live');$('demo-mode').setAttribute('aria-pressed',value==='demo');$('live-mode').setAttribute('aria-pressed',value==='live');$('data-badge').textContent=value==='demo'?'演示模式':'真实查询';$('data-badge').classList.toggle('live',value==='live');$('mode-note').textContent=value==='demo'?'演示数据 · 不代表当前供应或价格':'核算当前门店菜单价格；活动日期不会预约未来用餐';if(value==='live'&&!state.liveReady){feedback('真实模式尚未配置。点击“连接设置”查看本地配置方法。',true);}}
$('demo-mode').onclick=()=>mode('demo');$('live-mode').onclick=()=>mode('live');
$('connection').onclick=()=>{$('settings').showModal();};
$('download-skill').onclick=async()=>{try{let r;try{r=await fetch('/api/skill');}catch{serviceState(false);throw new Error('服务离线，启动本地点餐服务后再下载 Skill。');}if(!r.ok)throw new Error('Skill 读取失败');const blob=new Blob([await r.text()],{type:'text/markdown;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='SKILL.md';a.click();URL.revokeObjectURL(u);feedback('已下载 Skill 入口文件。完整使用请从源代码仓库下载项目，保留 shared 和 scripts。');}catch(e){feedback(e.message,true);}};
document.querySelectorAll('[data-budget]').forEach(b=>b.onclick=()=>{$('budget').value=b.dataset.budget;budgetUI();clearPlans();feedback('预算已更新，请重新生成方案。');});
['budget','preference','sugar-free'].forEach(id=>$(id).addEventListener('change',()=>{budgetUI();clearPlans();progress(state.store?2:1);feedback('条件已更新，请重新生成方案。');}));
['city','location'].forEach(id=>$(id).addEventListener('change',()=>{resetStores();feedback('地点已更新，请重新查询门店。');}));
$('parse-brief').onclick=async()=>{busy(true);try{const d=await api('parse',{text:$('brief').value});if(d.budget)$('budget').value=d.budget;if(d.preference)$('preference').value=d.preference;if(d.sugarFree)$('sugar-free').checked=true;budgetUI();clearPlans();feedback(Object.keys(d).length===1?'没有识别到支持的关键词，请直接修改条件。':'已提取支持的关键词，请核对下方条件。');}catch(e){feedback(e.message,true);}finally{busy(false);}};
function renderStores(){$('stores').innerHTML=state.stores.map((s,i)=>`<button class="store ${state.store?.code===s.code?'selected':''}" data-store="${i}" aria-pressed="${state.store?.code===s.code}"><span class="pin">⌖</span><span><strong>${esc(s.name)}</strong><small>${esc(s.address)}</small></span><span class="distance">${Number.isFinite(s.distance)?esc(s.distance)+'m':'距离未知'} ${state.store?.code===s.code?'✓':'→'}</span></button>`).join('');document.querySelectorAll('[data-store]').forEach(b=>b.onclick=()=>{state.store=state.stores[Number(b.dataset.store)];clearPlans();renderStores();$('recommend').disabled=false;feedback(`已选择 ${state.store.name}，可以开始生成方案。`);});}
$('search-form').onsubmit=async e=>{e.preventDefault();resetStores();busy(true,'正在查询附近门店…');try{const d=await api('stores',input());state.stores=d.stores;renderStores();$('store-section').hidden=false;progress(2);feedback(d.stores.length?'请先选择一家门店。':'当前没有返回可用门店，请换一个地点。');$('result-title').textContent='选择这顿的门店';document.querySelector('.results-area').scrollIntoView({behavior:'smooth',block:'start'});}catch(err){feedback(err.message,true);}finally{busy(false);}};
function renderSummary(){$('selection-summary').hidden=false;$('selection-summary').innerHTML=`<div><strong>⌖ ${esc(state.store.name)}</strong><small>一人份 · 到店自取 · 预算 ¥${esc($('budget').value)}${$('sugar-free').checked?' · 明确无糖饮品':''}</small></div><div class="summary-actions"><button id="adjust-conditions" class="conditions-toggle">调整条件</button><button id="change-store">换门店 ↗</button></div>`;$('adjust-conditions').onclick=()=>{compactConditions(false);document.querySelector('.controls').scrollIntoView({behavior:'smooth',block:'start'});$('budget').focus({preventScroll:true});};$('change-store').onclick=()=>{clearPlans();$('store-section').hidden=false;renderStores();progress(2);};}
function selectedItems(p){return p.detail.rounds.map(r=>{const code=p.changes?.[String(r.id)]||p.roundList.find(x=>x.round===String(r.id))?.comboItemList[0]?.code;return r.choices.find(x=>String(x.code)===String(code))?.name||'选配未确认';});}
function budgetMarkup(p){
 const b=budgetView(p.priceFen,Math.round(Number($('budget').value)*100),p.dirty);
 if(b.kind==='pending')return '<div class="budget-pending"><span>↻</span> 搭配已修改，重新核算后显示预算占用。</div>';
 if(b.kind==='unknown')return '<div class="budget-pending">金额未确认，暂不显示预算占用。</div>';
 return `<div class="budget-label"><span>占预算 <strong>${b.percent}%</strong></span><span class="${b.kind==='over'?'over':''}">${b.kind==='over'?'超出':'还余'} <strong>¥${money(Math.abs(b.remainingFen))}</strong></span></div><progress class="budget-meter ${b.kind==='over'?'over':''}" max="100" value="${b.fill}" aria-label="预算使用${b.percent}%"></progress><p class="budget-note">${b.kind==='over'?'超出预算，调整后再核算。':'预算余量不代表优惠金额。'}</p>`;
}
function evidenceMarkup(p){return p.dirty?'<p class="pending">当前搭配尚未核算；上一份报价不能作为依据。</p>':`<p>${esc(p.evidence)}</p><p>${state.mode==='demo'?'演示历史日期':'核算时间'}：${esc(new Date(p.observedAt).toLocaleString('zh-CN'))}</p><p>餐品插画仅为示意。菜单记录不保证实时可售；本工具未下单。</p>`;}
function renderComparison(){
 const c=comparePlans(state.plans,Math.round(Number($('budget').value)*100));
 const box=$('plan-comparison');box.hidden=c.kind==='unavailable';box.classList.toggle('pending-comparison',c.kind==='pending');
 if(c.kind==='pending')box.innerHTML='<span class="compare-symbol">↻</span><div><strong>搭配正在调整</strong><p>重新核算后，再比较两套方案的金额。</p></div>';
 if(c.kind==='same')box.innerHTML='<span class="compare-symbol">＝</span><div><strong>两套金额相同，按口味选</strong><p>这里比较的是当前两套方案，不代表全店最低价。</p></div>';
 if(c.kind==='different')box.innerHTML=`<span class="compare-symbol">¥</span><div><strong>方案 ${c.cheaperIndex===0?'A':'B'} 比另一套少花 <em>¥${money(c.differenceFen)}</em></strong><p>${state.mode==='demo'?'基于演示算价':'基于两套接口核算金额'} · 你可以按主食和饮料偏好选择</p></div>`;
}
function renderPlans(){
 const demo=state.mode==='demo';
 $('plans').innerHTML=`<div class="plan-grid">${state.plans.map((p,i)=>{
 const dirty=p.dirty===true;const fields=p.detail.rounds.filter(r=>r.choices.length>1).map(r=>{
 const selected=p.changes?.[String(r.id)]||p.roundList.find(x=>x.round===String(r.id))?.comboItemList[0]?.code;
 const options=r.choices.filter(x=>!$('sugar-free').checked||!/饮料|饮品/.test(r.name)||/无糖|零糖|zero sugar|sugar free/i.test(x.name));
 return `<div class="round-field"><label for="option-${i}-${esc(r.id)}">${esc(r.name)}</label><select id="option-${i}-${esc(r.id)}" data-plan="${i}" data-round="${esc(r.id)}">${options.map(x=>`<option value="${esc(x.code)}" ${String(x.code)===selected?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>`;
 }).join('');
 return `<article class="plan-card ${dirty?'is-pending':''}"><div class="plan-cover"><span class="plan-tag">${demo?'演示方案':'接口核算'} · ${i===0?'选择 A':'选择 B'}</span><img src="/meal.svg" alt="餐品示意插画，非实际商品照片"></div><div class="plan-body"><h3>${esc(p.name)}</h3><p class="food-list">${selectedItems(p).map(esc).join(' ＋ ')}</p><div class="price-line"><strong class="${dirty?'pending':''}">${dirty?'待核算':`<small>¥</small>${money(p.priceFen)}`}</strong><span>${dirty?'选配已修改':demo?'模拟算价':'按选配提交核算'}</span></div><div class="budget-state">${budgetMarkup(p)}</div>${fields}<div class="plan-actions"><button class="recalc" data-recalc="${i}">重新核算 ↻</button><button data-copy="${i}" ${dirty||!p.withinBudget?'disabled':''}>复制方案</button></div><details><summary>查看核算依据</summary><div class="calculation-evidence">${evidenceMarkup(p)}</div></details></div></article>`;
 }).join('')}</div>`;
 renderComparison();renderStoreComparison();
 document.querySelectorAll('[data-round]').forEach(s=>s.onchange=()=>{const p=state.plans[Number(s.dataset.plan)];p.changes={...(p.changes||{}),[s.dataset.round]:s.value};p.dirty=true;const card=s.closest('.plan-card');card.classList.add('is-pending');card.querySelector('.food-list').textContent=selectedItems(p).join(' ＋ ');card.querySelector('.price-line strong').textContent='待核算';card.querySelector('.price-line strong').classList.add('pending');card.querySelector('.price-line>span').textContent='选配已修改';card.querySelector('.budget-state').innerHTML=budgetMarkup(p);card.querySelector('.calculation-evidence').innerHTML=evidenceMarkup(p);card.querySelector('[data-copy]').disabled=true;$('store-compare-result').textContent='选配已变化，请重新核算后再比价。';renderComparison();renderStoreComparison();});
 document.querySelectorAll('[data-recalc]').forEach(b=>b.onclick=()=>recalc(Number(b.dataset.recalc)));
 document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const p=state.plans[Number(b.dataset.copy)];if(p.dirty||!p.withinBudget)return;const text=`${state.mode==='demo'?'【演示数据，非实时报价】':'【接口核算，未下单】'}\n${state.store.name}\n${p.name}\n${p.items.join(' + ')}\n¥${money(p.priceFen)}\n${p.evidence}`;try{await navigator.clipboard.writeText(text);feedback('方案已复制。');}catch{feedback('浏览器暂不支持复制，请手动选择餐品内容。',true);}});
}
function renderEvidence(){const r=state.result;$('evidence').hidden=false;$('evidence').innerHTML=`<p><strong>${state.mode==='demo'?'演示体验':'本次检查'}：${r.checked} 个候选完成${state.mode==='demo'?'模拟':'接口'}算价${r.failed?`，${r.failed} 个未能确认`:''}。</strong></p><p>${r.couponCount===null?'券数据结构未确认':`查询返回 ${r.couponCount} 张券`} · 本版暂不自动应用优惠券</p><p>${esc(r.scope)}</p>`;}
$('recommend').onclick=async()=>{if(!state.store)return;clearPlans();busy(true,'正在查询菜单与选配，并核算候选方案…');try{const r=await api('recommend',input());state.result=r;state.plans=r.plans;$('store-section').hidden=true;$('empty-state').hidden=true;renderSummary();progress(3);$('result-title').textContent='为这顿，选个合适的';if(r.plans.length){renderPlans();compactConditions(true);if(window.matchMedia('(max-width:640px)').matches)document.querySelector('.results-area').scrollIntoView({behavior:'smooth',block:'start'});feedback(`${state.mode==='demo'?'演示':'查询'}完成，修改选配后可以重新核算。`);}else{$('plans').innerHTML=`<div class="no-solution"><h3>这次检查，没找到预算内方案。</h3><p>${r.closest?`已核算候选中，较低金额为 ¥${money(r.closest.priceFen)}，超过你的预算。`:'候选缺少符合条件的选配或未能成功核算。'}</p><p>不代表全店无解。你可以调整预算或餐品偏好，再试一次。</p>${r.closest?'<button id="raise-budget" class="primary">按这个金额调整预算 →</button>':''}</div>`;if(r.closest)$('raise-budget').onclick=()=>{$('budget').value=money(r.closest.priceFen);budgetUI();clearPlans();$('store-section').hidden=false;renderStores();feedback('预算已更新，请重新生成。');};feedback('没有凑出不符合要求的推荐。');}renderEvidence();}catch(e){feedback(e.message,true);}finally{busy(false);}};
async function recalc(i){const old=state.plans[i];busy(true,'选配已更新，正在重新核算…');old.dirty=true;try{const changes=Object.fromEntries(old.roundList.map(r=>[r.round,r.comboItemList[0].code]));Object.assign(changes,old.changes||{});const d=await api('recalculate',{...input(),code:old.id,changes});state.plans[i]={...d.plan,name:old.name};renderPlans();feedback(d.plan.withinBudget?'重新核算完成。':'新选配超过预算，已标明，不能作为预算内方案。');}catch(e){renderPlans();feedback(`重新核算失败：${e.message}。原价格不能用于新选配。`,true);}finally{busy(false);}}
function renderStoreComparison(){
 const other=state.stores.filter(s=>s.code!==state.store?.code);$('store-comparison').hidden=!state.plans.length||!other.length;
 const selected=$('compare-plan').value;$('compare-plan').innerHTML=state.plans.map((p,i)=>`<option value="${i}" ${selected===String(i)?'selected':''}>方案 ${i===0?'A':'B'} · ${esc(p.name)}${p.dirty?'（待核算）':''}</option>`).join('');
 const store=$('compare-store').value;$('compare-store').innerHTML=other.map(s=>`<option value="${esc(s.code)}" ${store===s.code?'selected':''}>${esc(s.name)}</option>`).join('');
 $('store-compare-result').textContent='';
}
$('compare-plan').onchange=()=>{$('store-compare-result').textContent='';};$('compare-store').onchange=()=>{$('store-compare-result').textContent='';};
$('compare-prices').onclick=async()=>{
 const p=state.plans[Number($('compare-plan').value)],other=state.stores.find(s=>s.code===$('compare-store').value);
 if(!p||!other)return;if(p.dirty){$('store-compare-result').textContent='先重新核算这套选配，再做同款比价。';return;}
 busy(true);$('store-compare-result').textContent='正在分别核算两家门店的同款搭配…';
 try{const r=await api('compare',{...input(),otherStoreCode:other.code,code:p.id,roundList:p.roundList});$('store-compare-result').innerHTML=`<div class="store-price-grid"><div><small>${esc(state.store.name)}</small><strong>¥${money(r.first.priceFen)}</strong></div><div><small>${esc(other.name)}</small><strong>¥${money(r.second.priceFen)}</strong></div></div><p>${state.mode==='demo'?'演示比价 · ':''}${r.cheaper==='same'?'这两家当前核算金额相同。':`${esc(r.cheaper==='first'?state.store.name:other.name)} 少 ¥${money(r.differenceFen)}。`}</p><p class="micro">${esc(r.evidence)}</p>`;}
 catch(e){$('store-compare-result').textContent=`无法确认同款比价：${e.message}`;}finally{busy(false);}
};
checkConnection();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.busy)checkConnection();});
setInterval(()=>{if(!document.hidden&&!state.busy)checkConnection();},20000);
budgetUI();
