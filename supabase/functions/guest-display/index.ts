import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {createHandler} from './handler.mjs';
// Custom device bearer authentication is performed before every privileged read.
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler(admin));
