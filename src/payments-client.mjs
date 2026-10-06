export async function invokePayments(client,action,interval){
 const {data,error}=await client.functions.invoke('treestand-payments',{body:{action,...(interval?{interval}:{})}});
 if(error){let detail;try{detail=await error.context?.json();}catch{}throw Error(detail?.error||'Payments are unavailable. Recheck and try again.');}
 if(!data||typeof data!=='object')throw Error('Invalid payment response.');return data;
}
export function paymentRedirect(value){
 let url;try{url=new URL(value);}catch{throw Error('Invalid Stripe link.');}
 if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname)||url.username||url.password||url.port)throw Error('Invalid Stripe link.');return url.href;
}
export function onboardingRedirect(value){
 let url;try{url=new URL(value);}catch{throw Error('Invalid Stripe setup link.');}
 if(url.protocol!=='https:'||url.hostname!=='connect.stripe.com'||url.username||url.password||url.port)throw Error('Invalid Stripe setup link.');return url.href;
}
