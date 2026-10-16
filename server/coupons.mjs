import {createHash} from 'node:crypto';
import {ServiceError} from './errors.mjs';
const text=x=>typeof x==='string'&&x.trim()?x.trim():null;
export function storeCoupons(data){
 if(!Array.isArray(data))throw new ServiceError('门店优惠券格式未确认，不能据此用券。','COUPON_RESPONSE');
 const usable=[],unsupported=[];
 for(const row of data){if(!row||typeof row!=='object'||Array.isArray(row)){unsupported.push({name:'未识别优惠券',reason:'券信息格式未确认，暂不能自动核价'});continue;}
  const name=text(row.title)||'未命名优惠券',id=text(row.couponId),code=text(row.couponCode);
  const products=Array.isArray(row.products)?row.products.filter(p=>p&&text(p.productCode)).map(p=>({code:text(p.productCode),name:text(p.productName)||'餐品名称未返回'})):[];
  if(!id||!code||!products.length){unsupported.push({name,reason:'缺少券编码或适用餐品，暂不能自动核价'});continue;}
  for(const product of products){const ref=createHash('sha256').update(JSON.stringify([id,code,product.code])).digest('hex');usable.push({ref,id,code,name,product,validity:text(row.tradeDateTime)});}
 }
 return {usable,unsupported,count:data.length};
}
export const couponView=c=>({ref:c.ref,name:c.name,product:c.product,validity:c.validity});
export const publicQuoteRequest=request=>({...request,items:request.items.map(({couponId,couponCode,...item})=>item)});
export async function queryOwnedCoupons(m,scope){
 const [store,wallet]=await Promise.allSettled([
  m.call('query-store-coupons',scope).then(storeCoupons),
  m.call('query-my-coupons',{page:'1',pageSize:'200'})
 ]);
 const list=store.status==='fulfilled'?store.value:null;
 const total=wallet.status==='fulfilled'?wallet.value?.totalCount:null;
 const accountReady=Number.isSafeInteger(total)&&total>=0;
 const walletReason=wallet.status==='rejected'?wallet.reason?.code:null;
 const accountError=accountReady?null:wallet.status==='fulfilled'?'卡包数量格式未确认，不代表没有券。':walletReason==='MCP_AUTH'?'卡包认证未通过，请检查麦当劳连接；不代表没有券。':walletReason==='MCP_SCHEMA'?'卡包接口参数已变化，请更新版本后重试；不代表没有券。':'卡包暂时无法读取，可点击更新已有券重试；不代表没有券。';
 return {ownedTotal:accountReady?total:null,accountStatus:accountReady?'ready':wallet.status==='fulfilled'?'unknown':'error',accountError,
  storeStatus:list?'ready':'error',storeError:list?null:'当前门店适用券暂时无法读取，请重试，暂不能确定是否有可用券。',
  count:list?.count??null,coupons:list?list.usable.map(couponView):[],unsupported:list?.unsupported||[],observedAt:new Date().toISOString()};
}
export function couponForProduct(list,productCode,ref){return list.usable.find(c=>c.product.code===productCode&&(!ref||c.ref===ref));}
export function withCoupon(request,coupon){return {...request,items:request.items.map((item,i)=>i===0?{...item,couponId:coupon.id,couponCode:coupon.code}:item)};}
export async function resolveCoupon(m,scope,productCode,ref){
 if(!ref)return null;if(typeof ref!=='string'||!/^[a-f0-9]{64}$/.test(ref))throw new ServiceError('优惠券选择无效，请重新核价。','COUPON_SELECTION',400);
 const coupons=storeCoupons(await m.call('query-store-coupons',scope)),c=couponForProduct(coupons,productCode,ref);
 if(!c)throw new ServiceError('这张券已变化，或不适用于当前门店、用餐方式和餐品，请重新核价。','COUPON_CHANGED',409);return c;
}
export async function quoteWithOwnedCoupon(m,args,coupons,{enabled=false}={}){
 const baseline=await m.call('calculate-price',args);if(!Number.isSafeInteger(baseline.price)||baseline.price<0)throw new ServiceError('无券价格未确认，停止用券比较。','PRICE_RESPONSE');
 const coupon=enabled&&coupons?couponForProduct(coupons,args.items[0].productCode):null;
 if(!coupon)return {price:baseline,request:args,coupon:null};
 const request=withCoupon(args,coupon);let discounted;
 try{discounted=await m.call('calculate-price',request);if(!Number.isSafeInteger(discounted.price)||discounted.price<0)throw new Error('Invalid price');}
 catch{return {price:baseline,request:args,coupon:null,couponIssue:{name:coupon.name,reason:'该券核价未成功，本方案保留无券报价，可更新价格重试'}};}
 if(discounted.price>=baseline.price)return {price:baseline,request:args,coupon:null,couponIssue:{name:coupon.name,reason:discounted.price===baseline.price?'用券核价未更便宜，未选择消耗这张券':'用券核价更高，保留无券方案'}};
 return {price:discounted,request,coupon:{...couponView(coupon),baselinePriceFen:baseline.price,differenceFen:baseline.price-discounted.price,evidence:'相同选配分别提交无券和用券核算；差额是两次整单报价之差，最终用券以创建订单校验为准'}};
}
