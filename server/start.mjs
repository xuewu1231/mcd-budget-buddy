import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {homedir} from 'node:os';
import {findStores,recommend,recalculate} from './planner.mjs';
import {demoStores,demoRecommend,demoRecalculate} from './demo.mjs';
import {parseBrief} from '../shared/domain.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4310);
let token=process.env.MCD_MCP_TOKEN?.replace(/^Bearer\s+/i,'').trim();
if(!token && process.env.USE_WORKBUDDY_MCP === '1') {
 try {const config=JSON.parse(await readFile(path.join(homedir(),'.workbuddy','mcp.json'),'utf8'));
 const auth=config.mcpServers?.['mcd-mcp']?.headers?.Authorization;
 if(typeof auth==='string' && !auth.includes('${')) token=auth.replace(/^Bearer\s+/i,'').trim();
 } catch {console.log('未能读取有效的本地 WorkBuddy MCP 配置，演示模式仍可用。');}
}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const limits=new Map();
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 const expected=`http://${req.headers.host}`;
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||req.headers.origin&&req.headers.origin!==expected)return json(res,403,{error:'仅允许本地同源访问'});
 let url;try{url=new URL(req.url,expected);}catch{return json(res,400,{error:'请求地址无效'});}
 if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{liveReady:Boolean(token),mode:'local',version:'0.2.0'});
 if(url.pathname==='/api/skill'&&req.method==='GET'){res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(await readFile(path.join(root,'SKILL.md')));return;}
 if(url.pathname.startsWith('/api/')&&req.method==='POST'){
  if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'仅接受 JSON'});
  const key=req.socket.remoteAddress,now=Date.now(),history=(limits.get(key)||[]).filter(t=>now-t<60000);if(history.length>=20)return json(res,429,{error:'请求过于频繁，请稍后重试'});limits.set(key,[...history,now]);
  try {
   let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>16384)throw new Error('请求内容过长');}
   const b=JSON.parse(raw);
   if(url.pathname==='/api/parse')return json(res,200,{...parseBrief(String(b.text||'').slice(0,500)),method:'keyword-rules'});
   if(!['demo','live'].includes(b.mode))throw new Error('请选择演示或真实模式');
   if(b.mode==='live'&&!token)return json(res,409,{error:'真实模式尚未配置：在电脑的 .env 中设置 MCD_MCP_TOKEN，再重启服务。'});
   if(url.pathname==='/api/stores'){
    const keyword=String(b.keyword||'').trim();if(!keyword||keyword.length>100)throw new Error('请填写有效地点');
    const stores=b.mode==='demo'?demoStores:await findStores(token,String(b.city||'北京').slice(0,30),keyword);
    return json(res,200,{stores,mode:b.mode});
   }
   if(typeof b.storeCode!=='string'||b.storeCode.length>60)throw new Error('请先选择门店');
   if(url.pathname==='/api/recommend')return json(res,200,{...(b.mode==='demo'?demoRecommend(b.storeCode,b):await recommend(token,b.storeCode,b)),mode:b.mode});
   if(url.pathname==='/api/recalculate'){
    if(typeof b.code!=='string'||!b.changes||typeof b.changes!=='object')throw new Error('选配参数缺失');
    return json(res,200,{plan:b.mode==='demo'?demoRecalculate(b.storeCode,b.code,b.changes,b):await recalculate(token,b.storeCode,b.code,b.changes,b),mode:b.mode});
   }
   return json(res,404,{error:'接口不存在'});
  }catch(e){return json(res,400,{error:e.message.startsWith('Unexpected')?'请求 JSON 无效':e.message.includes('token')||e.message.includes('Bearer')?'连接配置错误，请在本机检查配置':e.message});}
 }
 if(req.method!=='GET')return json(res,405,{error:'方法不支持'});
 const assets={'/':'web/index.html','/app.js':'web/app.js','/styles.css':'web/styles.css','/meal.svg':'web/meal.svg','/manifest.webmanifest':'web/manifest.webmanifest','/icon.svg':'web/icon.svg'};
 const file=assets[url.pathname];if(!file)return json(res,404,{error:'页面不存在'});
 try{const content=await readFile(path.join(root,file));const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};res.writeHead(200,{'Content-Type':`${types[path.extname(file)]}; charset=utf-8`});res.end(content);}catch{json(res,500,{error:'资源读取失败'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`麦麦预算助手 http://127.0.0.1:${port} · ${token?'真实连接已配置':'演示可用，真实连接未配置'}`));
