import test from 'node:test';import assert from 'node:assert/strict';
import {confirmRecovery,couponContext} from '../shared/checkout-recovery.mjs';
test('确认前金额、券、地址或核价过期明确未创建，可重新核对；网络未知时先查订单',()=>{
 for(const code of ['CHECKOUT_PRICE_CHANGED','CHECKOUT_EXPIRED','PRICE_RESPONSE'])assert.equal(confirmRecovery({code}).action,'review');
 for(const code of ['COUPON_CHANGED','COUPON_SELECTION','CHECKOUT_ADDRESS_CHANGED','CHECKOUT_SELECTION'])assert.equal(confirmRecovery({code}).action,'plans');
 for(const code of ['TIMEOUT','OFFLINE','CHECKOUT_BUSY','CHECKOUT_EXISTING','INVALID_RESPONSE',undefined])assert.equal(confirmRecovery({code}).action,'recent');
});
test('同门店切换配送地址或自取场景时，旧券查询结果不能复用',()=>{
 const input={storeCode:'store',fulfillment:'delivery',addressId:'one'};
 assert.notEqual(couponContext(input),couponContext({...input,addressId:'two'}));
 assert.notEqual(couponContext(input),couponContext({...input,fulfillment:'pickup'}));
 assert.notEqual(couponContext(input),couponContext({...input,storeCode:'other'}));
 assert.equal(couponContext(input),couponContext({...input,budget:'40'}));
});
