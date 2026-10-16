import test from 'node:test';import assert from 'node:assert/strict';
import {canRepriceCurrentPlans,repriceCurrentPlans,quotedPlanUsable,ownedCouponMarkup} from '../web/api.js';
const context={storeCode:'store',budget:'30',useCoupons:true,sugarFree:true,cup:'medium',preference:'burger',fulfillment:'pickup'};
const roundList=[{round:'1',comboItemList:[{code:'burger',quantity:1}]},{round:'3',comboItemList:[{code:'large-zero',quantity:1}]}];
const plan={id:'combo',name:'原搭配',priceFen:2490,withinBudget:true,roundList,coupon:{ref:'owned-ref'}};
test('预算、券与餐具变化可保留搭配重算；换门店地址或口味杯型需重新推荐',()=>{
 for(const change of [{budget:'10'},{useCoupons:false},{needTableware:true}])assert.equal(canRepriceCurrentPlans(context,{...context,...change}),true);
 for(const change of [{storeCode:'other'},{addressId:'other'},{fulfillment:'delivery'},{cup:'large'},{preference:'chicken'},{sugarFree:false},{flavor:'spicy'},{budget:'0'}])assert.equal(canRepriceCurrentPlans(context,{...context,...change}),false);
});
test('关券重算保持大杯与手动选配，不携带旧券引用，成功后新报价才可用',async()=>{
 const old={...plan,changes:{1:'beef'}},before=structuredClone(old),current={...context,useCoupons:false};let sent;
 const [fresh]=await repriceCurrentPlans([old],current,{load:async body=>{sent=body;return {plan:{...plan,roundList:roundList.map(r=>r.round==='1'?{...r,comboItemList:[{code:'beef',quantity:1}]}:r),priceFen:2790,coupon:null}};}});
 assert.deepEqual(old,before);assert.equal(sent.changes['3'],'large-zero');assert.equal(sent.changes['1'],'beef');assert.equal(sent.couponRef,undefined);assert.equal(quotedPlanUsable(old,context,current),false);assert.equal(quotedPlanUsable(fresh,current,current),true);
});
test('重算部分失败或服务端偷偷改变杯型时不产生可用的新方案集',async()=>{
 const original=[structuredClone(plan),{...structuredClone(plan),id:'second'}],before=structuredClone(original);let calls=0;
 await assert.rejects(repriceCurrentPlans(original,context,{load:async()=>{if(++calls===2)throw Error('timeout');return {plan};}}),/timeout/);assert.deepEqual(original,before);
 await assert.rejects(repriceCurrentPlans([plan],context,{load:async()=>({plan:{...plan,roundList:[roundList[0],{round:'3',comboItemList:[{code:'medium-zero',quantity:1}]}]}})}),e=>e.code==='SELECTION_CHANGED');
 const [over]=await repriceCurrentPlans([plan],{...context,budget:'10'},{load:async()=>({plan:{...plan,withinBudget:false}})});assert.equal(quotedPlanUsable(over,{...context,budget:'10'},{...context,budget:'10'}),false);
});
test('卡包与门店状态独立展示，不把未确认当0或透传HTML',()=>{
 const base={ownedTotal:0,accountStatus:'ready',accountError:null,storeStatus:'ready',storeError:null,count:0,coupons:[],unsupported:[],observedAt:'2026-10-16T02:00:00Z'};
 assert.match(ownedCouponMarkup(base),/我的卡包/);assert.match(ownedCouponMarkup(base),/0 张/);
 const html=ownedCouponMarkup({...base,ownedTotal:null,count:null,accountStatus:'error',storeStatus:'error',accountError:'<script>no</script>'});assert.doesNotMatch(html,/0 张|<script>/);assert.match(html,/读取未确认/);assert.match(html,/&lt;script&gt;/);
});
