import {position} from '../shared/store-view.mjs';
import {ServiceError} from './errors.mjs';
export function fulfillment(input={}){const kind=input.fulfillment??'pickup';if(!['pickup','delivery'].includes(kind))throw new ServiceError('暂只支持到店自取或麦乐送。','SCENARIO',400);return kind;}
export function maskedPhone(value){return /^\d{11}$/.test(String(value))?String(value).slice(0,3)+'****'+String(value).slice(-4):'手机未返回';}
export function addressView(a){return {id:String(a.addressId),fullAddress:String(a.fullAddress||''),contactName:String(a.contactName||''),phoneHint:maskedPhone(a.phone)};}
export async function addresses(m){const data=await m.call('delivery-query-addresses',{});if(!Array.isArray(data?.addresses))throw new ServiceError('配送地址格式未确认，无法继续。','ADDRESS_RESPONSE');return data.addresses.filter(a=>typeof a.addressId==='string'&&a.addressId&&typeof a.fullAddress==='string'&&a.fullAddress);}
export async function deliveryStores(m,addressId){const all=await addresses(m);const address=all.find(a=>a.addressId===addressId);if(!address)throw new ServiceError('配送地址已变化，请重新读取并选择。','ADDRESS_CHANGED',409);const data=await m.call('delivery-query-stores',{addressId,beType:2});if(!Array.isArray(data))throw new ServiceError('配送门店格式未确认，无法继续。','DELIVERY_STORES');return {address:addressView(address),stores:data.filter(s=>s.businessStatus!==false&&typeof s.storeCode==='string'&&typeof s.beCode==='string'&&s.beCode).map(s=>({code:s.storeCode,beCode:s.beCode,name:String(s.storeName||''),address:'配送范围由官方接口确认',distance:null,position:position(s.longitude,s.latitude)}))};}
export async function resolveScenario(m,input,storeCode,{verifyStore=false}={}){
 const kind=fulfillment(input);
 if(kind==='delivery'){
  if(typeof input.addressId!=='string'||!input.addressId||input.addressId.length>100)throw new ServiceError('请先选择配送地址。','ADDRESS_REQUIRED',400);
  const result=await deliveryStores(m,input.addressId),store=result.stores.find(s=>s.code===storeCode);if(!store)throw new ServiceError('该门店当前不能配送到所选地址，请重新选店。','DELIVERY_UNAVAILABLE',409);
  return {scope:{storeCode,orderType:2,beType:2,beCode:store.beCode},addressId:input.addressId,address:result.address,store,fulfillment:kind};
 }
 let store;if(verifyStore){const data=await m.call('query-nearby-stores',{beType:1,searchType:2,city:String(input.city||'北京').slice(0,30),keyword:String(input.keyword||'').slice(0,100)});const s=Array.isArray(data)&&data.find(s=>String(s.storeCode)===storeCode&&s.businessStatus!==false);if(!s)throw new ServiceError('这家门店未出现在当前结果中，请重新选择。','CHECKOUT_STORE',409);store={name:String(s.storeName||''),address:String(s.address||'')};}
 return {scope:{storeCode,orderType:1,beType:1},store,fulfillment:kind};
}
export function feeView(price){const fields={product:'productPrice',delivery:'deliveryPrice',packing:'packingPrice',tableware:'tablewarePrice'};return Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,Number.isSafeInteger(price[field])&&price[field]>=0?price[field]:null]));}
