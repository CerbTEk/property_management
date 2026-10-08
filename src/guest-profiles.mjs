export function normalizeGuestPhone(value){
 const input=String(value||'').trim();if(!input)return null;
 if(!/^\+?[0-9 ().-]+$/.test(input))throw Error('Enter a phone number without an extension.');
 let digits=input.replace(/\D/g,'');
 if(!input.startsWith('+')){
  if(digits.length===10)digits='1'+digits;
  else if(!(digits.length===11&&digits.startsWith('1')))throw Error('Include + and the country code for international numbers.');
 }
 if(!/^[1-9][0-9]{6,14}$/.test(digits))throw Error('Enter a complete phone number with country code.');
 return '+'+digits;
}
export function profileBookings(data,profile,ownerId){
 if(profile.owner_id!==ownerId)return [];
 return (data.reservations||[]).filter(b=>b.owner_id===ownerId&&b.kind!=='block'&&(b.guest_id===profile.id||!b.guest_id&&b.id===profile.id)).sort((a,b)=>b.arrival.localeCompare(a.arrival));
}
