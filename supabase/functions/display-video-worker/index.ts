import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {createVideoWorker} from './worker.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createVideoWorker(admin));

