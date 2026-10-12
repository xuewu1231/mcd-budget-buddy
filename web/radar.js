import {requestJSON} from './api.js';
import {timeHint} from './discovery.js';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='demo',data=null,selectedDate='',revision=0,visibleLimit=6;
const favorites=()=>{try{return JSON.parse(localStorage.getItem('mcd-activity-favorites')||'[]');}catch{return [];}};
function message(text,error=false){$('radar-status').textContent=text;$('radar-status').classList.toggle('error',error);}
async function load(){
 const rev=++revision;$('refresh-radar').disabled=true;message('正在翻开活动日历…');
 try{
  const result=await requestJSON('/api/discover',{body:{mode},timeoutMs:60000});if(rev!==revision)return;
  data=result;selectedDate=data.serverDate;visibleLimit=6;$('radar-date').value=selectedDate;$('radar-time').value=Number(data.serverTime.slice(0,2))*60+Number(data.serverTime.slice(3));
  $('radar-data-source').textContent=mode==='demo'?'演示活动':'麦当劳 MCP · 实时查询';
  $('radar-stamp').textContent=`${mode==='demo'?'演示查询':'查询'}时间 ${new Date(data.observedAt).toLocaleString('zh-CN')}`;
  $('radar-mode-switch').textContent=mode==='demo'?'看真实活动 ↗':'切换演示';render();renderCoupons();message(`${mode==='demo'?'演示日历':'活动日历'}已更新。宣传信息需以门店与券规则核验。`);
 }catch(e){if(rev===revision){data=null;$('activity-cards').innerHTML='';$('radar-days').innerHTML='';$('claimable-coupons').innerHTML='';$('radar-stamp').textContent='尚未取得活动数据';message(`活动查询失败：${e.message}`,true);}}
 finally{if(rev===revision)$('refresh-radar').disabled=false;}
}
function clock(){const m=Number($('radar-time').value);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function render(){
 if(!data)return;
 const time=clock();$('radar-time-caption').textContent=time;
 $('radar-days').innerHTML=data.days.map(d=>`<button class="day-chip ${d.date===selectedDate?'selected':''}" data-day="${esc(d.date)}" aria-pressed="${d.date===selectedDate}"><span>${d.date===data.serverDate?'今天':new Date(d.date+'T00:00:00Z').toLocaleDateString('zh-CN',{weekday:'short',timeZone:'UTC'})}</span><strong>${d.date.slice(5).replace('-',' / ')}</strong><small>${d.events.length} 条活动</small></button>`).join('');
 document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selectedDate=b.dataset.day;visibleLimit=6;$('radar-date').value=selectedDate;render();});
 const events=data.days.find(d=>d.date===selectedDate)?.events||[],saved=favorites(),onlySaved=$('only-saved').checked;
 const visible=events.filter(e=>!onlySaved||saved.includes(e.title));
 $('activity-cards').innerHTML=visible.length?visible.slice(0,visibleLimit).map(e=>{
  const hint=timeHint(e,selectedDate,time),isSaved=saved.includes(e.title),times=[...new Set(e.content.match(/\b\d{1,2}:\d{2}\b/g)||[])];
  const kind=e.type===2?'券活动':e.type===3?'品鉴会':e.type===6?'派对':'活动资讯';
  return `<article class="activity-card ${hint.kind}">${e.image?`<div class="activity-image"><img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`:'<div class="activity-image illustrated"><span aria-hidden="true">✦</span><p>今天的小期待</p></div>'}<div class="activity-body"><div class="activity-meta"><span>${mode==='demo'?'演示 · ':''}${kind}</span><button data-favorite="${esc(e.id)}" aria-pressed="${isSaved}" aria-label="${isSaved?'取消':'添加'}本地收藏：${esc(e.title)}">${isSaved?'★':'☆'}</button></div><h3>${esc(e.title)}</h3><p class="activity-timing">◷ ${esc(hint.text)}</p>${times.length?`<p class="article-time-hint">原文提到 ${times.map(esc).join(' / ')}，具体日期请看详情</p>`:''}<p class="activity-excerpt">${esc(e.content.slice(0,80))}${e.content.length>80?'…':''}</p><button class="activity-detail" data-activity="${esc(e.id)}">看看活动详情 ↗</button></div></article>`;
 }).join(''):`<div class="radar-empty">${onlySaved?'这一天还没有本地收藏。':'接口返回的日历没有这一天的活动记录。'}<small>不代表当天没有优惠，可以换个日期看看。</small></div>`;
 if(visible.length>visibleLimit){const button=document.createElement('button');button.className='more-activities';button.textContent=`再看 ${visible.length-visibleLimit} 条活动 ↓`;button.onclick=()=>{visibleLimit+=6;render();};$('activity-cards').append(button);}
 document.querySelectorAll('[data-favorite]').forEach(b=>b.onclick=()=>{const e=events.find(e=>e.id===b.dataset.favorite);let list=favorites();list=list.includes(e.title)?list.filter(x=>x!==e.title):[...list,e.title];try{localStorage.setItem('mcd-activity-favorites',JSON.stringify(list.slice(-100)));render();message('本地收藏已更新，仅保存在这台浏览器；不会订阅官方活动或发送提醒。');}catch{message('浏览器无法保存收藏。',true);}});
 document.querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>{const e=events.find(e=>e.id===b.dataset.activity);$('activity-dialog-title').textContent=e.title;$('activity-dialog-content').textContent=e.content||'接口未提供更多详情。';$('activity-dialog-hint').textContent=`${mode==='demo'?'演示信息':'来源：campaign-calendar'} · 日历日期 ${e.date}。活动文案的价格不是门店最终报价。`;$('activity-dialog').showModal();});
 document.querySelectorAll('.activity-image img').forEach(img=>img.onerror=()=>{img.remove();});
}
function renderCoupons(){
 $('claimable-coupons').innerHTML=data.coupons===null?`<p class="error">${esc(data.couponError)}</p>`:data.coupons.length?data.coupons.map(c=>`<div class="coupon-ticket"><span aria-hidden="true">✂</span><div><strong>${esc(c.name)}</strong><small>${esc(c.label)} · 未领取，未核验门店适用性</small></div></div>`).join(''):'<p class="small-note">本次接口没有返回可领取的券。</p>';
}
$('radar-mode-switch').onclick=()=>$(mode==='demo'?'live-mode':'demo-mode').click();$('refresh-radar').onclick=load;$('radar-date').onchange=()=>{selectedDate=$('radar-date').value;visibleLimit=6;if(selectedDate)render();};$('radar-time').oninput=render;$('only-saved').onchange=render;
window.addEventListener('mcd-mode',e=>{mode=e.detail;data=null;$('radar-mode-switch').textContent=mode==='demo'?'看真实活动 ↗':'切换演示';$('radar-data-source').textContent=mode==='demo'?'演示活动 · 待更新':'真实活动 · 待查询';$('radar-stamp').textContent='尚未取得本模式活动数据';$('activity-cards').innerHTML='';$('radar-days').innerHTML='';$('claimable-coupons').innerHTML='';load();});
const burger=$('burger-play');burger.onclick=()=>{burger.classList.remove('burger-pop');void burger.offsetWidth;burger.classList.add('burger-pop');$('burger-caption').textContent=['少点纠结，多点薯条。','好吃的搭配，从你的预算开始。','活动看清楚，再决定吃什么。'][Math.floor(Math.random()*3)];};
load();
