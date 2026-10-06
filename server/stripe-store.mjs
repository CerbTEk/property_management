export function stripeStore(admin){
 const checked=r=>{if(r.error)throw Error('Payment storage unavailable');return r.data;};
 const scope=(query,row)=>query.eq('owner_id',row.owner_id).eq('livemode',row.livemode).eq('lease_token',row.lease_token).gt('lease_until',new Date().toISOString());
 return {
  async read(owner,live){return checked(await admin.from('ts_stripe_accounts').select('*').eq('owner_id',owner).eq('livemode',live).maybeSingle());},
  async byAccount(account,live){return checked(await admin.from('ts_stripe_accounts').select('*').eq('account_id',account).eq('livemode',live).maybeSingle());},
  async claim(owner,live,email){return checked(await admin.rpc('ts_claim_stripe_operation',{p_owner:owner,p_live:live,p_email:email}))?.[0]||null;},
  async save(row,patch){return checked(await scope(admin.from('ts_stripe_accounts').update({...patch,updated_at:new Date().toISOString()}),row).select('owner_id'))?.length===1;},
  async release(row){checked(await admin.from('ts_stripe_accounts').update({lease_until:null,lease_token:null}).eq('owner_id',row.owner_id).eq('livemode',row.livemode).eq('lease_token',row.lease_token));},
  async subscription(owner,live){return checked(await admin.from('ts_stripe_subscriptions').select('*').eq('owner_id',owner).eq('livemode',live).order('checked_at',{ascending:false}).limit(1).maybeSingle());},
  async eventProcessed(event){return Boolean(checked(await admin.from('ts_stripe_events').select('event_id').eq('event_id',event).maybeSingle()));},
  async saveSubscription(row,snapshot){return checked(await admin.rpc('ts_save_stripe_subscription',{p_owner:row.owner_id,p_live:row.livemode,p_lease:row.lease_token,p_snapshot:snapshot}))===true;},
  async markEvent(event){checked(await admin.from('ts_stripe_events').upsert({event_id:event.id,livemode:event.livemode,event_type:event.type},{onConflict:'event_id',ignoreDuplicates:true}));}
 };
}
