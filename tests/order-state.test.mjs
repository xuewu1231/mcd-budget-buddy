import test from 'node:test';
import assert from 'node:assert/strict';
import {orderState,paymentDeadline,needsOrderWatch,createOrderWatch} from '../shared/order-state.mjs';
test('中文及数字订单状态明确映射，未知状态不推断支付成功',()=>{
 assert.equal(orderState({orderStatus:'待支付'}).status,'1');
 assert.equal(orderState({orderStatus:'订单已取消'}).status,'7');
 assert.equal(orderState({orderStatus:'订单已完成'}).status,'6');
 assert.equal(orderState({orderStatusCode:2,orderStatus:'配餐中'}).status,'2');
 assert.equal(orderState({orderStatus:'准备付款'}).status,'');
});
test('无时区支付截止按北京时间解析；未知期限不造日期',()=>{
 assert.equal(paymentDeadline('2026-10-14 10:00:00'),Date.parse('2026-10-14T02:00:00Z'));
 assert.equal(paymentDeadline('2026-10-14T02:00:00Z'),Date.parse('2026-10-14T02:00:00Z'));
 assert.equal(paymentDeadline('not a date'),null);
});
function harness(load){let time=0,shown=true;const timers=new Map(),results=[],notes=[];let id=0;const watch=createOrderWatch({load,onResult:r=>results.push(r),onNotice:n=>notes.push(n),visible:()=>shown,now:()=>time,schedule:fn=>{timers.set(++id,fn);return id;},cancel:id=>timers.delete(id),duration:60000,maxAttempts:2});return {watch,timers,results,notes,advance:n=>time+=n,visible:b=>shown=b};}
test('付款后等待真实取餐码，取得码立即停止；没有合成取餐码',async()=>{
 let n=0;const h=harness(async()=>({order:{status:'2',pickupCode:n++?'A123':''}}));h.watch.start();await h.watch.refresh();assert.equal(h.watch.isActive(),true);assert.equal(h.results[0].order.pickupCode,'');await h.watch.refresh();assert.equal(h.watch.isActive(),false);assert.equal(h.results[1].order.pickupCode,'A123');assert.equal(h.timers.size,0);
 assert.equal(needsOrderWatch({status:'4',delivery:{}}),false);assert.equal(needsOrderWatch({status:'1',paymentExpired:true}),false);
});
test('并发状态请求合并；关闭后丢弃在途结果',async()=>{
 let resolve,calls=0;const h=harness(()=>{calls++;return new Promise(r=>resolve=r);});h.watch.start();const a=h.watch.refresh(),b=h.watch.refresh();assert.equal(calls,1);h.watch.stop();resolve({order:{status:'1'}});await Promise.all([a,b]);assert.equal(h.results.length,0);assert.equal(h.timers.size,0);
});
test('隐藏页暂停请求、返回立即查询，达到上限或失败停止',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return {order:{status:'1'}};});h.visible(false);h.watch.start();await h.watch.refresh();assert.equal(calls,0);h.visible(true);h.watch.visibilityChanged();await h.watch.refresh();assert.equal(calls,1);h.advance(60001);await h.watch.refresh();assert.equal(h.watch.isActive(),false);assert.equal(h.timers.size,0);
 const error=harness(async()=>{throw new Error('offline');});error.watch.start();await error.watch.refresh();assert.equal(error.watch.isActive(),false);assert.equal(error.results.length,0);assert.match(error.notes.at(-1),/保留上次/);
 const bounded=harness(async()=>({order:{status:'1'}}));bounded.watch.start();await bounded.watch.refresh();await bounded.watch.refresh();await bounded.watch.refresh();assert.equal(bounded.results.length,2);assert.equal(bounded.watch.isActive(),false);
});
