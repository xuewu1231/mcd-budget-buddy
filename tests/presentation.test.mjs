import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetView, comparePlans} from '../web/api.js';

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
