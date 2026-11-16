/** Complete small progressive source. Never buffer an unbounded video in RAM. */
export async function smallMedia(url:string, known:number, limit=8*1024*1024):Promise<Buffer> {
  if(known>limit)throw Error('progressive source exceeds size limit');
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),5500);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const response=await fetch(url,{signal:abort.signal});
    if(response.status!==200)throw Error('progressive '+response.status);
    const header=response.headers.get('content-length');
    const declared=header===null ? 0 : Number(header);
    if(!Number.isFinite(declared)||declared<0||declared>limit)throw Error('invalid progressive size');
    if(known&&declared&&known!==declared)throw Error('progressive size changed');
    const expected=known||declared;
    reader=response.body?.getReader();
    if(!reader)throw Error('empty progressive response');
    const chunks:Buffer[]=[];let length=0;
    while(true){
      const {value,done}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>limit || expected&&length>expected)throw Error('oversized progressive response');
      chunks.push(Buffer.from(value));
    }
    if(!length||expected&&length!==expected)throw Error('incomplete progressive response');
    return Buffer.concat(chunks,length);
  } finally {
    clearTimeout(timer);abort.abort();
    await reader?.cancel().catch(()=>{});
  }
}
