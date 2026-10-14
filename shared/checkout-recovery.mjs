// Only these server rejections are known to happen before create-order.
const preflight = new Set(['CHECKOUT_EXPIRED','CHECKOUT_PRICE_CHANGED','CHECKOUT_OVER_BUDGET','CHECKOUT_TAKEWAY','CHECKOUT_ADDRESS_CHANGED','CHECKOUT_STORE','CHECKOUT_SELECTION','CHECKOUT_INPUT','CHECKOUT_CONFIRM','COUPON_CHANGED','COUPON_SELECTION','PRICE_RESPONSE']);
const reselect = new Set(['COUPON_CHANGED','COUPON_SELECTION','CHECKOUT_SELECTION','CHECKOUT_STORE','CHECKOUT_ADDRESS_CHANGED','CHECKOUT_OVER_BUDGET']);
export function confirmRecovery(error){
 if(reselect.has(error?.code))return {action:'plans',message:'本次未创建订单。请回到方案重新选择并核价。'};
 return preflight.has(error?.code)?{action:'review',message:'本次未创建订单。请重新核价并核对，再决定是否下单。'}:{action:'recent',message:'创建结果尚未确认，请先查看最近订单或官方 App，不要重复下单。'};
}
export function couponContext(input={}){
 return JSON.stringify([input.storeCode||'',input.fulfillment||'pickup',input.addressId||'']);
}
