export async function selectLocalPort({port=4326,explicit=false,version,probe}){
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('PORT需为1到65535之间的整数。');
 const last=explicit?port:Math.min(65535,port+9);
 for(let candidate=port;candidate<=last;candidate++){
  let data;try{data=await probe(candidate);}catch{if(explicit)throw new Error(`无法确认端口 ${candidate} 的服务，请检查该地址或取消PORT配置后重试。`);continue;}
  if(data===null)return {port:candidate,existing:false};
  if(data?.app==='mcd-budget-buddy'&&data.dataMode==='live'&&data.version===version)return {port:candidate,existing:true};
  if(explicit)throw new Error(`端口 ${candidate} 正被旧版或其他服务使用。请停止该服务，或取消PORT配置后自动选择可用端口。`);
 }
 throw new Error('默认端口附近均不可用，请设置另一个PORT再启动。');
}
