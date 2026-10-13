import {requestJSON,activityMatches,icon,enhanceMedia,animateFeedback} from './api.js';
import {timeHint} from './discovery.js';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=null,selectedDate='',revision=0,visibleLimit=6,category='all',openedActivity=null;
const toast=text=>window.dispatchEvent(new CustomEvent('mcd-toast',{detail:text}));
function favorites(){try{const list=JSON.parse(localStorage.getItem('mcd-activity-favorites')||'[]');return Array.isArray(list)?list.filter(x=>typeof x==='string').slice(-100):[];}catch{return [];}}
function message(text,error=false){const changed=$('radar-status').textContent!==text;$('radar-status').textContent=text;if(changed)animateFeedback($('radar-status'),[{opacity:.6},{opacity:1}]);$('radar-status').classList.toggle('error',error);}
function clock(){const m=Number($('radar-time').value);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function eventsForDay(){return data?.days.find(d=>d.date===selectedDate)?.events||[];}
function updateTime(){
 const time=clock();$('radar-time-caption').textContent=time;$('time-explorer-caption').textContent=time;$('radar-time').setAttribute('aria-valuetext',time);
 document.querySelectorAll('[data-time-preset]').forEach(b=>{const selected=Number(b.dataset.timePreset)===Number($('radar-time').value);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-hint]').forEach(p=>{const e=eventsForDay().find(e=>e.id===p.dataset.hint);if(!e)return;const hint=timeHint(e,selectedDate,time);p.innerHTML=`${icon('clock')}<span>${esc(hint.text)}</span>`;p.closest('.activity-card').classList.toggle('match',hint.kind==='match');});
}
async function load(){
 if($('refresh-radar').disabled)return;const refreshHTML=$('refresh-radar').innerHTML;const rev=++revision,firstLoad=data===null;$('refresh-radar').disabled=true;$('refresh-radar').classList.add('is-loading');$('refresh-radar').innerHTML=`${icon('refresh')}<span>查询活动中…</span>`;$('radar-retry').hidden=true;$('activity-cards').setAttribute('aria-busy','true');message('正在翻开活动日历…');
 if(firstLoad)$('activity-cards').innerHTML=Array.from({length:3},()=>'<div class="activity-skeleton" aria-hidden="true"><div></div><span></span><span></span></div>').join('');
 try{
  const result=await requestJSON('/api/discover',{body:{mode:'live'},timeoutMs:60000});if(rev!==revision)return;window.dispatchEvent(new CustomEvent('mcd-service-response',{detail:{online:true,configured:true}}));
  data=result;selectedDate=selectedDate||data.serverDate;visibleLimit=6;$('radar-date').value=selectedDate;
  if(firstLoad)$('radar-time').value=Number(data.serverTime.slice(0,2))*60+Number(data.serverTime.slice(3));
  $('radar-data-source').textContent='实时活动';$('radar-data-source').classList.add('live');
  $('radar-stamp').textContent=`查询时间 ${new Date(data.observedAt).toLocaleString('zh-CN')}`;
  render();renderCoupons();message('活动已更新，选个日期看看。');
 }catch(e){if(e.status>0||e.code==='OFFLINE')window.dispatchEvent(new CustomEvent('mcd-service-response',{detail:{online:e.status>0,configured:e.code==='NOT_CONFIGURED'?false:undefined}}));if(rev===revision){data=null;$('activity-cards').innerHTML='';$('radar-days').innerHTML='';$('claimable-coupons').innerHTML='';$('radar-stamp').textContent='尚未取得活动数据';$('activity-results-caption').textContent='活动暂时未加载';$('radar-retry').hidden=false;message(`活动查询失败：${e.message}`,true);}}
 finally{if(rev===revision){$('refresh-radar').disabled=false;$('refresh-radar').classList.remove('is-loading');$('refresh-radar').innerHTML=refreshHTML;$('activity-cards').setAttribute('aria-busy','false');}}
}
function openActivity(e){
 openedActivity=e;$('activity-dialog-title').textContent=e.title;$('activity-dialog-content').textContent=e.content||'接口未提供更多详情。';
 $('activity-dialog-hint').textContent=`官方活动日历 · ${e.date}。宣传价不是门店最终报价。`;
 $('activity-dialog-image').hidden=!e.image;$('activity-dialog-image').innerHTML=e.image?`<img data-media decoding="async" src="${esc(e.image)}" alt="${esc(e.title)}活动海报" referrerpolicy="no-referrer">`:'';
 enhanceMedia($('activity-dialog-image'));$('activity-dialog').showModal();document.body.classList.add('dialog-open');
}
function render(){
 if(!data)return;
 const focus=document.activeElement,focusedDay=focus?.dataset?.day,focusedFavorite=focus?.dataset?.favorite;
 const scroll=$('radar-days').scrollLeft;
 $('radar-days').innerHTML=data.days.map(d=>`<button class="day-chip ${d.date===selectedDate?'selected':''}" data-day="${esc(d.date)}" aria-pressed="${d.date===selectedDate}"><span>${d.date===data.serverDate?'今天':new Date(d.date+'T00:00:00Z').toLocaleDateString('zh-CN',{weekday:'short',timeZone:'UTC'})}</span><strong>${d.date.slice(5).replace('-',' / ')}</strong><small>${d.events.length} 条活动</small></button>`).join('');
 $('radar-days').scrollLeft=scroll;
 document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selectedDate=b.dataset.day;visibleLimit=6;$('radar-date').value=selectedDate;render();});
 const events=eventsForDay(),saved=favorites(),onlySaved=$('only-saved').checked,query=$('activity-search').value;
 const visible=events.filter(e=>(!onlySaved||saved.includes(e.title))&&activityMatches(e,category,query));
 $('clear-activity-search').hidden=!query;$('reset-activity-filters').hidden=category==='all'&&!query&&!onlySaved;
 $('activity-results-caption').textContent=`${selectedDate.slice(5).replace('-','月')}日 · ${visible.length} 条${onlySaved?'收藏':'活动'}${visible.length<events.length?` / 当天 ${events.length} 条`:''}`;
 document.querySelectorAll('[data-category]').forEach(b=>{const selected=b.dataset.category===category;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 $('activity-cards').innerHTML=visible.length?visible.slice(0,visibleLimit).map(e=>{
  const hint=timeHint(e,selectedDate,clock()),isSaved=saved.includes(e.title),times=[...new Set(e.content.match(/\b\d{1,2}:\d{2}\b/g)||[])];
  const kind=e.type===2?'券活动':e.type===3?'品鉴会':e.type===6?'派对':'活动资讯';
  return `<article class="activity-card ${hint.kind}">${e.image?`<button class="activity-image poster-button" data-poster="${esc(e.id)}" aria-label="查看海报：${esc(e.title)}"><img data-media decoding="async" src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="poster-zoom" aria-hidden="true">${icon('zoom')}放大海报</span></button>`:'<div class="activity-image illustrated"><span aria-hidden="true">✦</span><p>今天的小期待</p></div>'}<div class="activity-body"><div class="activity-meta"><span>${kind}</span><button class="favorite" data-favorite="${esc(e.id)}" aria-pressed="${isSaved}" aria-label="${isSaved?'取消':'添加'}本地收藏：${esc(e.title)}">${icon('star')}</button></div><h3>${esc(e.title)}</h3><p class="activity-timing" data-hint="${esc(e.id)}">${icon('clock')}<span>${esc(hint.text)}</span></p>${times.length?`<p class="article-time-hint">原文提到 ${times.map(esc).join(' / ')}，日期见详情</p>`:''}<p class="activity-excerpt">${esc(e.content.slice(0,64))}${e.content.length>64?'…':''}</p><button class="activity-detail" data-activity="${esc(e.id)}">看看详情 <span aria-hidden="true">${icon('arrow')}</span></button></div></article>`;
 }).join(''):`<div class="radar-empty"><span aria-hidden="true">${icon('search')}</span><strong>${events.length?'暂时没找到符合筛选的活动':'这一天没有返回活动记录'}</strong><small>${events.length?'试试其他关键词，或者清除筛选。':'可以换个日期看看；没有记录不代表当天没有优惠。'}</small></div>`;
 if(visible.length>visibleLimit){const button=document.createElement('button');button.className='more-activities';button.textContent=`再看 ${Math.min(6,visible.length-visibleLimit)} 条活动 ↓`;button.onclick=()=>{const previousLimit=visibleLimit;visibleLimit+=6;render();document.querySelectorAll('[data-activity]')[previousLimit]?.focus({preventScroll:true});};$('activity-cards').append(button);}
 document.querySelectorAll('[data-favorite]').forEach(b=>b.onclick=()=>{
  const e=events.find(e=>e.id===b.dataset.favorite);let list=favorites();const remove=list.includes(e.title);list=remove?list.filter(x=>x!==e.title):[...list,e.title];
  try{localStorage.setItem('mcd-activity-favorites',JSON.stringify(list.slice(-100)));render();toast(remove?'已取消本地收藏':'已收藏在这台浏览器，下次可以继续看。');}catch{toast('浏览器无法保存收藏。');}
 });
 document.querySelectorAll('[data-activity],[data-poster]').forEach(b=>b.onclick=()=>openActivity(events.find(e=>e.id===(b.dataset.activity||b.dataset.poster))));
 document.querySelectorAll('.activity-image img').forEach(img=>img.onerror=()=>{img.hidden=true;const label=img.parentElement.querySelector('.poster-zoom');if(label)label.textContent='海报暂未加载 · 查看详情 ↗';});
 if(focusedDay)document.querySelector(`[data-day="${focusedDay}"]`)?.focus({preventScroll:true});
 if(focusedFavorite){const target=[...document.querySelectorAll('[data-favorite]')].find(b=>b.dataset.favorite===focusedFavorite);(target||$('only-saved')).focus({preventScroll:true});}
 enhanceMedia($('activity-cards'));updateTime();
}
function renderCoupons(){
 $('claimable-coupons').innerHTML=data.coupons===null?`<p class="error">${esc(data.couponError)}</p>`:data.coupons.length?data.coupons.map(c=>`<div class="coupon-ticket"><span aria-hidden="true">${icon('ticket')}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.label)} · 未领取，未核验门店适用性</small></div></div>`).join(''):'<p class="small-note">本次接口没有返回可领取的券。</p>';
}
$('activity-to-plan').onclick=()=>{if(!openedActivity)return;$('activity-dialog').close();window.dispatchEvent(new CustomEvent('mcd-activity-pick',{detail:{title:openedActivity.title}}));};
$('refresh-radar').onclick=load;$('radar-retry').onclick=load;
$('radar-date').onchange=()=>{selectedDate=$('radar-date').value;visibleLimit=6;if(selectedDate)render();};$('radar-time').oninput=updateTime;$('only-saved').onchange=()=>{visibleLimit=6;render();};
$('activity-search').oninput=()=>{visibleLimit=6;render();};
$('clear-activity-search').onclick=()=>{$('activity-search').value='';visibleLimit=6;render();$('activity-search').focus();};
$('reset-activity-filters').onclick=()=>{category='all';$('activity-search').value='';$('only-saved').checked=false;visibleLimit=6;render();};
 document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;visibleLimit=6;render();});
 document.querySelectorAll('[data-time-preset]').forEach(b=>b.onclick=()=>{$('radar-time').value=b.dataset.timePreset;updateTime();});
const burger=$('burger-play');burger.onclick=()=>{burger.classList.remove('burger-pop');void burger.offsetWidth;burger.classList.add('burger-pop');$('burger-caption').textContent=['少点纠结，多点薯条。','好吃的搭配，从你的预算开始。','活动看清楚，再决定吃什么。'][Math.floor(Math.random()*3)];};
$('radar-fold').addEventListener('toggle',()=>{const open=$('radar-fold').open;$('radar-fold-action').textContent=open?'收起活动 ↑':'展开看看 ↓';if(open&&!data&& !$('refresh-radar').disabled)load();});
if(location.hash==='#radar')$('radar-fold').open=true;
