import {connect} from './mcp.mjs';
import {requirements, menuEntries, mainMatches, makeSelection, selectionNames, verifyPlan, policy} from '../shared/domain.mjs';
const storeScope=storeCode=>({storeCode,orderType:1,beType:1});
export async function findStores(token,city,keyword) {
 const m=await connect(token);
 try {const data=await m.call('query-nearby-stores',{beType:1,searchType:2,city,keyword});
 if(!Array.isArray(data)) throw new Error('门店结构不匹配');
 return data.filter(s=>s.businessStatus !== false).slice(0,8).map(s=>({code:String(s.storeCode),name:s.storeName,address:s.address,distance:s.distance}));
 } finally {await m.close();}
}
function planRecord(entry,detail,roundList,price,storeCode,constraints){
 const args={...storeScope(storeCode),items:[{productCode:entry.code,quantity:1,roundList}]};
 return {id:entry.code,name:entry.name,priceFen:price.price,discountFen:price.discount ?? null,withinBudget:verifyPlan(args,detail,constraints,price.price),roundList,detail,items:selectionNames(detail,roundList),request:args,observedAt:new Date().toISOString(),priceStatus:'calculated',evidence:'按显示选配提交核算；价格响应未回显选配，未验证最终订单。'};
}
export async function recommend(token, storeCode,input){
 const constraints=requirements(input);const m=await connect(token);
 try {
 const [menu,coupons]=await Promise.all([m.call('query-meals',storeScope(storeCode)),m.call('query-store-coupons',storeScope(storeCode))]);
 const candidates=menuEntries(menu).filter(x=>/套餐|件套/.test(x.name)).sort((a,b)=>Number(a.displayPrice)-Number(b.displayPrice)).slice(0,policy.maxCandidates);
 const plans=[],failures=[];
 for(const e of candidates){try{
  const detail=await m.call('query-meal-detail',{...storeScope(storeCode),code:e.code});
  const roundList=makeSelection(detail,constraints.sugarFree);
  if(!mainMatches(selectionNames(detail,roundList).join(' '),constraints.preference)) continue;
  const args={...storeScope(storeCode),items:[{productCode:e.code,quantity:1,roundList}]};
  verifyPlan(args,detail,constraints);
  const price=await m.call('calculate-price',args);
  plans.push(planRecord(e,detail,roundList,price,storeCode,constraints));
 }catch{failures.push(e.name);}}
 plans.sort((a,b)=>a.priceFen-b.priceFen);
 const within=plans.filter(p=>p.withinBudget).slice(0,policy.maxResults);
 return {plans:within,closest:within.length?null:plans[0]||null,checked:plans.length,attempted:candidates.length,failed:failures.length,couponCount:Array.isArray(coupons)?coupons.length:null,couponApplied:false,observedAt:new Date().toISOString(),scope:'本版检查最多8个套餐候选；不穷举单品组合。优惠券仅查询，暂不自动应用，核算金额以无券请求为准。'};
 }finally {await m.close();}
}
export async function recalculate(token,storeCode,code,changes,input){
 const c=requirements(input),m=await connect(token);
 try {
 const detail=await m.call('query-meal-detail',{...storeScope(storeCode),code});
 const roundList=makeSelection(detail,c.sugarFree,changes);
 const args={...storeScope(storeCode),items:[{productCode:code,quantity:1,roundList}]};
 verifyPlan(args,detail,c);
 const price=await m.call('calculate-price',args);
 return planRecord({code,name:detail.name||'套餐'},detail,roundList,price,storeCode,c);
 }finally{await m.close();}
}
