const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:typeof x==='string'&&/^\d+(\.\d+)?$/.test(x)?Number(x):null;
// The official endpoint can return a compact tabular string, not a JSON array.
function cells(line){let out=[],part='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){part+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(part.trim());part='';}else part+=c;}if(quoted)throw new Error('营养表引用未闭合');out.push(part.trim());return out;}
export function parseNutrition(data){
 if(typeof data==='string'){try{const json=JSON.parse(data);return parseNutrition(json);}catch(e){if(data.trim().startsWith('[')&&data.includes('{productName,')){}else throw new Error('营养信息不是已支持的格式');}
 const lines=data.trim().split(/\r?\n/),head=lines.shift().match(/^\[(\d+)\]\{([^}]+)\}:$/);if(!head)throw new Error('营养表头格式变化');const names=head[2].split(','),rows=lines.filter(x=>x.trim());if(rows.length!==Number(head[1]))throw new Error('营养数据数量不一致');data=rows.map(line=>{const values=cells(line.trim());if(values.length!==names.length)throw new Error('营养列数量不一致');return Object.fromEntries(names.map((n,i)=>[n,values[i]==='null'?null:values[i]]));});}
 if(!Array.isArray(data))throw new Error('营养列表格式变化');
 return data.filter(x=>typeof x.productName==='string').map(x=>({name:x.productName,kcal:numeric(x.energyKcal),energyKj:numeric(x.energyKj)}));
}
export function nutritionName(name){return String(name||'').normalize('NFKC').replace(/\s+/g,'').replace(/[-－](?=\d+块)/g,'');}
export function findNutrition(name,catalog){const key=nutritionName(name),matches=catalog.filter(x=>nutritionName(x.name)===key&&x.kcal!==null);if(!matches.length)return null;const values=new Set(matches.map(x=>x.kcal));if(values.size!==1)return null;return {...matches[0],match:'exact-normalized-name'};}
export function attachNutrition(detail,catalog){return {...detail,rounds:(detail.rounds||[]).map(r=>({...r,choices:(r.choices||[]).map(x=>({...x,nutrition:findNutrition(x.name,catalog)}))}))};}
export function mealNutrition(detail,roundList){const parts=[];for(const r of roundList||[]){for(const item of r.comboItemList||[]){const choice=detail.rounds?.find(x=>String(x.id)===String(r.round))?.choices?.find(x=>String(x.code)===String(item.code));const n=choice?.nutrition,q=item.quantity;const known=Number.isSafeInteger(q)&&q>0&&typeof n?.kcal==='number'&&Number.isFinite(n.kcal)&&n.kcal>=0&&!item.modification;parts.push({name:choice?.name||'选配未确认',quantity:q,kcal:known?n.kcal*q:null,sourceName:known?n.name:null});}}
 const matched=parts.filter(p=>p.kcal!==null),complete=parts.length>0&&matched.length===parts.length;
 return {status:complete?'complete':matched.length?'partial':'unknown',kcal:complete?matched.reduce((n,p)=>n+p.kcal,0):null,knownKcal:matched.length?matched.reduce((n,p)=>n+p.kcal,0):null,parts,missing:parts.filter(p=>p.kcal===null).map(p=>p.name)};
}
