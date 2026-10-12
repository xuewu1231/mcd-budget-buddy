import {requirements,makeSelection,selectionNames,verifyPlan,policy} from '../shared/domain.mjs';
export const demoStores=[{code:'demo-sidaokou',name:'北京四道口餐厅',address:'大柳树路2号 · 历史门店展示',distance:960},{code:'demo-luozhuang',name:'北京罗庄中路餐厅',address:'知春路甲20号 · 历史门店展示',distance:991},{code:'demo-xueyuan',name:'北京学院国际大厦餐厅',address:'知春路1号 · 历史门店展示',distance:1341}];
const drinks=[{code:'demo-zero',name:'无糖可口可乐',isDefault:true,demoExtraFen:0},{code:'demo-regular',name:'可口可乐',demoExtraFen:0},{code:'demo-tea',name:'锡兰红茶（糖含量未确认）',demoExtraFen:160}];
const demoMeals=[{code:'demo-burger',name:'鸡排堡三件套',baseFen:2280,main:'鸡排堡',type:'burger'},{code:'demo-nuggets',name:'麦乐鸡经典中套餐',baseFen:2500,main:'麦乐鸡5块',type:'chicken'}].map(e=>({...e,detail:{name:e.name,rounds:[{id:'1',name:'主食',choices:[{code:`${e.code}-main`,name:e.main,isDefault:true}]},{id:'2',name:'小食',choices:[{code:'demo-fries',name:'中薯条',isDefault:true}]},{id:'3',name:'饮料',choices:drinks}]}}));
function quote(entry,changes,input,storeCode){
 const c=requirements(input),roundList=makeSelection(entry.detail,c.sugarFree,changes);
 const drink=drinks.find(x=>x.code===roundList[2].comboItemList[0].code);
 const priceFen=entry.baseFen+drink.demoExtraFen;
 const request={storeCode,orderType:1,beType:1,items:[{productCode:entry.code,quantity:1,roundList}]};
 return {id:entry.code,name:entry.name,priceFen,discountFen:0,withinBudget:verifyPlan(request,entry.detail,c,priceFen),roundList,detail:entry.detail,items:selectionNames(entry.detail,roundList),priceStatus:'demo',observedAt:'2026-10-10T06:06:00.000Z',evidence:'这是合成选配与模拟算价，用于体验界面；未调用麦当劳接口。'};
}
export function demoRecommend(storeCode,input){
 const c=requirements(input);
 const plans=demoMeals.filter(e=>c.preference==='any'||c.preference===e.type).map(e=>quote(e,{},input,storeCode)).sort((a,b)=>a.priceFen-b.priceFen);
 return {plans:plans.filter(p=>p.withinBudget).slice(0,policy.maxResults),closest:plans.some(p=>p.withinBudget)?null:plans[0]||null,checked:plans.length,attempted:plans.length,failed:0,couponCount:0,couponApplied:false,scope:'演示只包含2个合成套餐；金额和选配用于交互展示，不是实时供应或报价。',observedAt:'2026-10-10T06:06:00.000Z'};
}
export function demoRecalculate(storeCode,code,changes,input){
 const entry=demoMeals.find(e=>e.code===code);if(!entry)throw new Error('演示套餐不存在');
 return quote(entry,changes,input,storeCode);
}
