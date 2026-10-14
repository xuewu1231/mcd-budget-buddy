import {storeView} from '../shared/store-view.mjs';
import {resolveScenario,deliveryStores,feeView} from './scenarios.mjs';
import {enrichPlans} from './nutrition.mjs';
import {storeCoupons,quoteWithOwnedCoupon,resolveCoupon,publicQuoteRequest} from './coupons.mjs';
import {connect} from './mcp.mjs';
import {ServiceError} from './errors.mjs';
import {requirements, menuEntries, mainMatches, makeSelection, selectionNames, verifyPlan, policy} from '../shared/domain.mjs';
import {selectionVariants,rankProposals} from '../shared/recommendations.mjs';
export async function findStores(token,city,keyword) {
 const m=await connect(token);
 try {const data=await m.call('query-nearby-stores',{beType:1,searchType:2,city,keyword});
 if(!Array.isArray(data)) throw new Error('门店结构不匹配');
 return data.filter(s=>s.businessStatus !== false).slice(0,8).map(storeView);
 } finally {await m.close();}
}
function planRecord(entry,detail,roundList,price,args,constraints){
 return {fees:feeView(price),fulfillment:constraints.fulfillment,id:entry.code,name:entry.name,priceFen:price.price,discountFen:price.discount ?? null,withinBudget:verifyPlan(args,detail,constraints,price.price),roundList,detail,items:selectionNames(detail,roundList),request:publicQuoteRequest(args),observedAt:new Date().toISOString(),priceStatus:'calculated',evidence:'按显示选配提交核算；价格响应未回显选配，未验证最终订单。券编码保留在服务端，页面只展示券名及引用。'};
}
async function boundedMap(values,job,deadline){
 let next=0;const result=[];
 await Promise.all(Array.from({length:Math.min(2,values.length)},async()=>{while(next<values.length&&Date.now()<deadline){const i=next++;result[i]=await job(values[i]);}}));
 return result.filter(Boolean);
}
export async function recommend(token, storeCode,input,{openMcp=connect}={}){
 const constraints=requirements(input),deadline=Date.now()+180000,m=await openMcp(token);
 try {
 const scene=await resolveScenario(m,input,storeCode),scope=scene.scope;
 const [menuResult,couponResult]=await Promise.allSettled([m.call('query-meals',scope),m.call('query-store-coupons',scope)]);
 if(menuResult.status==='rejected')throw menuResult.reason;
 const menu=menuResult.value;let coupons=null,couponError=null;
 try{if(couponResult.status==='rejected')throw couponResult.reason;coupons=storeCoupons(couponResult.value);}catch{couponError='门店券查询失败或格式未确认，本次按无券价格核算；不代表没有可用券。';}
 const entries=menuEntries(menu);if(input.useCoupons===true&&coupons)for(const c of coupons.usable)if(/套餐|件套/.test(c.product.name)&&!entries.some(e=>e.code===c.product.code))entries.push({code:c.product.code,name:c.product.name,displayPrice:null});
 const candidates=entries.filter(x=>/套餐|件套/.test(x.name)).sort((a,b)=>(input.useCoupons===true?Number(Boolean(coupons?.usable.some(c=>c.product.code===b.code)))-Number(Boolean(coupons?.usable.some(c=>c.product.code===a.code))):0)||Number(a.displayPrice??Infinity)-Number(b.displayPrice??Infinity)).slice(0,policy.maxCandidates);
 const failures=[];let apiFailures=0;
 const groups=await boundedMap(candidates,async entry=>{try{
  const detail=await m.call('query-meal-detail',{...scope,code:entry.code});
  return selectionVariants(detail,constraints,3).map(roundList=>({entry,detail,roundList}));
 }catch(e){if(e instanceof ServiceError)apiFailures++;failures.push(entry.name);return [];}},deadline);
 // Give each package one chance before considering alternate mains or sides.
 const queue=[];for(let level=0;level<3;level++)for(const group of groups)if(group[level])queue.push(group[level]);
 const jobs=queue.slice(0,input.useCoupons===true&&coupons?.usable.length?Math.floor(policy.maxQuotes/2):policy.maxQuotes);
 const plans=await boundedMap(jobs,async({entry,detail,roundList})=>{try{
  const args={...scope,items:[{productCode:entry.code,quantity:1,roundList}],needTableware:input.needTableware===true};verifyPlan(args,detail,constraints);
  const quoted=await quoteWithOwnedCoupon(m,args,coupons,{enabled:input.useCoupons===true});return {...planRecord(entry,detail,roundList,quoted.price,quoted.request,constraints),coupon:quoted.coupon,couponIssue:quoted.couponIssue};
 }catch(e){if(e instanceof ServiceError)apiFailures++;failures.push(entry.name);return null;}},deadline);
 if(!plans.length&&apiFailures)throw new ServiceError('套餐查询或核价接口失败，暂时无法确认推荐结果。请稍后重试，不代表预算内无方案。','MCP_CANDIDATES_FAILED');
 const enrichment=await enrichPlans(m,plans);
 const within=rankProposals(enrichment.plans,constraints,policy.maxResults),ordered=[...plans].sort((a,b)=>a.priceFen-b.priceFen);
 return {nutritionError:enrichment.nutritionError,fulfillment:scene.fulfillment,deliveryAddress:scene.address||null,plans:within,closest:within.length?null:ordered[0]||null,checked:plans.length,attempted:candidates.length,failed:failures.length,couponCount:coupons?.count??null,couponError,couponApplied:within.some(p=>p.coupon),observedAt:new Date().toISOString(),scope:`本次最多检查${policy.maxCandidates}个套餐、提交${policy.maxQuotes}次价格核算，最多返回3套；不穷举单品组合。口味倾向按名称匹配，实际辣度未核验。${input.useCoupons===true?'匹配到的套餐最多试算一张已有券，只有整单报价更低才选择；不领券、不穷举多券组合。':'本次未选择用券。'}`};
 }finally {await m.close();}
}
export async function recalculate(token,storeCode,code,changes,input,{openMcp=connect}={}){
 const c=requirements(input),m=await openMcp(token);
 try {
 const scene=await resolveScenario(m,input,storeCode),scope=scene.scope;
 const detail=await m.call('query-meal-detail',{...scope,code});
 const roundList=makeSelection(detail,c.sugarFree,changes);
 const args={...scope,items:[{productCode:code,quantity:1,roundList}],needTableware:input.needTableware===true};
 verifyPlan(args,detail,c);let coupons=null,couponIssue=null;
 if(input.useCoupons===true){if(input.couponRef){const selected=await resolveCoupon(m,scope,code,input.couponRef);coupons={usable:[selected]};}else{try{coupons=storeCoupons(await m.call('query-store-coupons',scope));}catch{couponIssue={name:'已有券',reason:'券查询未成功，本次按无券实价核算，不代表没有可用券'};}}}
 const q=await quoteWithOwnedCoupon(m,args,coupons,{enabled:input.useCoupons===true});verifyPlan(q.request,detail,c);
 const enrichment=await enrichPlans(m,[{...planRecord({code,name:detail.name||'套餐'},detail,roundList,q.price,q.request,c),coupon:q.coupon,couponIssue:q.couponIssue||couponIssue}]);
 return {...enrichment.plans[0],nutritionError:enrichment.nutritionError,edited:true,reason:'按你修改的搭配重新核算',notes:[]};
 }finally{await m.close();}
}

export async function findDeliveryStores(token,addressId){const m=await connect(token);try{return await deliveryStores(m,addressId);}finally{await m.close();}}
