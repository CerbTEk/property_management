export const lockBrands=[['ttlock','TTLock'],['august','August'],['yale','Yale'],['schlage','Schlage'],['kwikset','Kwikset'],['igloohome','igloohome'],['lockly','Lockly'],['tedee','Tedee'],['nuki','Nuki']];
export const seamProviders=lockBrands.filter(([key])=>key!=='ttlock').map(([key])=>key);
export function lockGuestCode(lock,phoneLast4){
 if(!/^[0-9]{4}$/.test(phoneLast4||''))return null;
 return lock.brand==='tedee'?'0'+phoneLast4:phoneLast4;
}
export function codeCompatibility(lock,code){
 if(lock.brand==='tedee'&&code){
  const digits=[...code].map(Number);
  if(!/^[0-9]{5}$/.test(code)||new Set(code).size<3||digits.slice(1).every((n,i)=>n>digits[i])||digits.slice(1).every((n,i)=>n<digits[i]))return 'Tedee requires a five-digit code with at least three different digits and no ascending or descending sequence. Review this guest phone ending.';
 }
 const length=lock.brand==='tedee'?5:4;
 if(lock.brand==='nuki'||lock.provider==='nuki')return 'Nuki requires six digits and cannot use the guest phone last four.';
 if(lock.provider==='seam'){
  if(lock.capabilities?.online_codes!==true)return 'Online guest codes have not been verified for this device.';
  if(!lock.capabilities?.code_lengths?.includes(length))return `${length===5?'Five':'Four'}-digit guest codes have not been verified for this device.`;
  if(lock.online!==true)return 'The lock is offline or its connection has not been verified.';
 }
 return null;
}
