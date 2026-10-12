import policy from './policy.json' with { type: 'json' };
export { policy };
export function yuanToFen(value) {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('金额需为非负数，最多两位小数');
  const [whole, frac = ''] = text.split('.');
  const n = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('金额过大');
  return n;
}
export const money = fen => (fen / 100).toFixed(2);
export function requirements(input) {
  const budgetFen = yuanToFen(input.budget);
  if (budgetFen < 100 || budgetFen > 100000) throw new Error('预算请填写 1—1000 元');
  const preference = ['any', 'burger', 'chicken'].includes(input.preference) ? input.preference : 'any';
  return {budgetFen, preference, sugarFree: input.sugarFree === true};
}
export function parseBrief(text) {
  const budget = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块)/)?.[1];
  return { ...(budget ? {budget} : {}), ...(text.includes('汉堡') ? {preference:'burger'} : text.includes('麦乐鸡') || text.includes('鸡块') ? {preference:'chicken'} : {}), ...(text.includes('无糖') ? {sugarFree:true} : {}) };
}
export function explicitlySugarFree(name) { return new RegExp(policy.strictSugarFreePattern,'i').test(name) && !/非无糖/.test(name); }
export function makeSelection(detail, strict, changes = {}) {
  const rounds = detail.rounds;
  if (!Array.isArray(rounds) || !rounds.length) throw new Error('套餐选配信息缺失');
  return rounds.map(r => {
    const options = r.choices || [];
    const drink = /饮料|饮品/.test(r.name || '');
    const eligible = drink && strict ? options.filter(x => explicitlySugarFree(x.name || '')) : options;
    const selected = changes[String(r.id)] ? eligible.find(x => String(x.code) === String(changes[String(r.id)])) : eligible.find(x => x.isDefault === true) || eligible[0];
    if (!selected) throw new Error(drink && strict ? '没有明确标注无糖的饮料选项' : '选配不在可用范围');
    if ((r.minQuantity && r.minQuantity > 1) || (r.minCount && r.minCount > 1)) throw new Error('暂不支持该套餐的多选轮次');
    return {round:String(r.id),comboItemList:[{code:String(selected.code),quantity:1}]};
  });
}
export function mainMatches(name, preference) {
  return preference === 'any' ? /汉堡|鸡排堡|麦乐鸡|鸡腿|鸡块/.test(name) : preference === 'burger' ? /汉堡|鸡排堡|牛堡|鸡堡/.test(name) : /麦乐鸡|鸡块/.test(name);
}
export function selectionNames(detail, roundList) {
  return roundList.map(r => (detail.rounds.find(x => String(x.id) === r.round)?.choices || []).find(x => String(x.code) === r.comboItemList[0].code)?.name || '未知选项');
}
export function verifyPlan(req, detail, constraints, priceFen) {
  if (req.beType !== 1 || req.orderType !== 1) throw new Error('仅支持到店自取');
  const item = req.items?.[0];
  if (!item || req.items.length !== 1 || item.quantity !== 1) throw new Error('套餐数量无效');
  const canonical = makeSelection(detail, constraints.sugarFree, Object.fromEntries((item.roundList || []).map(r => [r.round,r.comboItemList?.[0]?.code])));
  if (JSON.stringify(canonical) !== JSON.stringify(item.roundList)) throw new Error('选配结构不完整或数量不一致');
  if (priceFen !== undefined && (!Number.isSafeInteger(priceFen) || priceFen < 0)) throw new Error('价格不是有效整数分');
  return priceFen === undefined || priceFen <= constraints.budgetFen;
}
export function menuEntries(data) {
  if (!data || !data.meals || typeof data.meals !== 'object' || Array.isArray(data.meals)) throw new Error('菜单结构与已验证格式不一致，请在 WorkBuddy 核对当前工具返回');
  return Object.entries(data.meals).map(([code,x])=>({code,name:x.name,displayPrice:x.currentPrice})).filter(x=>typeof x.name === 'string');
}
