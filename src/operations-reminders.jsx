import React,{useState,useEffect} from 'react';
import {operationsBoard} from './operations-model.mjs';
export function OperationsReminders({data,user,onNavigate}){
 const [now,setNow]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(id);},[]);
 const {counts,rows}=operationsBoard(data,user.id,now);
 const reminders=rows.filter(r=>r.active&&(r.overdue||r.today||r.review||r.unassigned));
 return <section className="panel"><span className="eyebrow">PROPERTY WORK</span><h2>Operations reminders</h2><p>{counts.overdue} overdue · {counts.today} due today · {counts.unassigned} need assignment · {counts.upcoming} due in the next seven days</p>{!reminders.length?<p>No immediate operations reminders.</p>:<ul>{reminders.slice(0,4).map(r=><li key={r.id}>{r.title} · {r.propertyName} · {r.due_day}{r.overdue?' · Overdue':r.today?' · Due today':''}{r.unassigned?' · Assign someone':''}{r.review?' · Needs review':''}</li>)}</ul>}<button className="small" onClick={()=>onNavigate('operations')}>Review property work</button><p>Reminders appear in your workspace. Email, SMS and staff notifications are not enabled.</p></section>;
}
