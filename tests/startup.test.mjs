import test from 'node:test';import assert from 'node:assert/strict';
import {selectLocalPort} from '../scripts/server-port.mjs';
const current={app:'mcd-budget-buddy',dataMode:'live',version:'current'};
test('默认端口被旧版占用时复用邻近同版本服务；空闲则启动，无需停止其他服务',async()=>{
 const checked=[];const r=await selectLocalPort({version:'current',probe:async port=>{checked.push(port);return port===4326?{...current,version:'old'}:current;}});
 assert.deepEqual(r,{port:4327,existing:true});assert.deepEqual(checked,[4326,4327]);
 assert.deepEqual(await selectLocalPort({version:'current',probe:async port=>port===4326?{}:null}),{port:4327,existing:false});
});
test('显式PORT不静默换端口，超时与未知服务不当作空闲，搜索有上限',async()=>{
 await assert.rejects(selectLocalPort({port:4326,explicit:true,version:'current',probe:async()=>({...current,version:'old'})}),/PORT/);
 let count=0;await assert.rejects(selectLocalPort({version:'current',probe:async()=>{count++;throw Error('timeout');}}),/不可用/);assert.equal(count,10);
 for(const port of [NaN,0,65536,3.5])await assert.rejects(selectLocalPort({port,probe:async()=>null}),/PORT/);
});
