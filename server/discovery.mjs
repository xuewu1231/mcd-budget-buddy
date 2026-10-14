import {connect} from './mcp.mjs';
import {recalculate} from './planner.mjs';
import {normalizeCalendar,normalizeAvailableCoupons,compareQuotes} from '../shared/discovery.mjs';
export async function discover(token){
 const m=await connect(token);
 try{
  const clock=await m.call('now-time-info',{});
  const [calendar,coupons]=await Promise.allSettled([m.call('campaign-calendar',{}),m.call('available-coupons',{})]);
  if(calendar.status==='rejected')throw calendar.reason;
  return {...normalizeCalendar(calendar.value,clock),coupons:coupons.status==='fulfilled'?normalizeAvailableCoupons(coupons.value):null,couponError:coupons.status==='rejected'?'可领券查询失败，请重试；这不代表没有券。':null,mode:'live'};
 }finally{await m.close();}
}
export async function compareStores(token,input,{quoteMeal=recalculate}={}){
 if(input.storeCode===input.otherStoreCode)throw new Error('请选择另一家门店');
 if(!Array.isArray(input.roundList)||!input.roundList.length)throw new Error('请先生成并核算一份完整选配');
 const changes=Object.fromEntries(input.roundList.map(r=>[r.round,r.comboItemList?.[0]?.code]));
 const quote=store=>quoteMeal(token,store,input.code,changes,input);
 const first=await quote(input.storeCode),second=await quote(input.otherStoreCode);
 // Reject remapped or silently defaulted choices, on either store.
 if(JSON.stringify(first.roundList)!==JSON.stringify(input.roundList))throw new Error('当前选配已变化，请重新生成后比价');
 return {first:{storeCode:input.storeCode,priceFen:first.priceFen,coupon:first.coupon?.name||null,observedAt:first.observedAt},second:{storeCode:input.otherStoreCode,priceFen:second.priceFen,coupon:second.coupon?.name||null,observedAt:second.observedAt},...compareQuotes(first,second),mode:'live',evidence:'两店按同一商品与完整选配分别提交核算；响应未回显选配，未验证最终订单。已有券按各店适用情况分别匹配与核价；不代表全部门店最低价。'};
}
