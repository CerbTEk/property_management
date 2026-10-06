export function normalizePairingCode(value){return String(value||'').toUpperCase().replace(/[\s-]/g,'');}
export function isPairingCode(value){return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(value);}
