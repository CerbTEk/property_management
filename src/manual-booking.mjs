import {quote} from './model.mjs';
import {normalizeGuestPhone} from './guest-profiles.mjs';
import {phoneLastFour} from './phone-code.mjs';

export function prepareManualBooking(values,properties,rates,ownerId){
 const property=properties.find(p=>p.id===values.property_id);
 if(!property)throw Error('Choose a listing before saving your booking.');
 const nights=quote(property,values.arrival,values.departure,rates).nights;
 if(nights<property.min_stay)throw Error(`Minimum stay is ${property.min_stay} nights.`);
 const guests=Number(values.guests);
 if(!Number.isInteger(guests)||guests<1)throw Error('Enter a valid number of guests.');
 if(guests>property.max_guests)throw Error(`Maximum occupancy is ${property.max_guests}.`);
 const guest=String(values.guest||'').trim();
 if(!guest)throw Error('Enter a guest name before saving your booking.');
 const phone=normalizeGuestPhone(values.guest_phone);
 return {
  payload:{property_id:property.id,guest,guest_id:values.guest_id||null,guest_phone:phone,guest_phone_last4:phoneLastFour(phone),arrival:values.arrival,departure:values.departure,guests,note:values.note||'',owner_id:ownerId},
  summary:{property:property.name,guest,arrival:values.arrival,departure:values.departure,guests,nights}
 };
}

// A refresh problem must never turn an accepted insert into a failed save or a retry.
export async function saveManualBooking(booking,save,refresh){
 await save(booking.payload);
 let refreshError='';
 try{await refresh();}catch(error){refreshError=error?.message||'The workspace could not refresh.';}
 return {...booking.summary,refreshError};
}
