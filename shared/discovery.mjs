const imageHosts = new Set(['cms-cdn.mcd.cn','img.mcd.cn']);
export function publicImage(value) {
 try {const u=new URL(value);return u.protocol==='https:'&&imageHosts.has(u.hostname)&&!u.username&&!u.password&&!u.search?u.href:null;}catch{return null;}
}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function checkDate(value){if(!validDate(value))throw new Error('请选择有效的日期');return value;}
export function clockMinutes(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('请选择有效时间');return Number(value.slice(0,2))*60+Number(value.slice(3));}
export function timeHint(event,date,time){
 checkDate(date);const minutes=clockMinutes(time),c=event.couponInfo;
 if(!c)return {kind:'unknown',text:event.startHint?`官方提示：${event.startHint}`:'未提供结构化使用时段'};
 const begin=String(c.tradeStartDate||'').slice(0,10),end=String(c.tradeEndDate||'').slice(0,10);
 if((validDate(begin)&&date<begin)||(validDate(end)&&date>end))return {kind:'outside',text:'所选日期不在券使用日期内'};
 const weekday=new Date(date+'T00:00:00Z').getUTCDay()+1;
 if(Array.isArray(c.weekdays)&&c.weekdays.length&&!c.weekdays.includes(weekday))return {kind:'outside',text:'所选星期不符合券规则'};
 if(c.isAllTradeTime===1)return {kind:'match',text:'时段条件匹配 · 门店适用性待核验'};
 const ranges=(c.tradeTimePeriods||[]).flatMap(p=>{try{return [{start:clockMinutes(p.startTime),end:clockMinutes(p.endTime),label:`${p.startTime}–${p.endTime}`}];}catch{return [];}});
 if(!ranges.length)return {kind:'unknown',text:'未提供可核验的使用时段'};
 const matches=ranges.some(r=>r.start<=r.end?minutes>=r.start&&minutes<r.end:minutes>=r.start||minutes<r.end);
 return {kind:matches?'match':'outside',text:matches?'时段条件匹配 · 门店适用性待核验':`使用时段 ${ranges.map(r=>r.label).join(' / ')}`};
}
export function normalizeCalendar(data,clock){
 if(!data||!Array.isArray(data.dailyList))throw new Error('活动日历结构未确认');
 const days=data.dailyList.filter(d=>validDate(d.date)&&Array.isArray(d.events)).map(d=>({date:d.date,events:d.events.map((e,i)=>({
  id:`${d.date}-${i}`,date:d.date,title:String(e.activityTitle?.trim()||e.articleDto?.title||'活动信息'),
  content:String(e.articleDto?.content||e.activitySubTitle||''),type:Number(e.eventType),
  image:publicImage(e.activityBgImg)||publicImage(e.articleDto?.imgList?.[0])||publicImage(e.couponImage),
  startHint:String(e.button?.subText||''),couponInfo:e.couponInfo?{isAllTradeTime:e.couponInfo.isAllTradeTime,tradeStartDate:e.couponInfo.tradeStartDate,tradeEndDate:e.couponInfo.tradeEndDate,tradeTimePeriods:e.couponInfo.tradeTimePeriods,weekdays:e.couponInfo.weekdays}:null
 }))}));
 if(!clock||!validDate(clock.date)||!Number.isFinite(clock.timestamp))throw new Error('服务器时间未确认');
 return {days,serverDate:clock.date,serverTime:String(clock.formatted||clock.datetime).slice(11,16),observedAt:new Date(clock.timestamp).toISOString(),scope:'活动日历与宣传信息不等于该门店可用优惠；价格与适用性需另行核算。'};
}
export function normalizeAvailableCoupons(data){if(!Array.isArray(data))throw new Error('可领券列表结构未确认');return data.slice(0,30).map((c,i)=>({id:String(i),name:String(c.couponName||'优惠券'),status:String(c.couponStatus||''),label:String(c.label||'状态未确认'),image:publicImage(c.couponImage)}));}
export function compareQuotes(first,second){
 if(!Number.isSafeInteger(first.priceFen)||!Number.isSafeInteger(second.priceFen)||first.priceFen<0||second.priceFen<0)throw new Error('比价金额未确认');
 if(first.id!==second.id||JSON.stringify(first.roundList)!==JSON.stringify(second.roundList))throw new Error('两店选配不一致，不能作为同款比价');
 return {differenceFen:Math.abs(first.priceFen-second.priceFen),cheaper:first.priceFen===second.priceFen?'same':first.priceFen<second.priceFen?'first':'second'};
}
