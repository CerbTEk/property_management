const text=value=>typeof value==='string'&&Boolean(value.trim());
const clock=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
const bounded=(value,min,max)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max;
export function propertySetup(data,ownerId,now=Date.now()){
 if(!ownerId||!Number.isFinite(now))throw Error('An owner and current time are required.');
 const owned=key=>(data[key]||[]).filter(x=>x.owner_id===ownerId);
 return owned('properties').map(p=>{
  let timezone=false;try{if(text(p.timezone)){new Intl.DateTimeFormat('en',{timeZone:p.timezone});timezone=true;}}catch{}
  const display=owned('displays').find(d=>d.property_id===p.id);
  const screens=owned('displayDevices').filter(d=>d.property_id===p.id&&!d.revoked&&!d.pairing_expires_at&&(d.expires_at==null||Date.parse(d.expires_at)>now));
  const locks=owned('locks').filter(l=>l.enabled===true);
  const assigned=owned('lockAssignments').filter(a=>a.property_id===p.id&&locks.some(l=>l.id===a.lock_id));
  const photos=owned('displayImages').filter(i=>i.property_id===p.id);
  const steps=[
   {id:'details',title:'Property details',done:text(p.name)&&timezone&&clock(p.check_in)&&clock(p.check_out)&&Number.isInteger(p.max_guests)&&bounded(p.max_guests,1,100)&&Number.isInteger(p.min_stay)&&bounded(p.min_stay,1,365),tab:'properties',action:'Edit property details',detail:'Set the timezone, guest limit, minimum stay and arrival times.'},
   {id:'pricing',title:'Nightly rates',done:Number.isInteger(p.weekday_cents)&&bounded(p.weekday_cents,100,1000000)&&Number.isInteger(p.weekend_cents)&&bounded(p.weekend_cents,100,1000000)&&bounded(p.markup_percent,0,100),tab:'pricing',action:'Open this property’s pricing',detail:'Review base rates, date overrides and your channel markup. Channel publishing is pending.'},
   {id:'welcome',title:'Guest welcome and contact',done:text(display?.welcome)&&text(display?.contact),tab:'guest',action:'Edit welcome and contact',detail:'Save a welcome message and contact details guests can use during their stay.'},
   {id:'rules',title:'House rules',done:text(display?.house_rules),tab:'guest',action:'Edit house rules',detail:'Saved rules appear in the TV’s House Rules view.'},
   {id:'personalize',title:'Personalized TV greeting',done:display?.personalize===true&&typeof display?.title==='string'&&display.title.includes('{{guest}}'),tab:'guest',action:'Set guest personalization',detail:'Enable personalization and use {{guest}} in the welcome title to show the current guest’s first name during the saved stay window.'},
   {id:'screens',title:'TV connection',done:screens.length>0,tab:'guest',action:'Connect a TV',detail:`${screens.length} active screen ${screens.length===1?'registration':'registrations'}. An unused pairing code, expired link or revoked screen does not count. Registration does not confirm the TV is online.`},
   {id:'locks',title:'Door access assignments',done:assigned.length>0,tab:'locks',action:'Assign this property’s locks',detail:`${assigned.length} enabled lock ${assigned.length===1?'assignment':'assignments'}. Provider connection and live guest-code verification are separate steps.`}
  ];
  return {id:p.id,name:p.name,property:p,steps,completed:steps.filter(s=>s.done).length,total:steps.length,photos:photos.length,musicEnabled:display?.music_enabled===true,next:steps.find(s=>!s.done)||null};
 });
}
