export async function fetchJSON(url,{fetcher=fetch,timeoutMs=10000,...options}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetcher(url,{cache:'no-store',...options,signal:controller.signal});if(!response.ok){const error=Error('HTTP '+response.status);error.status=response.status;throw error}return await response.json()}finally{clearTimeout(timer)}
}
export const cloneJSON=value=>JSON.parse(JSON.stringify(value));
