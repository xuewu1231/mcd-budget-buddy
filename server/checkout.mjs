import {resolveScenario,feeView,maskedPhone} from './scenarios.mjs';
import {enrichPlans} from './nutrition.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {connect} from './mcp.mjs';
import {ServiceError} from './errors.mjs';
import {requirements,makeSelection,selectionNames,verifyPlan,yuanToFen} from '../shared/domain.mjs';
import {orderState,paidStatus,paymentDeadline} from '../shared/order-state.mjs';
import QRCode from 'qrcode';
import {resolveCoupon,withCoupon,couponView} from './coupons.mjs';

const account=token=>createHash('sha256').update(token).digest('hex');
const active=r=>['submitting','uncertain'].includes(r.state)||(r.state==='created'&&!['6','7','8'].includes(r.order?.status));
const fail=(message,code,status=409)=>{throw new ServiceError(message,code,status);};
export function paymentURL(value,orderId){
 try {const u=new URL(value);return u.protocol==='https:'&&u.hostname==='m.mcd.cn'&&!u.port&&!u.username&&!u.password&&!u.hash&&['/mcp/scanToPay','/mcp/jumpToApp','/mcp/jumpToApp/'].includes(u.pathname)&&[...u.searchParams].length===1&&u.searchParams.get('orderId')===orderId?u.href:null;}catch{return null;}
}
export function appPaymentURL(value,orderId){
 // Verified in the official scanToPay page's own QRCodeSVG value (2026-10-14).
 // scanToPay is an instruction page; its QR targets jumpToApp for this order.
 const verified=paymentURL(value,orderId);if(!verified)return null;
 const u=new URL(verified);if(u.pathname==='/mcp/scanToPay')u.pathname='/mcp/jumpToApp';return u.href;
}
export function orderView(data,orderId,url,budgetFen,now=Date.now()){
 if(data?.orderId!==orderId)fail('订单查询返回的编号不一致，请在麦当劳官方渠道核对。','ORDER_MISMATCH',502);
 let amountFen=null;try{if(data.realTotalAmount!==undefined)amountFen=yuanToFen(data.realTotalAmount);}catch{}
 const state=orderState(data),status=state.status,deadline=paymentDeadline(data.expirePayTime),paymentExpired=deadline!==null&&deadline<=now;
 const payUrl=status==='1'&&!paymentExpired&&amountFen!==null&&amountFen<=budgetFen?paymentURL(url,orderId):null;
 return {orderId,...state,amountFen,budgetFen,paymentExpired,
  withinBudget:amountFen!==null&&amountFen<=budgetFen,payUrl,appPayUrl:payUrl?appPaymentURL(payUrl,orderId):null,
  delivery:data.deliveryInfo?.deliveryAddress?{address:String(data.deliveryInfo.deliveryAddress||''),addressDetail:String(data.deliveryInfo.addressDetail||''),contactName:String(data.deliveryInfo.customerNickname||''),phoneHint:maskedPhone(data.deliveryInfo.mobilePhone),estimatedAt:String(data.deliveryInfo.expectDeliveryTime||'')}:null,
  storeName:String(data.storeName||''),storeAddress:String(data.storeAddress||''),takeWay:String(data.takeWay||''),
  products:(Array.isArray(data.orderProductList)?data.orderProductList:[]).map(p=>({name:String(p.productName||''),quantity:p.quantity,
   items:(Array.isArray(p.comboItemList)?p.comboItemList:[]).map(x=>({name:String(x.itemName||''),quantity:x.itemQuantity}))})),
  pickupCode:paidStatus(status)?String(data.pickupCode||''):null,lockerCode:paidStatus(status)?String(data.lockerCode||''):null,expiresAt:String(data.expirePayTime||''),observedAt:new Date(now).toISOString()};
}

// Only checkout grants access to create-order. A saved receipt prevents a retry
// after a lost response (including a local service restart) from creating twice.
export function checkoutService({openMcp=connect,clock=Date.now,journal=path.resolve('local/checkout-receipts.json')}={}){
 const drafts=new Map(),inFlight=new Set();let receipts=[],loaded=false,loading,saving=Promise.resolve();
 async function load(force=false){if(loaded&&!force)return;if(loading)return loading;loading=(async()=>{try{const data=JSON.parse(await readFile(journal,'utf8'));if(!Array.isArray(data))throw new Error('invalid');const live=receipts.filter(r=>inFlight.has(r.basket));receipts=data.map(r=>r.state==='submitting'?{...r,state:'uncertain'}:r);for(const r of live){const i=receipts.findIndex(x=>x.id===r.id);if(i>=0)receipts[i]=r;else receipts.push(r);}}catch(e){if(e.code!=='ENOENT')fail('本地订单记录无法读取，已暂停创建订单。','ORDER_JOURNAL',503);}loaded=true;})().finally(()=>{loading=null;});return loading;}
 function save(){const content=JSON.stringify(receipts);saving=saving.catch(()=>{}).then(async()=>{await mkdir(path.dirname(journal),{recursive:true,mode:0o700});await writeFile(journal+'.tmp',content,{mode:0o600});await rename(journal+'.tmp',journal);});return saving;}
 function publicReceipt(r){return {receiptId:r.id,state:r.state,order:r.order||null,message:r.state==='uncertain'?'订单创建结果尚未确认。请先在麦当劳官方 App 查看订单，不要重复创建。':r.state==='submitting'?'订单正在创建，请稍候。':r.state==='failed'?'接口明确返回创建失败，未取得订单。':undefined};}
 async function prepare(token,input){
  await load(true);const constraints=requirements(input);
  if(typeof input.storeCode!=='string'||!input.storeCode||input.storeCode.length>60||typeof input.code!=='string'||!input.code||input.code.length>60)fail('请先选择有效门店与方案。','CHECKOUT_INPUT',400);
  if(!input.changes||typeof input.changes!=='object'||Array.isArray(input.changes))fail('完整选配缺失，请回到方案重新核算。','CHECKOUT_INPUT',400);
  const m=await openMcp(token,{checkout:true});try{
   const schema=m.schema('create-order');if(!schema?.properties?.items?.items?.properties?.roundList)fail('当前下单工具未明确支持套餐选配，请使用官方渠道。','CHECKOUT_UNSUPPORTED');
   const scene=await resolveScenario(m,input,input.storeCode,{verifyStore:true}),scope=scene.scope;
   const detail=await m.call('query-meal-detail',{...scope,code:input.code});
   const ids=(detail.rounds||[]).map(r=>String(r.id));if(ids.length!==Object.keys(input.changes).length||ids.some(id=>typeof input.changes[id]!=='string'||!input.changes[id]))fail('选配不完整或已变化，请回到方案重新选择。','CHECKOUT_SELECTION');
   const roundList=makeSelection(detail,constraints.sugarFree,input.changes);let request={...scope,items:[{productCode:input.code,quantity:1,roundList}],needTableware:input.needTableware===true},coupon=null;
   if(input.couponRef){if(input.useCoupons!==true)fail('用券条件已变化，请重新核价。','COUPON_SELECTION');const c=await resolveCoupon(m,scope,input.code,input.couponRef);request=withCoupon(request,c);coupon=couponView(c);}
   verifyPlan(request,detail,constraints);const quote=await m.call('calculate-price',request);
   if(!verifyPlan(request,detail,constraints,quote.price))fail('最新价格已超预算，请回到方案调整。','CHECKOUT_OVER_BUDGET');
   const ways=scene.fulfillment==='delivery'?[]:(quote.takeWayList||[]).filter(w=>typeof w.code==='string'&&w.code&&typeof w.title==='string').map(w=>({code:w.code,title:w.title,subtitle:String(w.subtitle||'')}));
   if(scene.fulfillment==='pickup'&&!ways.length)fail('接口没有返回可用取餐方式，暂不能创建订单。','CHECKOUT_TAKEWAY');
   const owner=account(token),basket=createHash('sha256').update(JSON.stringify({owner,request,addressId:scene.addressId})).digest('hex');
   const existing=receipts.find(r=>r.owner===owner&&r.basket===basket&&active(r));
   if(existing)fail('这份搭配已有创建记录，请先从「最近订单」查看，不要重复创建。','CHECKOUT_EXISTING');
   for(const[id,d]of drafts)if(d.expiresAt<=clock())drafts.delete(id);
   if(drafts.size>=100)fail('确认页面过多，请稍后重试。','CHECKOUT_BUSY');
   const id=randomUUID(),expiresAt=clock()+5*60000;
   const nutrition=(await enrichPlans(m,[{detail,roundList}])).plans[0];
   const preview={coupon,fulfillment:scene.fulfillment,deliveryAddress:scene.address||null,fees:feeView(quote),nutrition:nutrition.nutrition,nutritionObservedAt:nutrition.nutritionObservedAt,draftId:id,name:String(detail.name||'所选套餐'),storeName:scene.store.name,storeAddress:scene.store.address,items:selectionNames(detail,roundList),priceFen:quote.price,budgetFen:constraints.budgetFen,takeWays:ways,expiresAt,observedAt:new Date(clock()).toISOString(),needTableware:request.needTableware};
   drafts.set(id,{owner,basket,request,scene,context:{...input},preview,expiresAt,state:'prepared'});return preview;
  }finally{await m.close();}
 }
 async function confirmImpl(token,input){
  await load();if(input.confirm!==true)fail('请先核对并明确确认创建订单。','CHECKOUT_CONFIRM',400);
  const owner=account(token),d=drafts.get(input.draftId);if(!d||d.owner!==owner)fail('确认页已失效，请重新准备。','CHECKOUT_EXPIRED');
  const prior=receipts.find(r=>r.owner===owner&&r.basket===d.basket&&active(r));
  if(prior)return publicReceipt(prior);
  if(d.state!=='prepared'||clock()>=d.expiresAt)fail('确认页已过期，请重新核价。','CHECKOUT_EXPIRED');
  if(d.scene.fulfillment==='pickup'&&!d.preview.takeWays.some(w=>w.code===input.takeWayCode))fail('请选择当前返回的取餐方式。','CHECKOUT_TAKEWAY',400);
  if(inFlight.has(d.basket))fail('这份搭配正在创建，请从最近订单查看。','CHECKOUT_BUSY');
  inFlight.add(d.basket);d.state='connecting';let m;try{m=await openMcp(token,{checkout:true});}catch(e){d.state='prepared';inFlight.delete(d.basket);throw e;}
  try{
   if(d.scene.fulfillment==='delivery'){const fresh=await resolveScenario(m,d.context,d.request.storeCode);if(fresh.scope.beCode!==d.scene.scope.beCode||JSON.stringify(fresh.address)!==JSON.stringify(d.scene.address))fail('配送地址或门店已变化，请重新确认。','CHECKOUT_ADDRESS_CHANGED');}
   if(d.context.couponRef){const c=await resolveCoupon(m,d.scene.scope,d.context.code,d.context.couponRef),item=d.request.items[0];if(c.id!==item.couponId||c.code!==item.couponCode)fail('优惠券已变化，请重新核价。','COUPON_CHANGED');}
   const current=await m.call('calculate-price',d.request);
   if(clock()>=d.expiresAt||current.price!==d.preview.priceFen||!Number.isSafeInteger(current.price))fail('核算金额已变化或确认已过期，请重新核价后确认。','CHECKOUT_PRICE_CHANGED');
   if(d.scene.fulfillment==='pickup'&&!current.takeWayList?.some(w=>w.code===input.takeWayCode))fail('当前取餐方式已变化，请重新确认。','CHECKOUT_TAKEWAY');
  }catch(e){d.state='prepared';inFlight.delete(d.basket);await m.close();throw e;}
  // Another confirm during connect is rejected; only one attempt reaches the MCP.
  const r={id:randomUUID(),owner,basket:d.basket,state:'uncertain',attemptedAt:new Date(clock()).toISOString(),budgetFen:d.preview.budgetFen,quotedPriceFen:d.preview.priceFen};
  receipts.push(r);try{await save();}catch{receipts=receipts.filter(x=>x!==r);d.state='prepared';inFlight.delete(d.basket);await m.close();fail('无法保存本地防重复记录，已停止下单。','ORDER_JOURNAL',503);}
  d.state='submitting';r.state='submitting';
  try{
   const result=await m.call('create-order',{...d.request,...(d.scene.fulfillment==='delivery'?{addressId:d.scene.addressId,...(typeof input.remark==='string'&&input.remark.trim()?{remark:input.remark.trim().slice(0,50)}:{})}:{takeWayCode:input.takeWayCode})});
   if(typeof result.orderId!=='string'||!result.orderId)throw new Error('missing order');
   r.orderId=result.orderId;r.payUrl=paymentURL(result.payH5Url,result.orderId);r.state='created';
   try{r.order={...orderView(result.orderDetail,result.orderId,r.payUrl,r.budgetFen,clock()),quotedPriceFen:r.quotedPriceFen};}catch{r.order={orderId:r.orderId,status:'',statusLabel:'订单已创建，详情待核对',amountFen:null,withinBudget:false,payUrl:null,products:[]};}
   d.state='created';
  }catch(e){r.state=e?.code==='MCP_BUSINESS'?'failed':'uncertain';d.state=r.state;}
  try{await save();}catch{r.message='订单记录保存失败，请记下编号并在官方渠道核对，勿重复创建。';}
  finally{inFlight.delete(d.basket);await m.close();}return {...publicReceipt(r),...(r.message?{message:r.message}:{})};
 }
 async function recent(token){await load(true);return {receipts:receipts.filter(r=>r.owner===account(token)).slice(-10).reverse().map(publicReceipt)};}
 async function refreshImpl(token,id){await load();const r=receipts.find(x=>x.id===id&&x.owner===account(token));if(!r?.orderId)fail('尚未取得订单编号，请先在官方 App 核对。','ORDER_UNCERTAIN');
  const m=await openMcp(token,{checkout:true});try{const data=await m.call('query-order',{orderId:r.orderId});r.order={...orderView(data,r.orderId,r.payUrl,r.budgetFen,clock()),quotedPriceFen:r.quotedPriceFen};await save();return publicReceipt(r);}finally{await m.close();}}
 async function guarded(action){await mkdir(path.dirname(journal),{recursive:true,mode:0o700});let lock;try{lock=await open(journal+'.lock','wx',0o600);}catch(e){fail(e.code==='EEXIST'?'另一个订单操作正在进行，或上次操作中断。请先在官方渠道核对，勿重复下单。':'无法建立本地下单保护，请检查目录权限。','CHECKOUT_BUSY',409);}
  try{await load(true);return await action();}finally{await lock.close();await unlink(journal+'.lock');}}
 async function confirm(token,input){if(input.confirm!==true)fail('请先核对并明确确认创建订单。','CHECKOUT_CONFIRM',400);return guarded(()=>confirmImpl(token,input));}
 async function refresh(token,id){
  try{return await guarded(()=>refreshImpl(token,id));}
  catch(e){
   if(e.code!=='CHECKOUT_BUSY')throw e;
   // A stale creation lock must stop writes, not prevent reading a known order.
   await load(true);const r=receipts.find(x=>x.id===id&&x.owner===account(token));
   if(!r?.orderId)fail('尚未取得订单编号，请先在官方 App 核对。','ORDER_UNCERTAIN');
   const m=await openMcp(token,{checkout:true});try{const data=await m.call('query-order',{orderId:r.orderId});return {...publicReceipt({...r,order:{...orderView(data,r.orderId,r.payUrl,r.budgetFen,clock()),quotedPriceFen:r.quotedPriceFen}}),message:'最新状态已查询；本机记录暂无法更新，请勿重复创建订单。'};}finally{await m.close();}
  }
 }
 async function payment(token,id){
  // Recheck the owned order, not a URL supplied by the browser. No new transaction.
  const receipt=await refresh(token,id),url=receipt.order?.appPayUrl;
  return {receipt,qrDataUrl:url?await QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:4,width:280}):null};
 }
 return {prepare,confirm,recent,refresh,payment};
}
