import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import Stripe from 'npm:stripe@22.6.0';
import {paymentConfig,stripePayments} from '../../../server/stripe-payments.mjs';
import {stripeStore} from '../../../server/stripe-store.mjs';
import {paymentsHandler} from '../../../server/payments-handler.mjs';
const config=paymentConfig(name=>Deno.env.get(name));
const stripe=config.configured?new Stripe(config.key,{apiVersion:'2026-08-26.dahlia',httpClient:Stripe.createFetchHttpClient(),timeout:20000,maxNetworkRetries:0}):null;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const service=stripePayments({stripe,store:stripeStore(admin),config});
const authenticate=async token=>{
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
 const {data,error}=await client.auth.getUser(token);if(error||!data.user||!data.user.email_confirmed_at)return null;
 const {data:claims,error:failure}=await client.auth.getClaims(token);if(failure||claims?.claims?.sub!==data.user.id)return null;
 return {...data.user,aal:claims.claims.aal};
};
Deno.serve(paymentsHandler({authenticate,service,config}));
