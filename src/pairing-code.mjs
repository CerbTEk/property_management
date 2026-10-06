export const pairingAlphabet='123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function normalizePairingCode(value){return String(value||'').toUpperCase().replace(/[\s-]/g,'');}
export function isPairingCode(value){return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(value);}
export function generatePairingCode(randomBytes=bytes=>crypto.getRandomValues(bytes)){
 let code='';const limit=256-(256%pairingAlphabet.length);
 while(code.length<16){for(const byte of randomBytes(new Uint8Array(32))){if(byte<limit)code+=pairingAlphabet[byte%pairingAlphabet.length];if(code.length===16)break;}}
 return code;
}
