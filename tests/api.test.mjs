import test from 'node:test';import assert from 'node:assert/strict';
import {requestJSON,createConnectionMonitor,RequestError} from '../web/api.js';import {connectionError} from '../server/errors.mjs';
test('网络失败返回可操作的服务离线提示',async()=>{await assert.rejects(requestJSON('/api/stores',{fetchImpl:async()=>{throw new TypeError('Failed to fetch');}}),e=>e.code==='OFFLINE'&&/启动/.test(e.message)&&!/Failed to fetch/.test(e.message));});
test('非JSON响应不显示原始解析错误或HTML',async()=>{await assert.rejects(requestJSON('/api/status',{fetchImpl:async()=>new Response('<html>bad</html>',{status:502})}),e=>e.code==='INVALID_RESPONSE'&&!e.message.includes('<html>'));});
test('业务错误保留结构化错误码',async()=>{await assert.rejects(requestJSON('/api/stores',{fetchImpl:async()=>Response.json({code:'MCP_AUTH',error:'认证失败'},{status:502})}),e=>e.code==='MCP_AUTH'&&e.status===502);});
test('响应超时与离线分开',async()=>{const fetchImpl=(_,options)=>new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});await assert.rejects(requestJSON('/api/status',{timeoutMs:10,fetchImpl}),e=>e.code==='TIMEOUT');});
test('SDK认证异常不泄露原始信息',()=>{const e=connectionError(new Error('HTTP 401 Bearer sensitive-secret'));assert.equal(e.code,'MCP_AUTH');assert.ok(!e.message.includes('sensitive-secret'));});
const connected={app:'mcd-budget-buddy',version:'0.5.0',dataMode:'live',liveReady:true};
test('后台一次网络失败暂不判离线，重复失败才提示；成功可恢复',async()=>{
 let fail=true;const m=createConnectionMonitor({expectedVersion:'0.5.0',probe:async()=>{if(fail)throw new RequestError('network','OFFLINE');return connected;}});
 m.online(connected);assert.equal((await m.check()).kind,'uncertain');assert.equal((await m.check()).kind,'offline');
 fail=false;assert.equal((await m.check()).kind,'online');assert.equal(m.getState().liveReady,true);
});
test('检查超时与版本错误不能误报成服务离线',async()=>{
 const slow=createConnectionMonitor({expectedVersion:'0.5.0',probe:async()=>{throw new RequestError('timeout','TIMEOUT');}});
 assert.equal((await slow.check({manual:true})).kind,'slow');
 const old=createConnectionMonitor({expectedVersion:'0.5.0',probe:async()=>({...connected,version:'0.4.0'})});
 assert.equal((await old.check()).kind,'incompatible');
});
test('重连重复点击只执行一次检查，失败的旧检查不能覆盖新查询成功',async()=>{
 let rejectProbe,calls=0;const m=createConnectionMonitor({expectedVersion:'0.5.0',probe:()=>{calls++;return new Promise((_,reject)=>{rejectProbe=reject;});}});
 const first=m.check({manual:true}),second=m.check({manual:true});assert.equal(calls,1);assert.equal(first,second);
 m.online(connected);rejectProbe(new RequestError('old failure','OFFLINE'));await first;assert.equal(m.getState().kind,'online');
});
test('已连接但未配置Token仍保持未配置状态',async()=>{
 const m=createConnectionMonitor({expectedVersion:'0.5.0',probe:async()=>({...connected,liveReady:false})});
 const result=await m.check();assert.equal(result.kind,'online');assert.equal(result.liveReady,false);
});

import {requireCompatibleBackend} from '../web/api.js';
test('不兼容或尚未确认的服务不能进入后续业务请求',async()=>{let called=false;const run=async(status)=>{await requireCompatibleBackend(async()=>status);called=true;};await assert.rejects(run({kind:'incompatible',message:'old'}),e=>e.code==='VERSION_MISMATCH');assert.equal(called,false);await assert.rejects(run({kind:'slow'}));assert.equal(called,false);await run({kind:'online',liveReady:true});assert.equal(called,true);});
