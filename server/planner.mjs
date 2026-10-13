import {connect} from './mcp.mjs';
import {ServiceError} from './errors.mjs';
import {requirements, menuEntries, mainMatches, makeSelection, selectionNames, verifyPlan, policy} from '../shared/domain.mjs';
import {selectionVariants,rankProposals} from '../shared/recommendations.mjs';
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
async function boundedMap(values,job,deadline){
 let next=0;const result=[];
 await Promise.all(Array.from({length:Math.min(2,values.length)},async()=>{while(next<values.length&&Date.now()<deadline){const i=next++;result[i]=await job(values[i]);}}));
 return result.filter(Boolean);
}
export async function recommend(token, storeCode,input,{openMcp=connect}={}){
 const constraints=requirements(input),deadline=Date.now()+180000,m=await openMcp(token);
 try {
 const [menuResult,couponResult]=await Promise.allSettled([m.call('query-meals',storeScope(storeCode)),m.call('query-store-coupons',storeScope(storeCode))]);
 if(menuResult.status==='rejected')throw menuResult.reason;
 const menu=menuResult.value,coupons=couponResult.status==='fulfilled'?couponResult.value:null;
 const candidates=menuEntries(menu).filter(x=>/套餐|件套/.test(x.name)).sort((a,b)=>Number(a.displayPrice)-Number(b.displayPrice)).slice(0,policy.maxCandidates);
 const failures=[];let apiFailures=0;
 const groups=await boundedMap(candidates,async entry=>{try{
  const detail=await m.call('query-meal-detail',{...storeScope(storeCode),code:entry.code});
  return selectionVariants(detail,constraints,3).map(roundList=>({entry,detail,roundList}));
 }catch(e){if(e instanceof ServiceError)apiFailures++;failures.push(entry.name);return [];}},deadline);
 // Give each package one chance before considering alternate mains or sides.
 const queue=[];for(let level=0;level<3;level++)for(const group of groups)if(group[level])queue.push(group[level]);
 const jobs=queue.slice(0,policy.maxQuotes);
 const plans=await boundedMap(jobs,async({entry,detail,roundList})=>{try{
  const args={...storeScope(storeCode),items:[{productCode:entry.code,quantity:1,roundList}]};verifyPlan(args,detail,constraints);
  const price=await m.call('calculate-price',args);return planRecord(entry,detail,roundList,price,storeCode,constraints);
 }catch(e){if(e instanceof ServiceError)apiFailures++;failures.push(entry.name);return null;}},deadline);
 if(!plans.length&&apiFailures)throw new ServiceError('套餐查询或核价接口失败，暂时无法确认推荐结果。请稍后重试，不代表预算内无方案。','MCP_CANDIDATES_FAILED');
 const within=rankProposals(plans,constraints,policy.maxResults),ordered=[...plans].sort((a,b)=>a.priceFen-b.priceFen);
 return {plans:within,closest:within.length?null:ordered[0]||null,checked:plans.length,attempted:candidates.length,failed:failures.length,couponCount:Array.isArray(coupons)?coupons.length:null,couponError:couponResult.status==='rejected'?'门店券查询失败，本次按无券价格核算；不代表没有可用券。':null,couponApplied:false,observedAt:new Date().toISOString(),scope:`本次最多检查${policy.maxCandidates}个套餐、核算${policy.maxQuotes}份具体搭配，最多返回3套；不穷举单品组合。口味倾向按名称匹配，实际辣度未核验。优惠券仅查询，未自动应用。`};
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
 return {...planRecord({code,name:detail.name||'套餐'},detail,roundList,price,storeCode,c),edited:true,reason:'按你修改的搭配重新核算',notes:[]};
 }finally{await m.close();}
}
