export function phoneLastFour(phone){
 const value=String(phone||'').trim();
 if(!value)return null;
 if(!/^\+?[0-9\s().-]+$/.test(value))throw Error('Enter the guest phone number without an extension.');
 const digits=value.replace(/\D/g,'');
 if(digits.length<7||digits.length>15)throw Error('Enter a complete guest phone number (7–15 digits).');
 return digits.slice(-4);
}
export function savedPhoneCode(suffix){return typeof suffix==='string'&&/^\d{4}$/.test(suffix)?suffix:null;}
