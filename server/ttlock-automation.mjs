// Server-only, fail-closed host consent. No credentials or guest PINs are read here.
export function assignedTTLockDevices(owner, snapshot) {
 const {data,receipts}=snapshot;
 for(const rows of [data.properties,data.reservations,data.locks,data.lockAssignments,receipts]) {
  if(!Array.isArray(rows)||rows.some(row=>row.owner_id!==owner))throw Error('Automation ownership mismatch.');
 }
 const properties=new Set(data.properties.map(p=>p.id));
 const assigned=new Set(data.lockAssignments.filter(a=>properties.has(a.property_id)).map(a=>a.lock_id));
 const devices=data.locks.filter(l=>l.provider==='ttlock'&&l.enabled&&assigned.has(l.id)).map(l=>String(l.provider_lock_id||''));
 // Keep only Treestand-managed historical receipts in scope for removal after
 // assignment/booking deletion. The execution layer validates exact labels/tags.
 devices.push(...receipts.filter(r=>r.provider==='ttlock'&&r.state!=='revoked').map(r=>String(r.device_id)));
 return [...new Set(devices)].filter(id=>/^[1-9][0-9]{0,14}$/.test(id));
}
export function ttlockAutomationPolicy({readAccount,paused=false}) {
 return {
  async resolveScope(owner,snapshot) {
   if(paused)return null;
   const row=await readAccount(owner);
   if(!row||row.owner_id!==owner||row.status!=='connected'||row.automation_enabled!==true||!row.automation_revision)return null;
   return {devices:assignedTTLockDevices(owner,snapshot),revision:row.automation_revision};
  },
  async authorize(owner,scope) {
   if(paused||!scope?.revision)return false;
   const row=await readAccount(owner);
   return Boolean(row&&row.owner_id===owner&&row.status==='connected'&&row.automation_enabled===true&&row.automation_revision===scope.revision);
  }
 };
}
