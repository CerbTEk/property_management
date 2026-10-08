import React,{useEffect,useId,useState} from 'react';

// Visited views stay mounted so switching views does not erase an in-progress form.
export function ViewTabs({children,label='Workspace views',value,onChange,initial}){
 const panels=React.Children.toArray(children),[local,setLocal]=useState(initial||panels[0]?.props.id),id=useId();
 const selected=value??local,[visited,setVisited]=useState(()=>new Set([selected]));
 useEffect(()=>{setVisited(previous=>previous.has(selected)?previous:new Set([...previous,selected]));},[selected]);
 function choose(next){setVisited(previous=>new Set([...previous,next]));if(onChange)onChange(next);else setLocal(next);}
 function keys(event,index){let next;if(event.key==='ArrowRight')next=(index+1)%panels.length;if(event.key==='ArrowLeft')next=(index+panels.length-1)%panels.length;if(event.key==='Home')next=0;if(event.key==='End')next=panels.length-1;if(next!==undefined){event.preventDefault();choose(panels[next].props.id);event.currentTarget.parentElement.children[next].focus();}}
 return <div className="view-tabs"><div className="view-tablist" role="tablist" aria-label={label}>{panels.map((panel,index)=><button type="button" key={panel.props.id} role="tab" id={`${id}-${panel.props.id}-tab`} aria-controls={`${id}-${panel.props.id}-panel`} aria-selected={selected===panel.props.id} tabIndex={selected===panel.props.id?0:-1} onClick={()=>choose(panel.props.id)} onKeyDown={event=>keys(event,index)}>{panel.props.label}</button>)}</div>{panels.map(panel=><div key={panel.props.id} role="tabpanel" id={`${id}-${panel.props.id}-panel`} aria-labelledby={`${id}-${panel.props.id}-tab`} hidden={selected!==panel.props.id} tabIndex={0}>{(visited.has(panel.props.id)||selected===panel.props.id)&&panel}</div>)}</div>;
}
export function ViewPanel({children}){return <>{children}</>;}

export const navigation=[
 {label:'Daily work',items:[['overview','Today'],['bookings','Bookings'],['guests','Guests'],['operations','Operations'],['messages','Messages']]},
 {label:'Your properties',items:[['properties','Properties'],['pricing','Pricing'],['guest','Guest experience'],['locks','Door locks']]},
 {label:'Business & setup',items:[['reports','Reports'],['payments','Payments'],['connections','Connections'],['migration','Migration']]}
];
export function workspaceView(){const requested=new URLSearchParams(location.search).get('view');return navigation.flatMap(group=>group.items).some(([id])=>id===requested)?requested:'overview';}
