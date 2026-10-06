import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import Stripe from 'npm:stripe@22.6.0';
import {paymentConfig,stripePayments} from '../../../server/stripe-payments.mjs';
import {stripeStore} from '../../../server/stripe-store.mjs';
import {stripeWebhookHandler} from '../../../server/payments-handler.mjs';
const config=paymentConfig(name=>Deno.env.get(name));
const key=config.key,secret=Deno.env.get('TREESTAND_STRIPE_WEBHOOK_SECRET');
const stripe=key?new Stripe(key,{apiVersion:'2026-08-26.dahlia',httpClient:Stripe.createFetchHttpClient(),timeout:20000,maxNetworkRetries:0}):null;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const service=stripePayments({stripe,store:stripeStore(admin),config});
const constructEvent=async(raw,signature)=>{
 if(!stripe||!secret||!signature)throw Error('Webhook not configured');
 return stripe.webhooks.constructEventAsync(raw,signature,secret,300,Stripe.createSubtleCryptoProvider());
};
Deno.serve(stripeWebhookHandler({constructEvent,service,livemode:config.livemode}));
