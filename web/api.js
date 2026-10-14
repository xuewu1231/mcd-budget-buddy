export class RequestError extends Error {
  constructor(message, code, status = 0) { super(message); this.name = 'RequestError'; this.code = code; this.status = status; }
}
// A stale health probe cannot override a newer successful business request.
// One background timeout is inconclusive; it does not prove the service stopped.
export function createConnectionMonitor({probe, expectedVersion, onChange = () => {}}) {
  let revision = 0, failures = 0, inFlight = null, status = null;
  const publish = value => { status = value; onChange(value); return value; };
  const online = data => {
    revision++; failures = 0;
    return publish({kind:'online', liveReady:true, ...data});
  };
  const check = ({manual = false} = {}) => {
    if (inFlight) return inFlight;
    const rev = ++revision, previous = status?.kind === 'online' ? status : status?.previous;
    if (manual || !status) publish({kind:'checking', previous});
    const task = async () => {
      try {
        const data = await probe();
        if (data.app !== 'mcd-budget-buddy' || data.dataMode !== 'live') throw new RequestError('这个地址不是当前真实查询服务，请检查启动地址。', 'SERVICE_MISMATCH');
        if (data.version !== expectedVersion) throw new RequestError('本地服务版本较旧，请启动新版服务后再查询。', 'VERSION_MISMATCH');
        if (rev !== revision) return status;
        failures = 0;
        return publish({...data, kind:'online'});
      } catch (error) {
        if (rev !== revision) return status;
        failures++;
        const kind = /MISMATCH/.test(error.code || '') ? 'incompatible' : error.code === 'TIMEOUT' ? 'slow' : manual || failures >= 2 ? 'offline' : 'uncertain';
        return publish({kind, message:error.message, previous});
      }
    };
    inFlight = task().finally(() => { inFlight = null; });
    return inFlight;
  };
  return {check, online, getState:() => status};
}

const motions = new WeakMap(), disclosures = new WeakMap();
const prefersQuiet = () => globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
export function animateFeedback(element, frames, options = {}) {
  if (!element?.animate || prefersQuiet()) return;
  motions.get(element)?.cancel();
  const animation = element.animate(frames, {duration:180, easing:'cubic-bezier(.2,.8,.2,1)', ...options});
  motions.set(element, animation);
  animation.finished.catch(() => {}).finally(() => { if (motions.get(element) === animation) motions.delete(element); });
}
export function setDisclosure(details, open = !(disclosures.get(details)?.open ?? details.open)) {
  const previous = disclosures.get(details);
  const start = details.getBoundingClientRect().height;
  previous?.animation?.cancel();
  const summary = details.querySelector(':scope > summary');
  summary?.setAttribute('aria-expanded', String(open));
  details.dataset.expanded = String(open);
  if (prefersQuiet() || !details.animate) { details.open = open; disclosures.delete(details); return; }
  details.open = true;
  const end = open ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height;
  const animation = details.animate([{height:`${start}px`, overflow:'hidden'}, {height:`${end}px`, overflow:'hidden'}], {duration:210, easing:'cubic-bezier(.2,.8,.2,1)'});
  const state = {open, animation}; disclosures.set(details, state);
  animation.finished.then(() => { if (disclosures.get(details) === state) { details.open = open; disclosures.delete(details); animation.cancel(); } }).catch(() => {});
}
export function installInteractionFeedback(root = document) {
  root.addEventListener('click', event => {
    const summary = event.target.closest('summary');
    if (summary && !event.target.closest('a,button,input,select')) {
      event.preventDefault();
      const details = summary.parentElement;
      setDisclosure(details, !(disclosures.get(details)?.open ?? details.open));
      return;
    }
    const button = event.target.closest('button:not(:disabled)');
    if (button && !button.matches('.burger-play')) animateFeedback(button, [{transform:'scale(.97)'}, {transform:'scale(1)'}], {duration:130});
  }, true);
}
export async function requestJSON(url, {body, timeoutMs = 15000, fetchImpl = globalThis.fetch} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, {method:body === undefined ? 'GET' : 'POST', headers:body === undefined ? {} : {'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:controller.signal, cache:'no-store'});
    } catch (e) {
      if (controller.signal.aborted) throw new RequestError('请求等待超时。请检查连接后重试；本次没有取得可用结果。', 'TIMEOUT');
      throw new RequestError('无法连接本地点餐服务。请启动项目中的“启动麦麦助手.command”，保持终端运行，再点击重连。', 'OFFLINE');
    }
    let data;
    try { data = await response.json(); }
    catch { if(controller.signal.aborted)throw new RequestError('响应读取超时，请稍后重试。','TIMEOUT');throw new RequestError('服务返回了非 JSON 内容。请检查启动的是否是麦麦预算助手，并刷新页面。', 'INVALID_RESPONSE', response.status); }
    if (!response.ok) throw new RequestError(data.error || `请求失败（HTTP ${response.status}）`, data.code || 'HTTP_ERROR', response.status);
    return data;
  } finally {clearTimeout(timer);}
}

// Presentation uses confirmed integer fen only; it never infers a discount.
export function budgetView(priceFen, budgetFen, dirty = false) {
  if (dirty) return {kind: 'pending'};
  if (!Number.isSafeInteger(priceFen) || priceFen < 0 || !Number.isSafeInteger(budgetFen) || budgetFen <= 0) return {kind: 'unknown'};
  const percent = Math.round(priceFen / budgetFen * 100);
  return {kind: priceFen <= budgetFen ? 'within' : 'over', percent, fill: Math.min(100, percent), remainingFen: budgetFen - priceFen};
}

export function samePlanContext(quoted, current) {
  const key = input => {
    if (!input || !input.storeCode || !/^\d+(\.\d{1,2})?$/.test(String(input.budget ?? '').trim())) return null;
    const budget = Number(input.budget);
    if (!String(input.budget ?? '').trim() || !Number.isFinite(budget) || budget < 1 || budget > 1000) return null;
    return JSON.stringify([String(input.storeCode), budget, input.preference || 'any', input.priority || 'save', input.flavor || 'any', input.cup || 'any', input.sugarFree === true, String(input.city || '').trim(), String(input.keyword || '').trim(),input.fulfillment||'pickup',input.addressId||'',input.needTableware===true,input.useCoupons===true]);
  };
  const a = key(quoted), b = key(current);
  return a !== null && a === b;
}
export function quotedPlanUsable(plan, quoted, current) {
  return Boolean(plan) && samePlanContext(quoted, current) && !plan.dirty && plan.withinBudget === true && budgetView(plan.priceFen, Math.round(Number(current.budget) * 100)).kind === 'within';
}
export function proposalDifference(plan, first) {
  if (!first || plan === first) return '先看这套，再挑备选';
  if (plan.items[0] !== first.items[0]) return `换主食 · ${plan.items[0]}`;
  const changes = plan.items.slice(1, -1).filter(name => !first.items.slice(1, -1).includes(name));
  return changes.length ? `换小食 · ${changes.join('、')}` : '另一份已核算搭配';
}

export function comparePlans(plans, budgetFen) {
  if (plans.length < 2 || plans.length > 3) return {kind: 'unavailable'};
  if (plans.some(p => p.dirty)) return {kind: 'pending'};
  if (plans.some(p => budgetView(p.priceFen, budgetFen).kind !== 'within')) return {kind: 'unavailable'};
  const amounts=plans.map(p=>p.priceFen),lowest=Math.min(...amounts);
  const differenceFen = Math.max(...amounts)-lowest;
  if (!differenceFen) return {kind: 'same'};
  return {kind: 'different', cheaperIndex: amounts.indexOf(lowest), differenceFen};
}

// Category chips filter text only; they do not establish offer eligibility.
export function activityMatches(event, category = 'all', query = '') {
  const text = `${event.title || ''} ${event.content || ''}`.normalize('NFKC').toLowerCase();
  const patterns = {breakfast:/早餐|早八|早班|厚松饼/, new:/上新|新品|焕新/, collab:/联名|联动|peaceminusone|g-dragon/};
  return (category === 'all' || Boolean(patterns[category]?.test(text))) && text.includes(String(query).normalize('NFKC').trim().toLowerCase());
}

const iconPaths = {
  "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M7 3v4M17 3v4M3 10h18M7 14h2M13 14h2M7 18h2\"/>",
  "meal": "<path d=\"M4 10c0-4 3-7 8-7s8 3 8 7H4Z M3 14h18M4 17h16v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1Z M8 7h.01M12 5h.01M16 7h.01\"/>",
  "location": "<path d=\"M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>",
  "compare": "<path d=\"M4 7h15l-3-3M20 17H5l3 3M4 7l3 3M20 17l-3-3\"/>",
  "settings": "<path d=\"M4 6h16M4 12h16M4 18h16\"/><circle cx=\"8\" cy=\"6\" r=\"2\" fill=\"white\"/><circle cx=\"16\" cy=\"12\" r=\"2\" fill=\"white\"/><circle cx=\"10\" cy=\"18\" r=\"2\" fill=\"white\"/>",
  "arrow": "<path d=\"M4 12h15M13 5l7 7-7 7\"/>",
  "refresh": "<path d=\"M20 7v5h-5M4 17v-5h5\"/><path d=\"M6 7a7 7 0 0 1 12-1l2 3M18 17a7 7 0 0 1-12 1l-2-3\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
  "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 5 5\"/>",
  "star": "<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z\"/>",
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5\"/>",
  "moon": "<path d=\"M20 15.5A9 9 0 0 1 8.5 4a9 9 0 1 0 11.5 11.5Z\"/>",
  "sparkle": "<path d=\"m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z\"/>",
  "ticket": "<path d=\"M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Z M15 7v2M15 12v2M15 17v2\"/>",
  "close": "<path d=\"m6 6 12 12M18 6 6 18\"/>",
  "check": "<path d=\"m5 12 4 4L19 6\"/>",
  "zoom": "<path d=\"M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7\"/>"
};
export function icon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.sparkle}</svg>`;}

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function roundChoices(round, strict) {
  return (round.choices || []).filter(x => !strict || !/饮料|饮品/.test(round.name || '') || (/无糖|零糖|zero sugar|sugar free/i.test(x.name || '') && !/非无糖/.test(x.name || '')));
}
export function selectedChoice(plan, round) {
  const code = plan.changes?.[String(round.id)] || plan.roundList.find(x => x.round === String(round.id))?.comboItemList[0]?.code;
  return round.choices.find(x => String(x.code) === String(code));
}

// Visual profiles distinguish shapes only. They are never used to infer ingredients,
// nutrition, availability, options, or prices. Unknown names get a neutral dish.
export function foodKind(name = '') {
  const n=String(name).normalize('NFKC');
  if(/麦满分/.test(n))return 'muffin';
  if(/厚松饼.*堡/.test(n))return 'pancakeburger';
  const rules=[[/薯饼/,'hashbrown'],[/油条/,'youtiao'],[/香肠/,'sausage'],[/薯条/,'fries'],[/玉米/,'corn'],[/麦旋风/,'mcflurry'],[/圆筒|甜筒/,'icecream'],[/派(?:\d|$|\s)|苹果派|菠萝派|香芋派/,'pie'],[/蘸酱|风味酱|酱料/,'sauce'],[/麦满分/,'muffin'],[/厚松饼.*堡/,'pancakeburger'],[/松饼|煎饼/,'pancake'],[/卷/,'wrap'],[/鸡翅/,'wings'],[/麦乐鸡|鸡块/,'nuggets'],[/咖啡|冰咖|鲜萃.*咖|美式|拿铁|奶铁|卡布奇诺/,'coffee'],[/豆浆/,'soymilk'],[/黑巧|热巧克力/,'chocolate'],[/牛奶/,'milk'],[/果汁|苹果汁|橙汁|黄金橙橙/,'juice'],[/红茶|绿茶|茶饮/,'tea'],[/可乐|雪碧|汽水|怡泉/,'soda'],[/鱼.*堡|麦香鱼/,'fishburger'],[/牛.*堡|巨无霸|吉士汉堡/,'beefburger'],[/鸡.*堡|鸡排堡/,'chickenburger'],[/堡/,'burger'],[/粥/,'porridge'],[/蛋/,'egg']];
  return rules.find(([pattern])=>pattern.test(n))?.[1] || 'unknown';
}
export function foodProfile(name='') {
 const n=String(name).normalize('NFKC'),kind=foodKind(n);
 const size=/大杯|大薯/.test(n)?'large':/小杯|小薯/.test(n)?'small':/中杯|中薯/.test(n)?'medium':'regular';
 const layers=/三层/.test(n)?3:/双层|双牛|巨无霸/.test(n)?2:1;
 const quantity=Number(n.match(/(\d+)\s*块/)?.[1]||0);
 return {kind,size,layers,quantity:quantity>=1&&quantity<=12?quantity:0,spicy:/辣|龙焰/.test(n),iced:/冰|冷/.test(n),zero:/无糖|零糖/.test(n)&&!/非无糖/.test(n),heart:/心形/.test(n),grilled:/板烧/.test(n),chocolate:/巧克力|朱古力/.test(n),berry:/蓝莓|莓果/.test(n)};
}
export function foodArt(name) {
 const p=foodProfile(name),group=(cls,body)=>`<g class="${cls}">${body}</g>`;
 const flecks='<path d="m37 29 3-1m11 9 3 2m11-14 3 2m9 10 3-1m-27 16 3-1m16 2 3 1m9-9 3 1" fill="none" stroke="#c58931" stroke-width="2"/>';
 const potato='<g transform="rotate(-12 60 60)"><rect x="20" y="36" width="80" height="45" rx="20" fill="#edb543"/><path d="m34 48 3-1m11 8 3 2m9-14 3 2m9 13 3-1m-34 11 3-1m17 2 3 1m14-9 3 1m-7-15 3 1" fill="none" stroke="#c58931" stroke-width="2"/></g>';
 const heart='<path d="M60 38q-25-27-39-6Q4 52 60 90q56-38 39-58-14-21-39 6Z" fill="#edb543"/>'+flecks;
 const burger=()=>{
  const muffin=p.kind==='muffin',pancake=p.kind==='pancakeburger';
  const bun=muffin?'<path d="M22 43q0-19 38-19t38 19Z" fill="#ead5a6"/><path d="M28 33h64" stroke="#cdb27d" stroke-width="2"/>':pancake?'<rect x="20" y="26" width="80" height="18" rx="9" fill="#db9d43"/><path d="M29 33h62" stroke="#f4d699"/>':'<path d="M20 42q5-29 40-29t40 29Z" fill="#f3bd59"/><path d="m37 27 4-2m13-5 4 2m15 7 4-2" stroke="#fff4cf" stroke-width="3"/>';
  let pattyColor=p.kind==='beefburger'?'#6d4030':p.kind==='fishburger'?'#e2aa54':p.spicy?'#c86d30':p.grilled?'#ae7845':'#d89943';
  let middle='';
  for(let i=0;i<p.layers;i++){
   const grooves=p.grilled?`<path d="m35 ${60+i*10} 6 5m12-5 6 5m12-5 6 5" stroke="#77522f"/>`:'';
   middle+=group(`art-patty art-patty-${i}`,`<rect x="23" y="${57+i*10}" width="74" height="11" rx="4" fill="${pattyColor}"/>${grooves}`);
  }
  const egg=muffin&&/蛋/.test(String(name))?group('art-cheese','<ellipse cx="60" cy="53" rx="32" ry="6" fill="#fffaf0"/><ellipse cx="59" cy="53" rx="17" ry="4" fill="#ffd454"/>'):group('art-cheese','<path d="m23 55 74-1-19 11-17-6-17 7Z" fill="#ffd650"/>');
  const bottomY=72+(p.layers-1)*10;
  return group('art-bun',bun)+group('art-lettuce','<path d="m23 47 9-4 9 4 10-4 10 4 10-4 10 4 13-4 3 8-13 4-10-3-11 3-10-3-11 3-9-3-10 2Z" fill="#86a65a"/>')+middle+egg+group('art-bottom',`<path d="M23 ${bottomY}h74q-2 15-18 15H41q-16 0-18-15Z" fill="${muffin?'#dac38e':pancake?'#d79843':'#e7aa50'}"/>`);
 };
 let body;
 if(['burger','chickenburger','beefburger','fishburger','muffin','pancakeburger'].includes(p.kind))body=burger();
 else if(p.kind==='hashbrown')body=group('art-snack',p.heart?heart:potato);
 else if(p.kind==='youtiao')body=group('art-snack','<g transform="rotate(16 60 60)"><path d="M37 23q9-10 17 0l-2 66q-7 9-15 0Z" fill="#e9af43"/><path d="M57 21q9-10 17 0l-2 68q-7 9-15 0Z" fill="#f2c264"/><path d="M47 26v58M66 25v58" stroke="#c99034" stroke-width="3"/><path d="m39 40 12-2m-12 15 12-2m10 4 11-2m-11 16 11-2" stroke="#d39b3b"/></g>');
 else if(p.kind==='sausage')body=group('art-snack','<path d="M26 79q7-39 48-42 21-2 23 10 1 10-15 13-25 5-36 25-10 17-20-6Z" fill="#bc754f"/><path d="m43 57 8 9m6-19 8 10m8-14 5 8" stroke="#86462e" stroke-width="3"/><path d="m26 82-7 4m76-38 7-4" stroke="#b9784e" stroke-width="4"/>');
 else if(p.kind==='fries')body=group('art-fries',[27,41,55,69,83].map((x,i)=>`<rect class="art-fry art-fry-${i}" x="${x}" y="${[18,11,20,13,25][i]}" width="9" height="${[51,61,48,56,42][i]}" rx="2" fill="#ffcd52"/>`).join(''))+group('art-box','<path d="M22 47q38 15 76 0L88 92H32Z" fill="#db0007"/><path d="M45 76q15 10 30 0" fill="none" stroke="#ffdc6a" stroke-width="4"/>');
 else if(p.kind==='wings')body=group('art-pieces',Array.from({length:p.quantity||2},(_,i)=>{const x=(i%3)*28+20,y=Math.floor(i/3)*25+37;return `<g class="art-piece"><path d="M${x} ${y}q-2-13 10-14 13 0 17 14 8 1 9 8 0 8-10 8-12-1-17-8-8 1-9-8Z" fill="#cd8740"/><path d="m${x+10} ${y-3} 4 5m1-11 4 5" stroke="#99612c"/></g>`;}).join(''));
 else if(p.kind==='nuggets')body=group('art-pieces',Array.from({length:p.quantity||4},(_,i)=>{const count=p.quantity||4,cols=count>6?4:count>4?3:2,x=18+i%cols*(80/cols),y=24+Math.floor(i/cols)*23,w=count>6?17:24;return `<g class="art-piece"><rect x="${x}" y="${y}" width="${w}" height="20" rx="7" fill="#e2a34a"/><path d="m${x+7} ${y+7} 3 2" stroke="#bd8130"/></g>`;}).join(''));
 else if(p.kind==='corn')body=group('art-cup','<path d="M26 43h68l-8 48H34Z" fill="#db0007"/>')+group('art-lid','<ellipse cx="60" cy="43" rx="34" ry="13" fill="#ffce45"/><g fill="#ffe377" stroke="#dfa826" stroke-width="1"><ellipse cx="44" cy="40" rx="6" ry="4"/><ellipse cx="61" cy="37" rx="6" ry="4"/><ellipse cx="76" cy="41" rx="6" ry="4"/><ellipse cx="53" cy="48" rx="6" ry="4"/><ellipse cx="68" cy="47" rx="6" ry="4"/></g>');
 else if(p.kind==='soymilk'||p.kind==='milk'&&/热|温/.test(String(name)))body=group('art-cup',`<path d="M32 39h51v38q0 16-25 16T32 77Z" fill="${p.kind==='soymilk'?'#e6d0a5':'#fff9ea'}"/><path d="M84 46q21-1 18 14-1 14-19 12" fill="none" stroke="#b99769" stroke-width="4"/><ellipse cx="58" cy="39" rx="25" ry="6" fill="#f8ead0"/>`)+group('art-steam','<path d="M44 29q-5-7 0-14m14 14q-5-7 0-14m14 14q-5-7 0-14" fill="none" stroke="#b6a998"/>');
 else if(p.kind==='milk')body=group('art-cup','<path d="m37 30 8-13h30l8 13v61H37Z" fill="#fffef4"/><path d="M37 48h46v32H37Z" fill="#90b9d4"/><path d="M45 17v13h38M62 30v61" fill="none" stroke="#c1d4df"/><path d="M47 62h25" stroke="#fff" stroke-width="4"/>');
 else if(p.kind==='coffee'||p.kind==='tea'||p.kind==='chocolate'){
  const hot=!p.iced,color=p.kind==='tea'?'#ba6242':p.kind==='chocolate'?'#654131':/拿铁|奶铁|卡布奇诺/.test(String(name))?'#b58b66':'#865638';
  body=group('art-cup',`<path d="M31 38h58l-7 54H38Z" fill="${hot?color:'#e9d8b3'}"/>${!hot?'<path d="M35 52h50l-5 32H40Z" fill="#986a46"/><path d="m48 57 7 2-2 8-7-2m17-4 8 1-1 8-8-1" fill="#d0e4e3"/>':'<path d="M43 62h34" stroke="#f6dfb2" stroke-width="4"/>'}`)+group('art-lid','<path d="M29 36h62v7H29Z" fill="#393638"/><path d="M35 31h50v6H35Z" fill="#575253"/>')+group('art-steam',hot?'<path d="M46 24q-6-7 0-14m15 14q-6-7 0-14m15 14q-6-7 0-14" stroke="#b5a899" fill="none"/>':'<path d="M68 10h10l-8 23" stroke="#db0007" fill="none" stroke-width="3"/>');
 }
 else if(p.kind==='soda'||p.kind==='juice'){
  const juice=p.kind==='juice',sprite=/雪碧/.test(String(name)),color=juice?'#ecaa44':/怡泉/.test(String(name))?'#c8a54d':sprite?'#559f73':'#db0007';
  body=group('art-straw','<path d="M71 9h12v6H76l-7 29" fill="none" stroke="#db0007" stroke-width="4"/>')+group('art-cup',`<path d="M30 34h60l-8 61H38Z" fill="#fffdf3"/><path d="m34 52 53-3-4 29-46 3Z" fill="${color}"/>${p.zero?'<text x="60" y="72" text-anchor="middle" fill="#fff" stroke="none" font-size="18" font-weight="800">0</text>':juice?'<circle cx="60" cy="65" r="9" fill="#ffe091"/><path d="M60 56v18m-9-9h18" stroke="#edaf45"/>':'<path d="M49 65h22" stroke="#fff8dd" stroke-width="4"/>'}`)+group('art-lid','<ellipse cx="60" cy="34" rx="31" ry="7" fill="#fff7d7"/>');
 }
 else if(p.kind==='mcflurry')body=group('art-cup','<path d="M30 48h60l-8 44H38Z" fill="#f4e1b1"/><path d="M34 66h52v13H34Z" fill="#db0007"/>')+group('art-lid',`<path d="M28 49q-3-15 11-19 0-17 14-16 13-13 20 3 20-3 18 18 13 5 4 16Z" fill="#fff8ec"/><g fill="${p.berry?'#826291':p.chocolate?'#76503c':'#d9ae4a'}"><circle cx="45" cy="36" r="4"/><circle cx="65" cy="25" r="4"/><circle cx="77" cy="41" r="4"/></g>`);
 else if(p.kind==='icecream')body=group('art-cup','<path d="M38 53h44L61 97Z" fill="#eab369"/><path d="m45 58 26 23m-4-25-18 22" stroke="#c58e49"/>')+group('art-lid',`<path d="M34 53q-4-10 9-15-4-11 8-15-1-9 10-15 15 6 11 18 15 4 7 15 12 7 7 12Z" fill="${p.chocolate?'#9b6a48':'#fff8e8'}"/>`);
 else if(p.kind==='pie')body=group('art-snack','<rect x="23" y="35" width="74" height="43" rx="9" fill="#e4ac55"/><path d="m36 43 7 25m12-25 7 25m12-25 7 25M30 38v33M91 39v31" stroke="#bd8137" stroke-width="2"/>');
 else if(p.kind==='pancake')body=group('art-snack','<ellipse cx="60" cy="78" rx="38" ry="10" fill="#d79843"/><ellipse cx="60" cy="63" rx="38" ry="10" fill="#e6b264"/><ellipse cx="60" cy="48" rx="38" ry="10" fill="#f2c47b"/><path d="M54 43h16v11H54Z" fill="#ffdf82"/>');
 else if(p.kind==='wrap')body=group('art-snack','<path d="m30 38 55-10 7 61-40 5Z" fill="#ecd4a2"/><path d="m37 36 44-8-1 20-35 7Z" fill="#85a554"/><path d="m41 41 35-6-2 11-29 7Z" fill="#d29b51"/><path d="m39 57 43 16m-37 4 38 7" stroke="#c6a779"/>');
 else if(p.kind==='sauce')body=group('art-cup','<path d="M30 49h60l-9 36H39Z" fill="#fff3d1"/>')+group('art-lid',`<ellipse cx="60" cy="49" rx="32" ry="13" fill="${p.spicy?'#bd5734':'#e6b346'}"/>`);
 else if(p.kind==='porridge')body=group('art-cup','<path d="M24 46h72q-4 42-36 42T24 46Z" fill="#fff4d8"/><ellipse cx="60" cy="46" rx="36" ry="11" fill="#e4d8b2"/><path d="m38 45 4 2m9-6 4 2m11 4 4 2m9-6 4 2" stroke="#b5a679"/>');
 else if(p.kind==='egg')body=group('art-snack','<path d="M30 33q15-12 28-1 27-15 35 12 18 17-1 34-25 14-50 0-22-6-17-27-10-10 5-18Z" fill="#fff9e9"/><circle cx="60" cy="56" r="18" fill="#ffce4a"/>');
 else body=group('art-snack','<ellipse cx="60" cy="71" rx="38" ry="12" fill="#faf3e2"/><path d="M60 37v17m0 8v2" stroke="#b3a78e" stroke-width="5" stroke-linecap="round"/>');
 const size=p.size==='large'?'':p.size==='medium'?'translate(10 17) scale(.8)':p.size==='small'?'translate(19 30) scale(.63)':'';
 const portion=p.size==='regular'?'':`<g class="food-size-label"><circle cx="100" cy="15" r="11" fill="#fff5ce" stroke="#d7b45e"/><text x="100" y="19" text-anchor="middle" fill="#735116" stroke="none" font-size="12" font-weight="750">${{large:'大',medium:'中',small:'小'}[p.size]}</text></g>`;
 return `<svg class="food-art food-${p.kind}" data-food-kind="${p.kind}" viewBox="0 0 120 110" aria-hidden="true"><ellipse class="art-shadow" cx="60" cy="98" rx="39" ry="5" fill="#00000009"/><g transform="${size}" stroke="#4b3827" stroke-width="1.5" stroke-linejoin="round">${body}</g>${portion}</svg>`;
}

export function restoreQuotedPlan(plan) {
 if(plan.priceStatus!=='calculated'||!Number.isSafeInteger(plan.priceFen)||plan.priceFen<0||!plan.request?.items?.[0]?.roundList)return null;
 if(JSON.stringify(plan.roundList)!==JSON.stringify(plan.request.items[0].roundList))return null;
 return {...plan,changes:undefined,dirty:false};
}

export function priceChart(rows, budgetFen, label = '核算总价对比') {
  if (!rows.length || rows.some(r => r.dirty || !Number.isSafeInteger(r.priceFen) || r.priceFen < 0) || !Number.isSafeInteger(budgetFen) || budgetFen <= 0) return '';
  const max = Math.max(budgetFen, ...rows.map(r => r.priceFen));
  const scale = n => Math.round(n / max * 480);
  const height = rows.length * 82 + 42;
  const budgetX = 20 + scale(budgetFen);
  const summary = rows.map(r => `${r.label} ${(r.priceFen / 100).toFixed(2)}元`).join('，');
  return `<figure class="price-chart"><figcaption><strong>${escapeHTML(label)}</strong><span>总价 · 元</span></figcaption><svg viewBox="0 0 540 ${height}" role="img" aria-label="${escapeHTML(summary)}，预算${(budgetFen / 100).toFixed(2)}元"><line class="chart-budget" x1="${budgetX}" x2="${budgetX}" y1="18" y2="${height - 25}"/>${rows.map((r,i) => `<g><text x="20" y="${25 + i*82}" class="chart-name">${escapeHTML(r.label)}</text><rect class="chart-track" x="20" y="${38+i*82}" width="480" height="22" rx="11"/><rect class="chart-bar ${i===2?'third':i?'alternate':''}" x="20" y="${38+i*82}" width="${scale(r.priceFen)}" height="22" rx="11"/><text x="510" y="${27+i*82}" text-anchor="end" class="chart-amount">¥${(r.priceFen/100).toFixed(2)}</text></g>`).join('')}<text x="20" y="${height-4}" class="chart-axis">0</text><text x="510" y="${height-4}" text-anchor="end" class="chart-axis">预算 ¥${(budgetFen/100).toFixed(2)} · 虚线</text></svg><p>从 0 起比较实际核价；预算余量不代表优惠。套餐子项未单独报价，不拆分金额。</p></figure>`;
}

export function enhanceMedia(root) {
  root.querySelectorAll('img[data-media]').forEach(img => {
    const frame = img.parentElement;
    frame.classList.add('media-loading');
    const caption = document.createElement('span');
    caption.className = 'media-caption'; caption.textContent = '海报加载中'; caption.setAttribute('aria-hidden','true');
    frame.append(caption);
    const originalLabel = frame.getAttribute('aria-label');
    const ready = () => {frame.classList.remove('media-loading','media-error');frame.classList.add('media-ready');caption.remove();if(originalLabel)frame.setAttribute('aria-label',originalLabel);};
    const failed = () => {
      frame.classList.remove('media-loading','media-ready');frame.classList.add('media-error');caption.textContent = '海报暂未加载 · 原文仍可查看';
      if(originalLabel)frame.setAttribute('aria-label',`${originalLabel}，海报未加载，可查看原文`);
      else {caption.removeAttribute('aria-hidden');caption.setAttribute('role','status');}
      if(frame.tagName !== 'BUTTON' && !frame.querySelector('.media-retry')) {
        const retry = document.createElement('button');retry.type='button';retry.className='media-retry';retry.textContent='重试图片';
        retry.onclick=()=>{retry.remove();frame.classList.remove('media-error');frame.classList.add('media-loading');caption.textContent='海报加载中';img.src=img.src;};
        frame.append(retry);
      }
    };
    img.addEventListener('load',ready);img.addEventListener('error',failed);
    if(img.complete)img.naturalWidth ? ready() : failed();
  });
}

export async function requireCompatibleBackend(check){
 const status=await check();if(status?.kind!=='online')throw new RequestError(status?.message||'服务尚未确认，请重新检查连接。',status?.kind==='incompatible'?'VERSION_MISMATCH':'CONNECTION_UNCONFIRMED');return status;
}
