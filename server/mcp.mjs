import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Ajv from 'ajv';
import {policy} from '../shared/domain.mjs';
const ajv = new Ajv({strict:false,allErrors:true,validateFormats:false});
export function unwrap(result) {
  if (result.isError) throw new Error('MCP 工具返回错误');
  let body = result.structuredContent;
  if (!body) for (const c of result.content || []) if (c.type === 'text') {try {body=JSON.parse(c.text); break;} catch {}}
  if (!body || body.success !== true) throw new Error('业务响应未明确成功，停止推荐');
  if (!('data' in body)) throw new Error('工具响应缺少数据');
  return body.data;
}
export async function connect(token) {
  const client = new Client({name:'mcd-budget-buddy',version:'0.2.0'});
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.mcd.cn'), {requestInit:{headers:{Authorization:`Bearer ${token}`}}});
  try {
    await client.connect(transport);
    const all = []; let cursor;
    do {const page=await client.listTools(cursor ? {cursor} : {});all.push(...page.tools);cursor=page.nextCursor;} while(cursor);
    const tools=new Map(all.filter(t=>policy.allowedTools.includes(t.name)).map(t=>[t.name,t]));
    return {async call(name,args) {
      if (!policy.allowedTools.includes(name) || !tools.has(name)) throw new Error('工具不在允许的查询范围');
      const valid=ajv.compile(tools.get(name).inputSchema);
      if(!valid(args)) throw new Error(`工具参数与实时定义不匹配：${name}`);
      return unwrap(await client.callTool({name,arguments:args},undefined,{timeout:25000}));
    },close:()=>client.close()};
  } catch(e) {await client.close().catch(()=>{}); throw new Error('无法连接麦当劳 MCP，请检查本地 Token 和网络');}
}
