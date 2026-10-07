import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {staffMailConfig,staffMailHandler} from '../../../server/staff-mail.mjs';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const client=(token:string)=>createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
const rpc=async(c:any,name:string,args:any)=>{const {data,error}=await c.rpc(name,args);if(error)throw Error('Request unavailable');return data;};
Deno.serve(staffMailHandler({config:staffMailConfig((name:string)=>Deno.env.get(name)),authenticate:async(token:string)=>{const c=client(token);const {data,error}=await c.auth.getUser(token);if(error||!data.user?.email_confirmed_at)return null;const result=await c.auth.getClaims(token);if(result.error||result.data?.claims?.sub!==data.user.id)return null;return {...data.user,aal:result.data.claims.aal};},prepare:(token:string,kind:string,reference:string)=>rpc(client(token),'ts_prepare_staff_email',{p_kind:kind,p_reference:reference}),claim:(id:string,owner:string)=>rpc(admin,'ts_claim_staff_email',{p_job:id,p_owner:owner}),finish:(id:string,lease:string,state:string,provider:string)=>rpc(admin,'ts_finish_staff_email',{p_job:id,p_lease:lease,p_state:state,p_provider:provider})}));
