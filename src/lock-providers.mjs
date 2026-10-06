export const lockBrands=[['ttlock','TTLock'],['august','August'],['yale','Yale'],['schlage','Schlage'],['kwikset','Kwikset'],['igloohome','igloohome'],['lockly','Lockly'],['tedee','Tedee'],['nuki','Nuki']];
export const seamProviders=lockBrands.filter(([key])=>key!=='ttlock').map(([key])=>key);
export function codeCompatibility(lock){
 if(lock.brand==='nuki'||lock.provider==='nuki')return 'Nuki requires six digits and cannot use the guest phone last four.';
 if(lock.provider==='seam'){
  if(lock.capabilities?.online_codes!==true)return 'Online guest codes have not been verified for this device.';
  if(!lock.capabilities?.code_lengths?.includes(4))return 'Four-digit guest codes have not been verified for this device.';
  if(lock.online!==true)return 'The lock is offline or its connection has not been verified.';
 }
 return null;
}
