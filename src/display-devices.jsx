import React,{useEffect,useState} from 'react';
import {db} from './backend';
export function DisplayDevices({property,user}){
 const [devices,setDevices]=useState([]),[name,setName]=useState('Room TV'),[link,setLink]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function load(){const {data,error}=await db.from('ts_display_devices').select('id,name,revoked,expires_at,created_at').eq('property_id',property.id).order('created_at');if(error)throw error;setDevices(data);}
 useEffect(()=>{load().catch(e=>setNotice(e.message));},[property.id]);
 async function connect(e){e.preventDefault();setBusy(true);setLink('');setNotice('');try{
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const {error}=await db.from('ts_display_devices').insert({owner_id:user.id,property_id:property.id,name:name.trim(),token_hash:hash});if(error)throw error;
  setLink(`${location.origin}${import.meta.env.BASE_URL}display/#${token}`);await load();
 }catch(e){setNotice(e.message);}finally{setBusy(false);}}
 async function revoke(id){setBusy(true);try{const {error}=await db.from('ts_display_devices').update({revoked:true}).eq('id',id).select('id');if(error)throw error;setLink('');await load();setNotice('Screen revoked. It will clear on its next refresh, within one minute.');}catch(e){setNotice(e.message);}finally{setBusy(false);}}
 return <section className="panel"><h2>Connected screens</h2><p>Open a private screen link in a TV browser or a connected computer. Native TV app support is still pending. Screens update once a minute. Enable guest personalization above to show the current guest’s first name during their stay.</p><form onSubmit={connect}><label>Screen name<input required maxLength="120" value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy}>{busy?'Working…':'Create screen link'}</button></form>{link&&<div className="notice"><p>This link grants access to the saved welcome content for this room. Keep it private; it is shown here once and expires after 90 days.</p><label>Private screen link<input readOnly value={link} onFocus={e=>e.target.select()}/></label><a href={link} target="_blank" rel="noreferrer">Open display</a></div>}{notice&&<p role="status">{notice}</p>}{devices.map(d=><div className="listing" key={d.id}><div><strong>{d.name}</strong><p>{d.revoked?'Revoked':new Date(d.expires_at)<=new Date()?'Expired':`Link active until ${new Date(d.expires_at).toLocaleDateString()}`}</p>{!d.revoked&&<button className="link" disabled={busy} onClick={()=>revoke(d.id)}>Revoke screen</button>}</div></div>)}</section>;
}
