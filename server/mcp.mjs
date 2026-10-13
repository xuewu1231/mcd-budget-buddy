import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Ajv from 'ajv';
import {ServiceError,connectionError} from './errors.mjs';
import {policy} from '../shared/domain.mjs';
const ajv = new Ajv({strict:false,allErrors:true,validateFormats:false});
export function unwrap(result) {
  if (result.isError) throw new ServiceError('麦当劳工具执行失败，请重试。','MCP_TOOL');
  let body = result.structuredContent;
  if (!body) for (const c of result.content || []) if (c.type === 'text') {try {body=JSON.parse(c.text); break;} catch {}}
  if (!body || body.success !== true) throw new ServiceError('麦当劳业务接口未返回成功，已停止推荐；不能将此结果视为无券或无方案。','MCP_BUSINESS');
  if (!('data' in body)) throw new ServiceError('麦当劳接口返回缺少数据，请稍后重试。','MCP_RESPONSE');
  return body.data;
}
export async function connect(token,{checkout=false}={}) {
  const client = new Client({name:'mcd-budget-buddy',version:'0.6.0'});
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.mcd.cn'), {requestInit:{headers:{Authorization:`Bearer ${token}`}}});
  try {
    await client.connect(transport);
    const all = []; let cursor;
    do {const page=await client.listTools(cursor ? {cursor} : {});all.push(...page.tools);cursor=page.nextCursor;} while(cursor);
    const allowed=checkout?[...policy.allowedTools,...policy.checkoutTools]:policy.allowedTools;
    const tools=new Map(all.filter(t=>allowed.includes(t.name)).map(t=>[t.name,t]));
    return {schema:name=>tools.get(name)?.inputSchema,async call(name,args) {
      if (!allowed.includes(name) || !tools.has(name)) throw new Error('工具不在当前流程的允许范围');
      const valid=ajv.compile(tools.get(name).inputSchema);
      if(!valid(args)) throw new Error(`工具参数与实时定义不匹配：${name}`);
      try {return unwrap(await client.callTool({name,arguments:args},undefined,{timeout:25000}));} catch(e){if(e instanceof ServiceError)throw e;throw connectionError(e);}
    },close:()=>client.close()};
  } catch(e) {await client.close().catch(()=>{}); throw connectionError(e);}
}
