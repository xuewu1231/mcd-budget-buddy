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
