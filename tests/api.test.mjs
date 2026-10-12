import test from 'node:test';import assert from 'node:assert/strict';
import {requestJSON} from '../web/api.js';import {connectionError} from '../server/errors.mjs';
test('网络失败返回可操作的服务离线提示',async()=>{await assert.rejects(requestJSON('/api/stores',{fetchImpl:async()=>{throw new TypeError('Failed to fetch');}}),e=>e.code==='OFFLINE'&&/启动/.test(e.message)&&!/Failed to fetch/.test(e.message));});
test('非JSON响应不显示原始解析错误或HTML',async()=>{await assert.rejects(requestJSON('/api/status',{fetchImpl:async()=>new Response('<html>bad</html>',{status:502})}),e=>e.code==='INVALID_RESPONSE'&&!e.message.includes('<html>'));});
test('业务错误保留结构化错误码',async()=>{await assert.rejects(requestJSON('/api/stores',{fetchImpl:async()=>Response.json({code:'MCP_AUTH',error:'认证失败'},{status:502})}),e=>e.code==='MCP_AUTH'&&e.status===502);});
test('响应超时与离线分开',async()=>{const fetchImpl=(_,options)=>new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});await assert.rejects(requestJSON('/api/status',{timeoutMs:10,fetchImpl}),e=>e.code==='TIMEOUT');});
test('SDK认证异常不泄露原始信息',()=>{const e=connectionError(new Error('HTTP 401 Bearer sensitive-secret'));assert.equal(e.code,'MCP_AUTH');assert.ok(!e.message.includes('sensitive-secret'));});
