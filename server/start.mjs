import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {homedir} from 'node:os';
import {findStores,recommend,recalculate} from './planner.mjs';
import {parseBrief} from '../shared/domain.mjs';
import {discover,compareStores} from './discovery.mjs';
import {ServiceError} from './errors.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4310);
let token=process.env.MCD_MCP_TOKEN?.replace(/^Bearer\s+/i,'').trim();
let authSource=token?'env':'none';
if(!token && process.env.USE_WORKBUDDY_MCP === '1') {
 try {const config=JSON.parse(await readFile(path.join(homedir(),'.workbuddy','mcp.json'),'utf8'));
 const auth=config.mcpServers?.['mcd-mcp']?.headers?.Authorization;
 if(typeof auth==='string' && !auth.includes('${')) {token=auth.replace(/^Bearer\s+/i,'').trim();authSource=token?'workbuddy':'none';}
 } catch {console.log('未能读取有效的本地 WorkBuddy MCP 配置，请先完成真实连接配置。');}
}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const limits=new Map();
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data: https://cms-cdn.mcd.cn https://img.mcd.cn; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 const expected=`http://${req.headers.host}`;
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||req.headers.origin&&req.headers.origin!==expected)return json(res,403,{error:'仅允许本地同源访问'});
 let url;try{url=new URL(req.url,expected);}catch{return json(res,400,{error:'请求地址无效'});}
 if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{app:'mcd-budget-buddy',liveReady:Boolean(token),authSource,dataMode:'live',mode:'local',version:'0.5.0'});
 if(url.pathname==='/api/skill'&&req.method==='GET'){res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(await readFile(path.join(root,'SKILL.md')));return;}
 if(url.pathname.startsWith('/api/')&&req.method==='POST'){
  if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'仅接受 JSON'});
  const key=req.socket.remoteAddress,now=Date.now(),history=(limits.get(key)||[]).filter(t=>now-t<60000);if(history.length>=20)return json(res,429,{error:'请求过于频繁，请稍后重试'});limits.set(key,[...history,now]);
  try {
   let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>16384)throw new Error('请求内容过长');}
   const b=JSON.parse(raw);
   if(url.pathname==='/api/parse')return json(res,200,{...parseBrief(String(b.text||'').slice(0,500)),method:'keyword-rules'});
   if(!['/api/discover','/api/stores','/api/recommend','/api/recalculate','/api/compare'].includes(url.pathname))return json(res,404,{error:'接口不存在'});
   if(b.mode!==undefined&&b.mode!=='live')return json(res,400,{code:'LIVE_ONLY',error:'本应用仅支持真实查询'});
   if(!token)return json(res,409,{code:'NOT_CONFIGURED',error:'麦当劳连接尚未配置。双击“启动麦麦助手.command”使用本机 WorkBuddy 配置，或设置 .env 中的 MCD_MCP_TOKEN 后重启。'});
   if(url.pathname==='/api/discover')return json(res,200,await discover(token));
   if(url.pathname==='/api/stores'){
    const keyword=String(b.keyword||'').trim();if(!keyword||keyword.length>100)throw new Error('请填写有效地点');
    const stores=await findStores(token,String(b.city||'北京').slice(0,30),keyword);
    return json(res,200,{stores,mode:'live'});
   }
   if(typeof b.storeCode!=='string'||b.storeCode.length>60)throw new Error('请先选择门店');
   if(url.pathname==='/api/compare'){if(typeof b.otherStoreCode!=='string'||b.otherStoreCode.length>60||typeof b.code!=='string')throw new Error('请完整选择比价门店与方案');return json(res,200,await compareStores(token,b));}
   if(url.pathname==='/api/recommend')return json(res,200,{...(await recommend(token,b.storeCode,b)),mode:'live'});
   if(url.pathname==='/api/recalculate'){
    if(typeof b.code!=='string'||!b.changes||typeof b.changes!=='object')throw new Error('选配参数缺失');
    return json(res,200,{plan:await recalculate(token,b.storeCode,b.code,b.changes,b),mode:'live'});
   }
   return json(res,404,{error:'接口不存在'});
  }catch(e){return json(res,e instanceof ServiceError?e.status:400,{code:e instanceof ServiceError?e.code:'INVALID_REQUEST',error:e.message.startsWith('Unexpected')?'请求 JSON 无效':e.message.includes('token')||e.message.includes('Bearer')?'连接配置错误，请在本机检查配置':e.message});}
 }
 if(req.method!=='GET')return json(res,405,{error:'方法不支持'});
 const assets={'/':'web/index.html','/app.js':'web/app.js','/api.js':'web/api.js','/discovery.js':'shared/discovery.mjs','/radar.js':'web/radar.js','/styles.css':'web/styles.css','/meal.svg':'web/meal.svg','/manifest.webmanifest':'web/manifest.webmanifest','/icon.svg':'web/icon.svg'};
 const file=assets[url.pathname];if(!file)return json(res,404,{error:'页面不存在'});
 try{const content=await readFile(path.join(root,file));const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};res.setHeader('Cache-Control','no-store');res.writeHead(200,{'Content-Type':`${types[path.extname(file)]}; charset=utf-8`});res.end(content);}catch{json(res,500,{error:'资源读取失败'});}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用，请使用另一端口或确认已有服务。`:'本地服务启动失败');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`麦麦预算助手 http://127.0.0.1:${port} · ${token?'真实连接已配置':'真实连接未配置，请先连接麦当劳 MCP'}`));
