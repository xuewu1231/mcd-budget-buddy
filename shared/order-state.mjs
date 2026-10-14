const labels={'1':'待支付','2':'已支付，配餐中','4':'配送中','6':'已完成','7':'已取消','8':'已完成，已评价','10':'餐厅已确认，配餐中'};
const aliases={'待支付':'1','已支付':'2','配餐中-已支付':'2','配送中':'4','已完成':'6','订单已完成':'6','已取消':'7','订单已取消':'7','已评价':'8','配餐中-餐厅确认配餐中':'10'};
export function orderState(data={}){
 const raw=String(data.orderStatusCode??data.orderStatus??'').trim();
 const status=labels[raw]?raw:aliases[raw]||'';
 return {status,statusRaw:raw,statusLabel:labels[status]||`状态暂未识别${raw?'（'+raw+'）':''}，请在官方渠道查看`};
}
export const paidStatus=status=>['2','4','6','8','10'].includes(status);
export const terminalStatus=status=>['6','7','8'].includes(status);
export function paymentDeadline(value){
 if(typeof value!=='string'||!value)return null;
 // Local McDonald's timestamps mean Beijing time, never the computer's zone.
 const text=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)?value.replace(' ','T')+'+08:00':value;
 if(!/T.*(Z|[+-]\d{2}:\d{2})$/.test(text))return null;
 const t=Date.parse(text);return Number.isFinite(t)?t:null;
}
export function needsOrderWatch(order){return !order?.paymentExpired&&(order?.status==='1'||(['2','10'].includes(order?.status)&&!order.delivery&&!order.pickupCode&&!order.lockerCode));}
// Only readonly queries. The UI starts this after the user enters payment.
export function createOrderWatch({load,onResult,onNotice=()=>{},visible=()=>true,now=Date.now,schedule=setTimeout,cancel=clearTimeout,interval=20000,duration=300000,maxAttempts=15}){
 let active=false,epoch=0,timer=null,inFlight=null,until=0,attempts=0;
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 function stop(){active=false;epoch++;clear();}
 function queue(){clear();if(active&&visible())timer=schedule(()=>{timer=null;void refresh();},interval);}
 async function refresh(){
  if(inFlight)return inFlight;if(!active||!visible())return;
  if(now()>=until||attempts>=maxAttempts){stop();onNotice('自动查询已暂停，可随时手动更新订单。');return;}
  clear();const rev=epoch;attempts++;onNotice('正在查询官方订单状态…');
  inFlight=(async()=>{try{const result=await load();if(rev!==epoch)return;onResult(result);if(!needsOrderWatch(result.order)){stop();onNotice(result.order?.pickupCode?'已取得官方取餐码。':result.order?.status==='1'?'请在官方渠道核对订单。':'已更新官方状态。');}else{onNotice('每20秒查询一次，最多5分钟；返回本页会立即查询。');queue();}}catch{if(rev===epoch){stop();onNotice('本次查询失败，仍保留上次结果。请手动更新或在官方渠道核对。');}}})().finally(()=>{inFlight=null;});return inFlight;
 }
 function start(){if(active)return;active=true;epoch++;until=now()+duration;attempts=0;onNotice('等待官方付款结果；每20秒查询一次，最多5分钟。');queue();}
 function visibilityChanged(){if(!visible())clear();else if(active)void refresh();}
 return {start,stop,refresh,visibilityChanged,isActive:()=>active};
}
