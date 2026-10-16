import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {recommend,recalculate} from '../server/planner.mjs';
import {checkoutService} from '../server/checkout.mjs';
import {repriceCurrentPlans} from '../web/api.js';
const detail={name:'链路测试套餐',rounds:[
 {id:1,name:'主食',choices:[{code:'burger',name:'鸡排堡',isDefault:true},{code:'beef',name:'牛肉汉堡'}]},
 {id:2,name:'小食',choices:[{code:'fries',name:'中薯条',isDefault:true},{code:'potato',name:'脆薯饼'}]},
 {id:3,name:'饮料',choices:[{code:'sweet',name:'可乐中杯',isDefault:true},{code:'zero',name:'无糖可乐中杯'}]}
]};
// Injected MCP fixtures only; no real order or payment request is made.
for(const fulfillment of ['pickup','delivery'])test(`${fulfillment}完整链路：推荐、换选配、用券重算、确认、重复防护、支付入口与官方状态回查`,async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'meal-flow-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const calls=[];let paid=false,beCode='delivery-business';
 const input={storeCode:'store',budget:'40',fulfillment,sugarFree:true,useCoupons:true,city:'北京',keyword:'公开测试地点',...(fulfillment==='delivery'?{addressId:'address',needTableware:true}:{})};
 const scoped=args=>{assert.equal(args.beType,fulfillment==='delivery'?2:1);assert.equal(args.orderType,fulfillment==='delivery'?2:1);assert.equal(args.beCode,fulfillment==='delivery'?beCode:undefined);};
 const price=args=>{scoped(args);assert.equal(args.items[0].roundList[2].comboItemList[0].code,'zero');assert.equal(args.needTableware,fulfillment==='delivery');return 2500+(args.items[0].roundList[1].comboItemList[0].code==='potato'?100:0)+(fulfillment==='delivery'?700:0)-(args.items[0].couponId?300:0);};
 const order={orderId:'fixture-flow-order',orderStatus:'1',realTotalAmount:fulfillment==='delivery'?'30.00':'23.00',storeName:'公开测试门店',orderProductList:[{productName:detail.name,quantity:1,comboItemList:[{itemName:'无糖可乐中杯',itemQuantity:1}]}]};
 const openMcp=async()=>({schema:()=>({properties:{items:{items:{properties:{roundList:{}}}}}}),close:async()=>{},call:async(name,args)=>{
  calls.push({name,args});
  if(name==='delivery-query-addresses')return {addresses:[{addressId:'address',fullAddress:'测试配送楼',contactName:'测试',phone:'13800000000'}]};
  if(name==='delivery-query-stores')return [{storeCode:'store',beCode,storeName:'公开测试门店',businessStatus:true}];
  if(name==='query-nearby-stores')return [{storeCode:'store',storeName:'公开测试门店',address:'公开测试地址'}];
  if(name==='query-meals'){scoped(args);return {meals:{combo:{name:detail.name,currentPrice:'25'}}};}
  if(name==='query-store-coupons'){scoped(args);return [{title:'已有测试券',couponId:'private-id',couponCode:'private-code',products:[{productCode:'combo',productName:detail.name}]}];}
  if(name==='query-meal-detail'){scoped(args);return detail;}
  if(name==='calculate-price')return {price:price(args),deliveryPrice:fulfillment==='delivery'?600:0,packingPrice:fulfillment==='delivery'?100:0,tablewarePrice:0,takeWayList:[{code:'away',title:'打包带走'}]};
  if(name==='create-order'){price(args);assert.equal(args.items[0].couponCode,'private-code');assert.equal(args.addressId,fulfillment==='delivery'?'address':undefined);assert.equal(args.takeWayCode,fulfillment==='pickup'?'away':undefined);return {orderId:order.orderId,payH5Url:'https://m.mcd.cn/mcp/scanToPay?orderId='+order.orderId,orderDetail:order};}
  if(name==='query-order')return {...order,orderStatus:paid?'2':'1',...(paid&&fulfillment==='pickup'?{pickupCode:'FIXTURE123'}:{}),...(fulfillment==='delivery'?{deliveryInfo:{deliveryAddress:'测试配送楼'}}:{})};
  throw new Error('Fixture has no nutrition data');
 }});
 const result=await recommend('fixture','store',input,{openMcp});assert.equal(result.plans.length,3);assert.ok(result.plans[0].coupon);assert.equal(JSON.stringify(result.plans).includes('private-code'),false);
 const chosen=result.plans[0],changes={1:'burger',2:'potato',3:'zero'};
 const revised=await recalculate('fixture','store',chosen.id,changes,{...input,couponRef:chosen.coupon.ref},{openMcp});assert.equal(revised.priceFen,fulfillment==='delivery'?3000:2300);assert.equal(revised.coupon.differenceFen,300);
 const load=body=>recalculate('fixture',body.storeCode,body.code,body.changes,body,{openMcp}).then(plan=>({plan}));
 const [without]=await repriceCurrentPlans([revised],{...input,useCoupons:false},{load});assert.equal(without.priceFen,revised.priceFen+300);assert.equal(without.coupon,null);assert.deepEqual(without.roundList,revised.roundList);
 const [again]=await repriceCurrentPlans([without],input,{load});assert.equal(again.priceFen,revised.priceFen);assert.deepEqual(again.roundList,revised.roundList);assert.equal(again.coupon.name,'已有测试券');
 const checkout=checkoutService({openMcp,journal:path.join(dir,'receipts.json')});
 const prepared=await checkout.prepare('fixture',{...input,code:chosen.id,changes,couponRef:revised.coupon.ref});assert.equal(prepared.priceFen,revised.priceFen);assert.equal(calls.some(c=>c.name==='create-order'),false);
 const confirm={draftId:prepared.draftId,confirm:true,...(fulfillment==='pickup'?{takeWayCode:'away'}:{remark:'测试备注'})};
 if(fulfillment==='delivery'){beCode='changed-business';await assert.rejects(checkout.confirm('fixture',confirm),e=>e.code==='CHECKOUT_ADDRESS_CHANGED');assert.equal(calls.some(c=>c.name==='create-order'),false);beCode='delivery-business';}
 const receipt=await checkout.confirm('fixture',confirm);assert.equal(receipt.state,'created');assert.equal((await checkout.confirm('fixture',confirm)).receiptId,receipt.receiptId);
 assert.ok((await checkout.payment('fixture',receipt.receiptId)).qrDataUrl);paid=true;const fresh=await checkout.refresh('fixture',receipt.receiptId);assert.equal(fresh.order.status,'2');assert.equal(fresh.order.payUrl,null);assert.equal(fresh.order.pickupCode,fulfillment==='pickup'?'FIXTURE123':'');
 assert.equal((await checkout.payment('fixture',receipt.receiptId)).qrDataUrl,null);assert.equal(calls.filter(c=>c.name==='create-order').length,1);
});
