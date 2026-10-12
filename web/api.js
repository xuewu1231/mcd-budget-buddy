export class RequestError extends Error {
  constructor(message, code, status = 0) { super(message); this.name = 'RequestError'; this.code = code; this.status = status; }
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

export function comparePlans(plans, budgetFen) {
  if (plans.length !== 2) return {kind: 'unavailable'};
  if (plans.some(p => p.dirty)) return {kind: 'pending'};
  if (plans.some(p => budgetView(p.priceFen, budgetFen).kind !== 'within')) return {kind: 'unavailable'};
  const differenceFen = Math.abs(plans[0].priceFen - plans[1].priceFen);
  if (!differenceFen) return {kind: 'same'};
  return {kind: 'different', cheaperIndex: plans[0].priceFen < plans[1].priceFen ? 0 : 1, differenceFen};
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

// Illustrations classify names for display only, never for dietary eligibility.
export function foodKind(name = '') {
  if (/薯条|薯饼/.test(name)) return 'fries';
  if (/玉米/.test(name)) return 'corn';
  if (/咖啡|美式|红茶|牛奶|饮料|可乐|雪碧|果汁/.test(name)) return 'drink';
  if (/堡/.test(name)) return 'burger';
  if (/鸡|翅/.test(name)) return 'chicken';
  return 'meal';
}
export function foodArt(name) {
  const kind = foodKind(name);
  const art = {
    burger:'<g class="food-bun"><path d="M22 43Q28 14 60 14T98 43Z" fill="#f3bd59"/><path d="m42 29 4-2m12-6 4 2m14 8 4-2" stroke="#fff4ca" stroke-width="3"/></g><path d="m23 49 12-5 12 5 12-5 12 5 12-5 14 5v7H23Z" fill="#84a954"/><rect x="22" y="56" width="76" height="14" rx="6" fill="#65402e"/><path d="m26 57 60-1-17 12-12-7-13 9Z" fill="#ffce35"/><path d="M23 75h74q-2 15-18 15H41Q25 90 23 75Z" fill="#e6a74a"/>',
    fries:'<g fill="#ffcd52"><rect x="27" y="18" width="10" height="51" rx="2"/><rect x="41" y="11" width="10" height="61" rx="2"/><rect x="55" y="20" width="10" height="48" rx="2"/><rect x="69" y="13" width="10" height="56" rx="2"/><rect x="83" y="25" width="9" height="42" rx="2"/></g><path d="M22 47q38 15 76 0L88 92H32Z" fill="#db0007"/><path d="M45 76q15 10 30 0" fill="none" stroke="#ffdc6a" stroke-width="4"/>',
    drink:'<path d="M71 9h12v6H76l-7 29" fill="none" stroke="#db0007" stroke-width="4"/><path d="M30 34h60l-8 61H38Z" fill="#fffdf3"/><ellipse cx="60" cy="34" rx="31" ry="7" fill="#fff7d7"/><path d="m34 52 53-3-4 29-46 3Z" fill="#db0007"/><path d="M49 65h22" stroke="#fff8dd" stroke-width="4"/>',
    chicken:'<g fill="#e6a445"><path d="M24 39q-3-13 13-13t18 15q2 17-15 21T24 39Z"/><path d="M65 35q3-14 17-10t15 19q-2 14-18 13T65 35Z"/><path d="M45 64q5-17 21-10t13 22q-5 15-21 11T45 64Z"/></g><g stroke="#c18431" stroke-width="2"><path d="m33 41 4 4m40-9 4 3m-20 34 3 3"/></g>',
    corn:'<path d="M26 43h68l-8 48H34Z" fill="#db0007"/><ellipse cx="60" cy="43" rx="34" ry="13" fill="#ffce45"/><g fill="#ffe377" stroke="#dfa826" stroke-width="1"><ellipse cx="44" cy="40" rx="6" ry="4"/><ellipse cx="61" cy="37" rx="6" ry="4"/><ellipse cx="76" cy="41" rx="6" ry="4"/><ellipse cx="53" cy="48" rx="6" ry="4"/><ellipse cx="68" cy="47" rx="6" ry="4"/></g>',
    meal:'<path d="M24 70h72v7q0 15-20 15H44q-20 0-20-15Z" fill="#ffbc0d"/><path d="M28 62q0-32 32-32t32 32H28Z" fill="#f5c66c"/><path d="M60 20v7M43 19l4 6M77 19l-4 6" stroke="#db0007" stroke-width="3"/>'
  };
  const size = kind === 'drink' && /大杯/.test(name || '') ? 'translate(-6 -5) scale(1.1)' : kind === 'drink' && /小杯/.test(name || '') ? 'translate(6 10) scale(.9)' : '';
  return `<svg class="food-art food-${kind}" viewBox="0 0 120 110" aria-hidden="true"><ellipse cx="60" cy="97" rx="44" ry="6" fill="#00000009"/><g transform="${size}" stroke="#4b3827" stroke-width="1.5" stroke-linejoin="round">${art[kind]}</g></svg>`;
}

export function priceChart(rows, budgetFen, label = '核算总价对比') {
  if (!rows.length || rows.some(r => r.dirty || !Number.isSafeInteger(r.priceFen) || r.priceFen < 0) || !Number.isSafeInteger(budgetFen) || budgetFen <= 0) return '';
  const max = Math.max(budgetFen, ...rows.map(r => r.priceFen));
  const scale = n => Math.round(n / max * 480);
  const height = rows.length * 82 + 42;
  const budgetX = 20 + scale(budgetFen);
  const summary = rows.map(r => `${r.label} ${(r.priceFen / 100).toFixed(2)}元`).join('，');
  return `<figure class="price-chart"><figcaption><strong>${escapeHTML(label)}</strong><span>总价 · 元</span></figcaption><svg viewBox="0 0 540 ${height}" role="img" aria-label="${escapeHTML(summary)}，预算${(budgetFen / 100).toFixed(2)}元"><line class="chart-budget" x1="${budgetX}" x2="${budgetX}" y1="18" y2="${height - 25}"/>${rows.map((r,i) => `<g><text x="20" y="${25 + i*82}" class="chart-name">${escapeHTML(r.label)}</text><rect class="chart-track" x="20" y="${38+i*82}" width="480" height="22" rx="11"/><rect class="chart-bar ${i ? 'alternate' : ''}" x="20" y="${38+i*82}" width="${scale(r.priceFen)}" height="22" rx="11"/><text x="510" y="${27+i*82}" text-anchor="end" class="chart-amount">¥${(r.priceFen/100).toFixed(2)}</text></g>`).join('')}<text x="20" y="${height-4}" class="chart-axis">0</text><text x="510" y="${height-4}" text-anchor="end" class="chart-axis">预算 ¥${(budgetFen/100).toFixed(2)} · 虚线</text></svg><p>从 0 起比较实际核价；预算余量不代表优惠。套餐子项未单独报价，不拆分金额。</p></figure>`;
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
