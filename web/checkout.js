import {nutritionMarkup,feeMarkup} from './meal-info.js';
import {foodArt} from './api.js';
import {paidStatus,needsOrderWatch,createOrderWatch} from './order-state.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n/100).toFixed(2);
const official='https://app.mcdonalds.cn/';
export function createCheckoutUI({api}){
 const dialog=document.getElementById('checkout-dialog'),content=document.getElementById('checkout-content'),title=document.getElementById('checkout-title'),close=document.getElementById('checkout-close');
 let pending=false,timer,revision=0,currentReceipt=null,watch=null,querying=null,qr=null,reviewed=false;
 function notice(text){const el=document.getElementById('order-watch-notice');if(el)el.textContent=text;}
 async function queryCurrent(){const id=currentReceipt?.receiptId;if(!id)throw new Error('订单记录缺失');if(querying?.id===id)return querying.promise;const request={id,promise:null};request.promise=api('checkout-refresh',{receiptId:id}).finally(()=>{if(querying===request)querying=null;});querying=request;return request.promise;}
 function stopWatch(){watch?.stop();watch=null;}
 function ensureWatch(){if(!watch)watch=createOrderWatch({load:queryCurrent,onResult:r=>receipt(r),onNotice:notice,visible:()=>dialog.open&&!document.hidden});return watch;}
 document.addEventListener('visibilitychange',()=>watch?.visibilityChanged());window.addEventListener('focus',()=>{if(dialog.open)watch?.visibilityChanged();});
 function modal(){if(!dialog.open)dialog.showModal();document.body.classList.add('dialog-open');}
 function lock(value){pending=value;close.disabled=value;dialog.setAttribute('aria-busy',String(value));}
 function waiting(text){lock(true);content.innerHTML=`<div class="checkout-wait"><span class="checkout-spinner" aria-hidden="true"></span><strong>${esc(text)}</strong><p>正在连接麦当劳，请勿重复点击。</p></div>`;}
 function reset(){clearInterval(timer);lock(false);}
 close.onclick=()=>{if(!pending)dialog.close();};dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});dialog.addEventListener('close',()=>{revision++;clearInterval(timer);stopWatch();});
 function error(message,{recover=false}={}){reset();title.textContent=recover?'先核对是否已有订单':'暂时不能继续下单';content.innerHTML=`<div class="checkout-note warning"><strong>${esc(message)}</strong></div>${recover?'<button id="recover-orders" class="primary full" type="button">查看最近订单</button>':''}<a class="checkout-link" href="${official}" target="_blank" rel="noopener noreferrer">打开麦当劳官方点餐入口 ↗</a><p class="small-note">官方入口不会自动带入这份搭配。你可以关闭窗口，复制原方案作为参考。</p>`;if(recover)document.getElementById('recover-orders').onclick=recent;}
 async function open(input,previousPrice){
  stopWatch();currentReceipt=null;qr=null;reviewed=false;revision++;const rev=revision;modal();title.textContent='正在确认这顿饭';waiting(input.fulfillment==='delivery'?'重新核价，并确认配送地址与费用':'重新核价，并确认可用取餐方式');
  try{const d=await api('checkout-prepare',input);if(rev!==revision)return;reset();title.textContent=d.fulfillment==='delivery'?'确认这顿送到哪里':'确认这顿怎么取';
   content.innerHTML=`<ol class="checkout-steps"><li class="current">1 核对搭配</li><li>2 创建订单</li><li>3 官方支付</li></ol><div class="checkout-store"><small>${d.fulfillment==='delivery'?'麦乐送 · 立即配送':'到店自取 · 现在用餐'}</small><strong>${esc(d.storeName)}</strong><p>${esc(d.storeAddress)}</p></div>${d.deliveryAddress?`<div class="checkout-address"><small>送到这个地址</small><strong>${esc(d.deliveryAddress.fullAddress)}</strong><p>${esc(d.deliveryAddress.contactName)} · ${esc(d.deliveryAddress.phoneHint)}</p></div>`:''}<div class="checkout-tray">${d.items.map(name=>`<div>${foodArt(name)}<span>${esc(name)}</span></div>`).join('')}</div><div class="checkout-total"><span>最新核算金额</span><strong>¥${money(d.priceFen)}</strong></div>${previousPrice!==d.priceFen?`<p class="checkout-note warning">价格已从 ¥${money(previousPrice)} 变为 ¥${money(d.priceFen)}，请按最新金额确认。</p>`:''}${feeMarkup(d.fees,d.fulfillment)}${nutritionMarkup(d.nutrition,d.nutritionObservedAt)}${d.fulfillment==='delivery'?'<label for="delivery-remark">配送备注（可选，最多50字）</label><textarea id="delivery-remark" maxlength="50" rows="2" placeholder="例如：请放前台"></textarea>':`<fieldset class="checkout-ways"><legend>选个取餐方式</legend>${d.takeWays.map(w=>`<label><input type="radio" name="take-way" value="${esc(w.code)}"><span><strong>${esc(w.title)}</strong><small>${esc(w.subtitle)}</small></span></label>`).join('')}</fieldset>`}<p class="small-note">${d.needTableware?'需要餐具，费用已提交核算。':'不额外添加餐具。'}优惠券未自动使用。点击下方按钮会在当前 MCP 账号下创建真实订单，支付由你在官方页面完成，创建后可打开官方支付页或显示手机扫码二维码。付款后回到这里查询官方状态与取餐码。</p><p id="checkout-expiry" class="small-note" role="status"></p><button id="confirm-order" class="primary full" type="button" disabled>确认创建订单，去支付</button>`;
   const button=document.getElementById('confirm-order'),expiry=document.getElementById('checkout-expiry');
   function tick(){const left=Math.ceil((d.expiresAt-Date.now())/1000),checked=content.querySelector('input[name="take-way"]:checked');button.disabled=left<=0||(d.fulfillment!=='delivery'&&!checked);expiry.textContent=left>0?`本次核价确认剩余 ${Math.floor(left/60)} 分 ${left%60} 秒；尚未创建订单。`:'本次确认已过期。请关闭窗口后重新核价。';}
   content.querySelectorAll('input[name="take-way"]').forEach(x=>x.onchange=tick);tick();timer=setInterval(tick,1000);
   button.onclick=async()=>{const selected=content.querySelector('input[name="take-way"]:checked');if((d.fulfillment!=='delivery'&&!selected)||button.disabled||pending)return;const remark=document.getElementById('delivery-remark')?.value;clearInterval(timer);waiting('正在创建订单，请等待结果');title.textContent='正在创建订单';
    try{const r=await api('checkout-confirm',{draftId:d.draftId,...(selected?{takeWayCode:selected.value}:{}),remark,confirm:true});reset();receipt(r);}catch(e){error(`${e.message} 创建结果未确认时请勿重复下单。`,{recover:true});}
   };
  }catch(e){if(rev===revision)error(e.message,{recover:e.code==='CHECKOUT_EXISTING'});}
 }
 function receipt(r){
  reset();if(r.state!=='created'||!r.order){stopWatch();error(r.message||'创建结果暂未确认，请在官方 App 核对。',{recover:r.state!=='failed'});return;}
  if(currentReceipt?.receiptId!==r.receiptId){stopWatch();qr=null;reviewed=false;}
  const previousPickup=currentReceipt?.order?.pickupCode;currentReceipt=r;const o=r.order;if(!o.payUrl){qr=null;reviewed=false;}
  title.textContent=o.status==='1'?'订单已创建，等待你支付':'查看这顿饭的进度';
  const totalLabel=o.status==='1'?'订单应付金额':paidStatus(o.status)?'官方返回的订单金额':'订单金额';
  content.innerHTML=`<ol class="checkout-steps"><li>1 核对搭配</li><li>2 订单已创建</li><li class="current">3 ${o.status==='1'?'官方支付':'订单进度'}</li></ol>
   <div class="checkout-store"><small>${esc(o.statusLabel)}</small><strong>${esc(o.storeName||'所选门店')}</strong><p>${esc(o.storeAddress||'')}${o.takeWay?` · ${esc(o.takeWay)}`:''}</p></div>
   ${o.delivery?`<div class="checkout-address"><small>官方返回的配送信息</small><strong>${esc(o.delivery.address)} ${esc(o.delivery.addressDetail)}</strong><p>${esc(o.delivery.contactName)} · ${esc(o.delivery.phoneHint)}</p>${o.delivery.estimatedAt?`<p>预计送达：${esc(o.delivery.estimatedAt)}</p>`:''}</div>`:''}
   <ul class="checkout-order-items">${(o.products||[]).map(p=>`<li><strong>${esc(p.name)} × ${esc(p.quantity)}</strong>${p.items.map(x=>`<span>${esc(x.name)} × ${esc(x.quantity)}</span>`).join('')}</li>`).join('')}</ul>
   <div class="checkout-total"><span>${totalLabel}</span><strong>${o.amountFen===null?'待确认':`¥${money(o.amountFen)}`}</strong></div>
   <p class="small-note">订单编号：<span id="official-order-id">${esc(o.orderId)}</span><br>状态查询时间（北京时间）：${o.observedAt?esc(new Date(o.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})):'待查询'}${o.expiresAt?`<br>官方支付截止：${esc(o.expiresAt)}`:''}</p><button id="copy-order-id" type="button" class="checkout-refresh">复制订单编号</button>
   ${o.amountFen!==null&&o.quotedPriceFen!==undefined&&o.amountFen!==o.quotedPriceFen?`<p class="checkout-note warning">订单金额与核价金额 ¥${money(o.quotedPriceFen)} 不同，请核对后再决定是否支付。</p>`:''}
   ${r.message?`<p class="checkout-note warning">${esc(r.message)}</p>`:''}
   ${o.status==='1'&&!o.payUrl?`<p class="checkout-note warning">${o.paymentExpired?'官方支付时限已过，请更新状态或到官方渠道核对，勿重复付款。':'金额、预算或支付地址尚未通过核对，支付按钮暂不可用。请先更新状态或在官方渠道核对。'}</p>`:''}
   ${o.payUrl?`<label class="checkout-ack"><input id="order-reviewed" type="checkbox" ${reviewed?'checked':''}><span>我已核对门店、餐品、杯型、金额及取餐方式或配送地址</span></label>
    <a id="official-pay" class="primary checkout-pay is-disabled" aria-disabled="true" tabindex="-1" target="_blank" rel="noopener noreferrer">打开官方支付页面 ↗</a>
    <button id="show-payment-qr" type="button" class="checkout-refresh full" disabled>手机扫码支付 · 显示二维码</button>
    <p class="small-note">付款由麦当劳官方收银台完成。支付宝是否可选以收银台实际展示为准；此处生成的是官方支付链接二维码。</p><div id="payment-qr-area" class="payment-qr-area" ${qr?'':'hidden'}>${qr?`<img src="${esc(qr)}" alt="此订单的麦当劳官方支付链接二维码" width="280" height="280"><p>用手机扫码，核对收款方和金额后付款。支付二维码仅供本人使用，请勿公开分享。</p>`:''}</div>`:''}
   ${o.pickupCode?`<div class="pickup-number"><small>官方返回的取餐码</small><strong>${esc(o.pickupCode)}</strong><button id="copy-pickup" class="checkout-refresh" type="button">复制取餐码</button></div>`:paidStatus(o.status)&&!o.delivery?'<p class="checkout-note">官方尚未返回取餐码。订单已支付或进入配餐阶段不代表餐品已可领取；可继续查询，或在官方 App 查看。</p>':''}
   ${o.lockerCode?`<div class="pickup-number"><small>官方返回的取餐柜密码</small><strong>${esc(o.lockerCode)}</strong></div>`:''}
   <p id="order-watch-notice" class="small-note" role="status">${watch?.isActive()?'正在等待官方更新。':'点击更新可查询官方最新结果；打开支付页不代表付款成功。'}</p>
   <button id="refresh-order" class="checkout-refresh full" type="button">${o.status==='1'?'我已支付 / 付款遇到问题 · 查询结果':'更新订单状态'}</button>
   <a class="checkout-link" href="${official}" target="_blank" rel="noopener noreferrer">在官方点餐渠道查看或取消订单 ↗</a>`;
  async function copy(text,button){try{await navigator.clipboard.writeText(text);button.textContent='已复制';}catch{button.textContent='复制失败，请手动选中编号';}}
  document.getElementById('copy-order-id').onclick=e=>copy(o.orderId,e.currentTarget);
  const pickupButton=document.getElementById('copy-pickup');if(pickupButton)pickupButton.onclick=e=>copy(o.pickupCode,e.currentTarget);
  if(o.payUrl){
   const check=document.getElementById('order-reviewed'),a=document.getElementById('official-pay'),button=document.getElementById('show-payment-qr');
   function acknowledge(){reviewed=check.checked;a.classList.toggle('is-disabled',!reviewed);a.setAttribute('aria-disabled',String(!reviewed));a.tabIndex=reviewed?0:-1;button.disabled=!reviewed;if(reviewed)a.href=o.payUrl;else{a.removeAttribute('href');qr=null;document.getElementById('payment-qr-area').hidden=true;stopWatch();}}
   check.onchange=acknowledge;acknowledge();a.onclick=e=>{if(!reviewed){e.preventDefault();return;}ensureWatch().start();};
   button.onclick=async()=>{
    if(pending||!reviewed)return;const rev=revision,id=r.receiptId;button.disabled=true;button.textContent='正在确认订单并生成二维码…';
    try{const data=await api('checkout-payment',{receiptId:id});if(rev!==revision||currentReceipt?.receiptId!==id||!reviewed)return;qr=typeof data.qrDataUrl==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.qrDataUrl)?data.qrDataUrl:null;receipt(data.receipt);if(qr){document.getElementById('payment-qr-area').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});ensureWatch().start();}else notice('官方状态已更新，未生成支付二维码。');}catch{if(rev===revision){button.disabled=!reviewed;button.textContent='重试生成手机支付二维码';notice('二维码生成失败，没有创建新订单。请更新状态或打开官方支付页。');}}
   };
  }
  document.getElementById('refresh-order').onclick=async()=>{
   if(pending)return;if(watch?.isActive()){await watch.refresh();return;}
   const rev=revision,id=r.receiptId;const button=document.getElementById('refresh-order');button.disabled=true;notice('正在查询官方订单状态…');
   try{const next=await queryCurrent();if(rev!==revision||currentReceipt?.receiptId!==id)return;receipt(next);if(needsOrderWatch(next.order))ensureWatch().start();}catch{if(rev===revision){button.disabled=false;notice('查询失败，仍保留上次结果。可重试或到官方渠道核对。');}}
  };
  if(o.pickupCode&&o.pickupCode!==previousPickup)content.querySelector('.pickup-number')?.scrollIntoView({block:'center',behavior:'auto'});
 }
 async function recent(){stopWatch();revision++;const recentRevision=revision;currentReceipt=null;qr=null;reviewed=false;modal();title.textContent='最近订单';waiting('正在读取本机创建的订单记录');try{const d=await api('checkout-recent',{});if(recentRevision!==revision)return;reset();title.textContent='最近订单';content.innerHTML=`<p class="small-note">仅显示当前 MCP 账号在本机创建的记录；刷新后也可从这里继续。记录里的状态是上次查询结果。</p>${d.receipts.length?d.receipts.map((r,i)=>`<button class="checkout-receipt" type="button" data-receipt="${i}"><strong>${esc(r.order?.storeName||'订单创建记录')}</strong><span>${esc(r.order?.statusLabel||r.message||'状态待确认')}${r.order?.amountFen!=null?` · ¥${money(r.order.amountFen)}`:''}</span></button>`).join(''):'<p class="checkout-note">当前账号暂无本机创建的订单。</p>'}`;content.querySelectorAll('[data-receipt]').forEach(b=>b.onclick=async()=>{const r=d.receipts[Number(b.dataset.receipt)];if(!r.order?.orderId){receipt(r);return;}const rev=revision;waiting('正在查询官方最新订单状态');try{const next=await api('checkout-refresh',{receiptId:r.receiptId});if(rev===revision)receipt(next);}catch(e){if(rev===revision)error(e.message,{recover:true});}});}catch(e){error(e.message);}}
 document.getElementById('recent-orders').onclick=recent;
 return {open,recent};
}
