import test from 'node:test';import assert from 'node:assert/strict';
import {selectionVariants,rankProposals} from '../shared/recommendations.mjs';
import {requirements} from '../shared/domain.mjs';
import {recommend} from '../server/planner.mjs';
const detail={rounds:[{id:1,name:'选择主食',choices:[{code:'egg',name:'猪柳蛋麦满分',isDefault:true},{code:'chicken',name:'原味板烧鸡腿麦满分'}]},{id:2,name:'选择小食',choices:[{code:'potato',name:'脆薯饼',isDefault:true},{code:'sausage',name:'德式香肠'}]},{id:3,name:'选择饮料',choices:[{code:'sweet',name:'可乐中杯',isDefault:true},{code:'large',name:'无糖可乐大杯'},{code:'medium',name:'无糖可乐中杯'}]}]};
const c=requirements({budget:'30',preference:'breakfast',sugarFree:true,cup:'medium'});
test('早餐主食能产生真实主食/小食变化，全部选配保持无糖及中杯偏好',()=>{
 const variants=selectionVariants(detail,c);
 assert.equal(variants.length,3);assert.notEqual(variants[0][0].comboItemList[0].code,variants[1][0].comboItemList[0].code);
 assert.equal(variants[2][1].comboItemList[0].code,'sausage');
 for(const list of variants)assert.equal(list[2].comboItemList[0].code,'medium');
 const fixed={rounds:[{...detail.rounds[0],choices:[detail.rounds[0].choices[0]]},{...detail.rounds[1],choices:[detail.rounds[1].choices[0]]},detail.rounds[2]]};
 assert.equal(selectionVariants(fixed,c).length,1); // Cup-only changes do not pad A/B/C.
});
test('排名使用核价而非菜单价，去重且不返回超预算或未知价格',()=>{
 const make=(id,priceFen,main='猪柳蛋麦满分',side='脆薯饼')=>({id,priceFen,withinBudget:priceFen<=3000,items:[main,side,'无糖可乐中杯'],detail,roundList:selectionVariants(detail,c)[0]});
 const results=rankProposals([make('one',2600),make('cheap-same',2400),make('other',2500,'原味鸡腿麦满分'),make('third',2800,'牛肉汉堡'),make('over',3500),make('unknown',NaN)],c);
 assert.equal(results.length,3);assert.equal(results[0].id,'cheap-same');assert.deepEqual(results.map(p=>p.priceFen),[2400,2500,2800]);
 assert.equal(rankProposals([make('one',2600)],c).length,1);
});
test('换着吃优先提供不同主食，辣味仅按名称作为软偏好',()=>{
 const make=(id,priceFen,main,side='脆薯饼')=>({id,priceFen,withinBudget:true,items:[main,side,'无糖可乐中杯'],detail,roundList:selectionVariants(detail,c)[0]});
 const pool=[make('base',2200,'鸡腿堡'),make('side',2250,'鸡腿堡','香肠'),make('different',2600,'牛肉堡')];
 assert.equal(rankProposals(pool,{...c,priority:'variety'})[1].id,'different');
 const hot=rankProposals([...pool,make('spicy',2700,'麦辣鸡腿堡')],{...c,flavor:'spicy'});
 assert.equal(hot[0].id,'spicy');assert.ok(hot[1].notes.some(n=>n.includes('辣度未核验')));
});
test('推荐通过核价依赖逐套算价，券查询失败不伪装成没有券',async()=>{
 const quotes=[];let closed=false;
 const openMcp=async()=>({close:async()=>{closed=true;},call:async(name,args)=>{
  if(name==='query-meals')return {meals:{meal:{name:'早餐套餐',currentPrice:'22'}}};
  if(name==='query-store-coupons')throw new Error('coupon failure');
  if(name==='query-meal-detail')return detail;
  if(name==='calculate-price'){quotes.push(args);return {price:2300+(args.items[0].roundList[0].comboItemList[0].code==='chicken'?100:0)+(args.items[0].roundList[1].comboItemList[0].code==='sausage'?200:0)};}
  throw new Error('unexpected tool');
 }});
 const r=await recommend('test','store',{budget:'30',preference:'breakfast',sugarFree:true,cup:'medium'},{openMcp});
 assert.equal(r.plans.length,3);assert.equal(quotes.length,3);assert.equal(r.couponCount,null);assert.ok(r.couponError.includes('不代表没有'));
 assert.equal(closed,true);for(const q of quotes)assert.equal(q.items[0].roundList[2].comboItemList[0].code,'medium');
});
