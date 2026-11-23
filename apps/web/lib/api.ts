// Errors carry a customer-facing message and, for validation failures, a per-field map the form can highlight.
export class ApiError extends Error{constructor(message:string,public status=0,public fields:Record<string,string>={}){super(message);}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 let response:Response;
 try{response=await fetch(`/api${path}`,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});}
 catch{throw new ApiError('We couldn’t reach IBazzzar. Please check your internet connection and try again.');}
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new ApiError(data?.error||(response.status>=500?'Something went wrong on our side. Please try again in a moment.':'Something went wrong. Please try again.'),response.status,data?.fields||{});
 return data as T;
}
export const post=<T>(path:string,body:unknown,headers?:HeadersInit)=>api<T>(path,{method:'POST',body:JSON.stringify(body),headers});
export async function serverApi<T>(path:string):Promise<T>{const response=await fetch(`${process.env.API_ORIGIN||'http://127.0.0.1:4000'}/api${path}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('The catalogue is temporarily unavailable');return response.json();}
