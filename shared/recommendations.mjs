import {makeSelection,selectionNames,mainMatches,explicitlySugarFree} from './domain.mjs';
export const cupMatches=(name,cup)=>cup==='any'||(cup==='medium'?/中杯/:/大杯/).test(name||'');
const spicy=name=>/辣/.test(name||'');
const flavorPenalty=(names,flavor)=>flavor==='any'?0:flavor==='spicy'?(names.some(spicy)?0:1):(names.some(spicy)?1:0);
export function selectionVariants(detail,constraints,limit=3){
 const rounds=detail.rounds;if(!Array.isArray(rounds)||!rounds.length)return [];
 const options=rounds.map((r,i)=>(r.choices||[]).filter(x=>(i!==0||mainMatches(x.name,constraints.preference))&&(!constraints.sugarFree||!/饮料|饮品/.test(r.name||'')||explicitlySugarFree(x.name||''))).sort((a,b)=>{
  if(/饮料|饮品/.test(r.name||'')){const cup=Number(!cupMatches(a.name,constraints.cup))-Number(!cupMatches(b.name,constraints.cup));if(cup)return cup;}
  if(i===0&&constraints.flavor!=='any'){const f=flavorPenalty([a.name],constraints.flavor)-flavorPenalty([b.name],constraints.flavor);if(f)return f;}
  return Number(b.isDefault===true)-Number(a.isDefault===true);
 }));
 if(options.some(x=>!x.length))return [];
 const changes=Object.fromEntries(rounds.map((r,i)=>[String(r.id),String(options[i][0].code)]));
 const base=makeSelection(detail,constraints.sugarFree,changes),variants=[base];
 // Vary main courses first, then sides. A different cup alone is not a new proposal.
 for(const i of rounds.map((_,i)=>i).filter(i=>!/饮料|饮品/.test(rounds[i].name||''))){
  for(const option of options[i].slice(1)){
   const list=makeSelection(detail,constraints.sugarFree,{...changes,[String(rounds[i].id)]:String(option.code)});
   if(!variants.some(v=>JSON.stringify(v)===JSON.stringify(list)))variants.push(list);
   if(variants.length>=limit)return variants;
  }
 }
 return variants;
}
export function rankProposals(plans,constraints,limit=3){
 const unique=new Map();
 for(const p of plans){if(!p.withinBudget||!Number.isSafeInteger(p.priceFen)||p.priceFen<0)continue;
  const signature=JSON.stringify(p.items.map(n=>String(n).normalize('NFKC').trim()));
  if(!unique.has(signature)||unique.get(signature).priceFen>p.priceFen)unique.set(signature,p);
 }
 const pool=[...unique.values()].sort((a,b)=>flavorPenalty(a.items,constraints.flavor)-flavorPenalty(b.items,constraints.flavor)||a.priceFen-b.priceFen);
 const result=[];
 while(pool.length&&result.length<limit){
  let next=0;
  if(result.length&&constraints.priority==='variety'){
   const diversity=p=>result.reduce((total,other)=>total+(p.items[0]!==other.items[0]?4:0)+(JSON.stringify(p.items.slice(1,-1))!==JSON.stringify(other.items.slice(1,-1))?2:0),0);
   next=pool.reduce((best,p,i)=>{
    const score=flavorPenalty(p.items,constraints.flavor)*100-diversity(p),old=flavorPenalty(pool[best].items,constraints.flavor)*100-diversity(pool[best]);
    return score<old||score===old&&p.priceFen<pool[best].priceFen?i:best;
   },0);
  }
  const p=pool.splice(next,1)[0],previous=result[0];
  const reason=result.length===0?'优先贴合口味，再比较已核算金额':constraints.priority==='variety'?(p.items[0]!==previous.items[0]?'换一种主食，尝点不一样':'换一种小食，保留主食'):'另一套预算内搭配，按核算金额排序';
  const notes=[];if(flavorPenalty(p.items,constraints.flavor))notes.push('当前名称未匹配口味倾向，作为备选；实际辣度未核验');
  const drinks=selectionNames(p.detail,p.roundList).filter((_,i)=>/饮料|饮品/.test(p.detail.rounds[i]?.name||''));
  if(constraints.cup!=='any'&&drinks.length&&!drinks.every(n=>cupMatches(n,constraints.cup)))notes.push(`该套餐没有所偏好的${constraints.cup==='medium'?'中':'大'}杯选择，按现有选项核价`);
  result.push({...p,reason,notes});
 }
 return result;
}
