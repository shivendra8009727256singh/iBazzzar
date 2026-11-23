import type {ZodType} from 'zod';
// Field names are payload paths ("business.address.city"). Checkboxes become booleans; blank optional text is omitted.
export function formPayload(form:HTMLFormElement){
 const payload:Record<string,unknown>={};
 for(const el of Array.from(form.elements) as HTMLInputElement[]){
  if(!el.name||el.disabled||el.dataset.ignore!==undefined)continue;
  const value=el.type==='checkbox'?el.checked:el.value.trim();
  // Parent objects are always created so an empty address reports each missing field, not one group error.
  const keys=el.name.split('.');let node=payload;
  keys.slice(0,-1).forEach(k=>{node[k]=(node[k] as Record<string,unknown>)??{};node=node[k] as Record<string,unknown>;});
  if(value!=='')node[keys.at(-1)!]=value;
 }
 return payload;
}
// Runs the same Zod schema the API uses and returns the first message per field path.
export function fieldErrors(schema:ZodType,payload:unknown){
 const result=schema.safeParse(payload),errors:Record<string,string>={};
 if(!result.success)for(const issue of result.error.issues){const path=issue.path.join('.');errors[path]??=issue.message;}
 return {data:result.success?result.data:null,errors};
}
export function passwordStrength(password:string){
 if(!password)return {score:0,label:''};
 const variety=[/[a-z]/,/[A-Z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(r=>r.test(password)).length;
 const score=password.length<12?1:password.length>=16&&variety>=3?4:variety>=3?3:2;
 return {score,label:['','Too short','Fair','Good','Strong'][score]};
}
