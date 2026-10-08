export function stayDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
 const date=new Date(value+'T12:00:00Z');
 return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);
}
export function stayTime(value){
 const match=/^(\d{2}):(\d{2})/.exec(value||'');if(!match)return value||'';
 const hour=Number(match[1]);return `${hour%12||12}:${match[2]} ${hour>=12?'PM':'AM'}`;
}
