import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetView, comparePlans, samePlanContext, quotedPlanUsable, proposalDifference} from '../web/api.js';

test('预算占用按整数分计算，不把余量当成优惠', () => {
  assert.deepEqual(budgetView(2440, 3000), {kind:'within', percent:81, fill:81, remainingFen:560});
  assert.equal(budgetView(3000, 3000).remainingFen, 0);
});
test('超预算保留实际比例，进度条不超过满格', () => {
  assert.deepEqual(budgetView(3200, 3000), {kind:'over', percent:107, fill:100, remainingFen:-200});
});
test('修改选配后不展示旧价格的预算比例或方案比较', () => {
  assert.deepEqual(budgetView(2440, 3000, true), {kind:'pending'});
  assert.deepEqual(comparePlans([{priceFen:2440, dirty:true},{priceFen:2500}],3000), {kind:'pending'});
});
test('比较不依赖数组顺序，并正确处理同价与超预算', () => {
  assert.deepEqual(comparePlans([{priceFen:2500},{priceFen:2440}],3000), {kind:'different',cheaperIndex:1,differenceFen:60});
  assert.deepEqual(comparePlans([{priceFen:2440},{priceFen:2440}],3000), {kind:'same'});
  assert.deepEqual(comparePlans([{priceFen:3100},{priceFen:2440}],3000), {kind:'unavailable'});
});
test('未知价格与无效预算不产生图表或比较结论', () => {
  for(const price of [NaN,undefined,-1,0.5,'2440']) assert.equal(budgetView(price,3000).kind,'unknown');
  for(const budget of [0,-1,NaN,'3000']) assert.equal(budgetView(2440,budget).kind,'unknown');
  assert.equal(comparePlans([{priceFen:2440}],3000).kind,'unavailable');
  assert.equal(comparePlans([{priceFen:2440,dirty:true}],3000).kind,'unavailable');
});

import {activityMatches} from '../web/api.js';
test('活动搜索支持宣传中的特殊数字字形与大小写',()=>{assert.equal(activityMatches({title:'超值𝟗.𝟗元早餐',content:''},'breakfast','9.9'),true);assert.equal(activityMatches({title:'McD X PEACEMINUSONE'},'collab','peaceminusone'),true);});
test('分类与搜索取交集，不把名字分类当作优惠规则',()=>{const e={title:'新品鸡腿堡',content:'联名上新'};assert.equal(activityMatches(e,'new','鸡腿'),true);assert.equal(activityMatches(e,'breakfast','鸡腿'),false);assert.equal(activityMatches(e,'collab','薯条'),false);assert.equal(activityMatches(e,'unknown',''),false);});

import {priceChart, roundChoices, selectedChoice} from '../web/api.js';
test('价格图不使用待核算、未知或小数分金额，并转义外部标签',()=>{
 for(const price of [undefined,NaN,-1,12.5,'2500'])assert.equal(priceChart([{label:'A',priceFen:price}],3000),'');
 assert.equal(priceChart([{priceFen:2500,dirty:true}],3000),'');
 const html=priceChart([{label:'<script>A</script>',priceFen:2500},{label:'B',priceFen:2500}],3000);
 assert.ok(html.includes('&lt;script&gt;A&lt;/script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('从 0 起'));
 assert.equal((html.match(/width="400"/g)||[]).length,2);
});
test('图形选配保持真实编码映射，严格无糖排除反向描述',()=>{
 const round={id:3,name:'选择饮料',choices:[{code:3050,name:'可乐'},{code:3071,name:'无糖可口可乐'},{code:3111,name:'无糖可口可乐大杯'},{code:9,name:'非无糖饮料'}]};
 assert.deepEqual(roundChoices(round,true).map(x=>x.code),[3071,3111]);
 const plan={roundList:[{round:'3',comboItemList:[{code:'3071'}]}]};
 assert.equal(selectedChoice(plan,round).code,3071);
 plan.changes={'3':'3111'};assert.equal(selectedChoice(plan,round).code,3111);
});

import {foodKind,foodProfile,foodArt,restoreQuotedPlan} from '../web/api.js';
test('早餐小食与饮品按自身形态区分，不回退成汉堡',()=>{
 const cases={'脆薯饼':'hashbrown','脆香油条':'youtiao','德式图林根香肠':'sausage','中薯条':'fries','原味板烧鸡腿麦满分':'muffin','香肠蛋麦满分':'muffin','麦辣鸡翅2块':'wings','麦乐鸡4块':'nuggets','冰美式咖啡':'coffee','鲜萃冰咖':'coffee','冰燕麦奶铁中杯':'coffee','卡布奇诺中杯':'coffee','优品豆浆大杯':'soymilk','冰浓浓黑巧中杯':'chocolate','【美汁源】“黄金橙橙”':'juice','大杯怡泉+C':'soda','纯牛奶':'milk','100%苹果汁':'juice','锡兰红茶':'tea','无糖可口可乐中杯':'soda'};
 for(const [name,kind]of Object.entries(cases))assert.equal(foodKind(name),kind,name);
 assert.equal(foodKind('未识别新品'),'unknown');
 assert.ok(!foodArt('<script>alert(1)</script>').includes('<script>'));
});
test('双层、杯型与鸡块数量有不同图形，异常数量不制造巨大插画',()=>{
 assert.equal(foodProfile('双层脆鸡堡').layers,2);
 assert.notEqual(foodArt('双层脆鸡堡'),foodArt('脆鸡堡'));
 assert.equal(foodProfile('无糖可口可乐大杯').size,'large');
 assert.notEqual(foodArt('无糖可口可乐小杯'),foodArt('无糖可口可乐大杯'));
 assert.equal((foodArt('麦乐鸡4块').match(/class="art-piece"/g)||[]).length,4);
 assert.equal((foodArt('麦辣鸡翅2块').match(/class="art-piece"/g)||[]).length,2);
 assert.equal(foodProfile('麦乐鸡999999块').quantity,0);
});
test('撤销草稿只恢复已有核价记录，未知报价或请求不一致时拒绝恢复',()=>{
 const rounds=[{round:'1',comboItemList:[{code:'x',quantity:1}]}];
 const plan={roundList:rounds,request:{items:[{roundList:rounds}]},priceStatus:'calculated',priceFen:2500,observedAt:'2026-10-12T01:00:00Z',dirty:true,changes:{'1':'other'}};
 const restored=restoreQuotedPlan(plan);
 assert.equal(restored.dirty,false);assert.equal(restored.changes,undefined);assert.equal(restored.priceFen,2500);assert.equal(restored.observedAt,plan.observedAt);assert.equal(plan.dirty,true);
 assert.equal(restoreQuotedPlan({...plan,priceFen:undefined}),null);
 assert.equal(restoreQuotedPlan({...plan,request:{items:[{roundList:[]}]}}),null);
});
test('三方案的价格图比较保留最低价和最大价差，待核算时暂停比较',()=>{
 assert.deepEqual(comparePlans([{priceFen:2500},{priceFen:2300},{priceFen:2600}],3000),{kind:'different',cheaperIndex:1,differenceFen:300});
 assert.deepEqual(comparePlans([{priceFen:2500},{priceFen:2500},{priceFen:2500}],3000),{kind:'same'});
 assert.deepEqual(comparePlans([{priceFen:2500},{priceFen:2300,dirty:true},{priceFen:2600}],3000),{kind:'pending'});
 assert.equal(foodProfile('无糖可乐中杯').size,'medium');assert.ok(foodArt('无糖可乐中杯').includes('中</text>'));assert.ok(foodArt('无糖可乐大杯').includes('大</text>'));
});

const quotedContext={storeCode:'store',budget:'30',preference:'burger',priority:'variety',flavor:'any',cup:'medium',sugarFree:true,city:'北京',keyword:'大钟寺'};
test('修改预算与口味、杯型或门店后旧核价立即不可用，恢复同条件可用原记录',()=>{
 const p={priceFen:2290,withinBudget:true};
 assert.equal(quotedPlanUsable(p,quotedContext,{...quotedContext,budget:'30.00'}),true);
 for(const changes of [{budget:'20'},{cup:'large'},{sugarFree:false},{preference:'chicken'},{priority:'save'},{flavor:'mild'},{storeCode:'other'},{keyword:'知春里'}])assert.equal(quotedPlanUsable(p,quotedContext,{...quotedContext,...changes}),false);
 assert.equal(quotedPlanUsable({...p,dirty:true},quotedContext,quotedContext),false);
 assert.equal(quotedPlanUsable({...p,priceFen:3100},quotedContext,quotedContext),false);
 for(const budget of ['', '3e1', '30.001', '-1'])assert.equal(samePlanContext(quotedContext,{...quotedContext,budget}),false);
});
test('备选说明来自实际主食或小食差异，不猜口味与单项价格',()=>{
 const a={items:['鸡排堡','中薯条','无糖可乐中杯']};
 assert.match(proposalDifference({items:['吉士汉堡','中薯条','无糖可乐中杯']},a),/换主食.*吉士汉堡/);
 assert.match(proposalDifference({items:['鸡排堡','玉米杯','无糖可乐中杯']},a),/换小食.*玉米杯/);
 assert.doesNotMatch(proposalDifference({items:['鸡排堡','中薯条','无糖可乐大杯']},a),/更饱|更健康|便宜/);
});

test('配送地址、场景和餐具改变后旧报价不能继续下单',()=>{const context={...quotedContext,fulfillment:'delivery',addressId:'a',needTableware:false},p={priceFen:2800,withinBudget:true};assert.equal(quotedPlanUsable(p,context,context),true);for(const changes of [{addressId:'b'},{fulfillment:'pickup'},{needTableware:true}])assert.equal(quotedPlanUsable(p,context,{...context,...changes}),false);});
