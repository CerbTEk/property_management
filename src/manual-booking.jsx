import React,{useEffect,useRef,useState} from 'react';
import {CheckCircle2,AlertCircle} from 'lucide-react';
import {GuestBookingFields} from './guest-profiles.jsx';
import {prepareManualBooking} from './manual-booking.mjs';

export function ManualBookingForm({properties,profiles,rates,user,busy,initialPropertyId,onSave,onNavigate}){
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(null);
 const inFlight=useRef(false),feedback=useRef(null),form=useRef(null),focusNew=useRef(false);
 useEffect(()=>{
  if((saved||error)&&feedback.current&&!feedback.current.closest('[hidden]')){
   feedback.current.focus();
   feedback.current.scrollIntoView?.({block:'nearest'});
  }
  if(!saved&&focusNew.current){form.current?.querySelector('select')?.focus();focusNew.current=false;}
 },[saved,error]);
 async function submit(event){
  event.preventDefault();
  if(inFlight.current||busy||saved)return;
  const values=Object.fromEntries(new FormData(event.currentTarget));
  inFlight.current=true;setSaving(true);setError('');
  try{
   const booking=prepareManualBooking(values,properties,rates,user.id);
   const result=await onSave(booking);
   setSaved(result);
  }catch(error){setError(error?.message||'We could not confirm the booking. Check your connection and Reservations before trying again.');}
  finally{inFlight.current=false;setSaving(false);}
 }
 return <section className="panel"><h2>Add a reservation</h2>{saved?<>
  <div ref={feedback} className="booking-feedback booking-feedback-success" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>
   <div className="booking-feedback-heading"><CheckCircle2 size={24} aria-hidden="true"/><h3>Booking saved in Treestand</h3></div>
   <p>The reservation has been saved. You do not need to submit it again.</p>
   <dl className="booking-save-summary"><div><dt>Guest</dt><dd>{saved.guest}</dd></div><div><dt>Listing</dt><dd>{saved.property}</dd></div><div><dt>Arrival</dt><dd>{saved.arrival}</dd></div><div><dt>Departure</dt><dd>{saved.departure}</dd></div><div><dt>Stay</dt><dd>{saved.nights} {saved.nights===1?'night':'nights'} · {saved.guests} {saved.guests===1?'guest':'guests'}</dd></div></dl>
   {saved.refreshError&&<p className="booking-refresh-warning"><strong>Booking saved, but the workspace could not refresh.</strong> Use Refresh to reload your records. Do not save this booking again.</p>}
   <p>Channel sync and door-code readiness are separate from saving a booking. Review Stay preparation before the guest arrives.</p>
  </div>
  <div className="booking-save-actions"><button type="button" onClick={()=>onNavigate('reservations')}>View reservations</button><button type="button" className="secondary-button" onClick={()=>{focusNew.current=true;setSaved(null);setError('');}}>Add another booking</button></div>
 </>:<form ref={form} onSubmit={submit} aria-busy={saving}>
  <fieldset className="form-grid manual-booking-fields" disabled={saving||busy}>
   <legend className="sr-only">Manual booking details</legend>
   <label>Listing<select key={initialPropertyId||'booking-listing'} name="property_id" required defaultValue={initialPropertyId||''}><option value="">Choose a listing</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <GuestBookingFields profiles={profiles}/>
   <label>Arrival<input required name="arrival" type="date"/></label><label>Departure<input required name="departure" type="date"/></label>
   <label>Guests<input required name="guests" type="number" min="1" max="100" defaultValue="1"/></label><label>Note<input name="note" maxLength="2000"/></label>
   <button type="submit" disabled={saving||busy||!properties.length}>{saving?'Saving booking…':'Save manual booking'}</button>
  </fieldset>
  {saving&&<p className="booking-saving" role="status">Saving your booking. Please wait…</p>}
  {error&&<div ref={feedback} className="booking-feedback booking-feedback-error" role="alert" aria-atomic="true" tabIndex={-1}><div className="booking-feedback-heading"><AlertCircle size={24} aria-hidden="true"/><h3>Booking not confirmed</h3></div><p>{error}</p><p>Your entries have been kept. If the connection was interrupted, check Reservations before trying again.</p></div>}
 </form>}</section>;
}
