import React,{useState} from 'react';
import {db} from './backend';
import {DisplayDevices} from './display-devices';
const defaults={title:'Welcome, {{guest}}',welcome:'Make yourself at home. We hope you enjoy your stay.',guidebook:'',recommendations:'',contact:'',personalize:false};
export function GuestExperience({properties,reservations,displays,user,onSaved}){
 const [propertyId,setPropertyId]=useState(properties[0]?.id||'');
 const property=properties.find(p=>p.id===propertyId);
 if(!property)return <section className="panel"><h2>Guest Experience</h2><p>Add a listing in Overview to create its welcome display and guidebook.</p></section>;
 const saved=displays.find(d=>d.property_id===propertyId);
 return <><section className="panel"><h2>Guest Experience</h2><p>Create your own welcome display and house guide alongside your bookings.</p><label>Listing<select value={propertyId} onChange={e=>setPropertyId(e.target.value)}>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="notice">Browser TV display available below. Media, Wi-Fi sharing, weather, store and AI guest chat are planned.</p></section><DisplayEditor key={propertyId} property={property} saved={saved} bookings={reservations.filter(r=>r.property_id===propertyId&&r.status==='confirmed')} user={user} onSaved={onSaved}/><DisplayDevices key={propertyId+'screens'} property={property} user={user}/></>;
}
function DisplayEditor({property,saved,bookings,user,onSaved}){
 const [draft,setDraft]=useState({...defaults,...saved}),[bookingId,setBookingId]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const guest=bookings.find(b=>b.id===bookingId)?.guest.trim().split(/\s+/)[0]||'Guest';
 function change(e){setDraft({...draft,[e.target.name]:e.target.type==='checkbox'?e.target.checked:e.target.value});setNotice('Unsaved changes.');}
 async function save(e){e.preventDefault();setBusy(true);setNotice('');try{
  const values=Object.fromEntries(Object.keys(defaults).map(k=>[k,draft[k]]));
  const {error}=await db.from('ts_guest_displays').upsert({...values,owner_id:user.id,property_id:property.id},{onConflict:'property_id'});
  if(error)throw error;await onSaved();setNotice('Display settings saved.');
 }catch(e){setNotice(e.message);}finally{setBusy(false);}}
 return <div className="guest-editor"><section className="panel"><h2>Display settings</h2><form onSubmit={save}>
 <label>Welcome title<input name="title" required maxLength="120" value={draft.title} onChange={change}/></label><p>Use {'{{guest}}'} to insert the selected reservation’s first name.</p>
 <label className="toggle-setting"><input type="checkbox" name="personalize" checked={draft.personalize} onChange={change}/> Show the current guest’s first name on connected screens</label><p>Uses confirmed bookings saved in Treestand, from check-in until check-out in this listing’s timezone. Outside a stay, the screen says Guest. Airbnb booking sync is still pending.</p>
 <label>Welcome message<textarea name="welcome" rows="3" maxLength="2000" value={draft.welcome} onChange={change}/></label>
 <label>House guide<textarea name="guidebook" rows="7" maxLength="10000" placeholder="House rules, arrival instructions and useful information" value={draft.guidebook} onChange={change}/></label>
 <label>Local recommendations<textarea name="recommendations" rows="4" maxLength="4000" value={draft.recommendations} onChange={change}/></label>
 <label>Host contact details<textarea name="contact" rows="2" maxLength="500" value={draft.contact} onChange={change}/></label>
 <button disabled={busy}>{busy?'Saving…':'Save display settings'}</button>{notice&&<p role="status">{notice}</p>}
 </form></section><section className="panel"><h2>Welcome display preview</h2><label>Preview guest<select value={bookingId} onChange={e=>setBookingId(e.target.value)}><option value="">Generic welcome</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.guest} · {b.arrival}</option>)}</select></label>
 <div className="guest-preview"><div className="eyebrow">{property.name}</div><h2>{draft.title.replaceAll('{{guest}}',guest)}</h2><p>{draft.welcome}</p><div className="guest-times"><span>Check-in {property.check_in.slice(0,5)}</span><span>Check-out {property.check_out.slice(0,5)}</span></div>{draft.guidebook&&<article><h3>Your house guide</h3><p>{draft.guidebook}</p></article>}{draft.recommendations&&<article><h3>Explore nearby</h3><p>{draft.recommendations}</p></article>}{draft.contact&&<article><h3>Need a hand?</h3><p>{draft.contact}</p></article>}</div><p>This private preview uses the selected booking. Connected screens choose the current stay automatically when personalization is enabled.</p>
 </section></div>;
}
