import {connect} from './mcp.mjs';
import {recalculate} from './planner.mjs';
import {demoRecalculate} from './demo.mjs';
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
export function demoDiscover(){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const next=new Date(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);const tomorrow=next.toISOString().slice(0,10);
 return {...normalizeCalendar({dailyList:[{date,events:[{activityTitle:'早一点，吃得刚刚好',articleDto:{content:'演示活动：工作日早餐灵感。滑动时间查看使用时段的变化；此规则仅用于演示。'},eventType:2,couponInfo:{isAllTradeTime:0,tradeTimePeriods:[{startTime:'07:00',endTime:'10:30'}],weekdays:[2,3,4,5,6]}},{activityTitle:'午后，来点小食',articleDto:{content:'演示活动：薯条和麦乐鸡的小食时刻。不是当前门店优惠。'},eventType:2,couponInfo:{isAllTradeTime:0,tradeTimePeriods:[{startTime:'14:00',endTime:'17:00'}]}},{activityTitle:'新品灵感小卡',articleDto:{content:'演示活动：今天尝点不一样的口味。未提供使用时间，不能推断全天有效。'},eventType:4}]},{date:tomorrow,events:[{activityTitle:'明天的早餐灵感',eventType:4,articleDto:{content:'演示未来活动，不代表真实排期。'}}]}]}, {date,formatted:date+' 12:00:00',timestamp:Date.now()}),coupons:[{id:'demo-fries',name:'小食分享券（演示）',label:'演示可领',status:'CAN_GET',image:null}],mode:'demo'};
}
export async function compareStores(token,input){
 if(input.storeCode===input.otherStoreCode)throw new Error('请选择另一家门店');
 if(!Array.isArray(input.roundList)||!input.roundList.length)throw new Error('请先生成并核算一份完整选配');
 const changes=Object.fromEntries(input.roundList.map(r=>[r.round,r.comboItemList?.[0]?.code]));
 const quote=store=>input.mode==='demo'?Promise.resolve(demoRecalculate(store,input.code,changes,input)):recalculate(token,store,input.code,changes,input);
 const first=await quote(input.storeCode),second=await quote(input.otherStoreCode);
 // Reject remapped or silently defaulted choices, including the demo path.
 if(JSON.stringify(first.roundList)!==JSON.stringify(input.roundList))throw new Error('当前选配已变化，请重新生成后比价');
 return {first:{storeCode:input.storeCode,priceFen:first.priceFen,observedAt:first.observedAt},second:{storeCode:input.otherStoreCode,priceFen:second.priceFen,observedAt:second.observedAt},...compareQuotes(first,second),mode:input.mode,evidence:'两店按同一商品与完整选配分别提交核算；响应未回显选配，未验证最终订单。不含自动用券，不代表全部门店最低价。'};
}
