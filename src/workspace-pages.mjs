// Fail closed on incomplete reads so reports never silently use a capped calendar.
export async function loadWorkspacePages(readPage){
 const rows=[],size=500;let expected;
 for(let offset=0;offset<100000;offset+=size){
  const {data,error,count}=await readPage(offset,offset+size-1,offset===0);
  if(error)return {data:null,error};
  if(offset===0){if(!Number.isInteger(count)||count<0)return {data:null,error:{message:'Could not verify workspace record count. Refresh and try again.'}};expected=count;}
  rows.push(...data);
  if(data.length<size||rows.length>=expected){if(rows.length!==expected||new Set(rows.map(r=>r.id)).size!==rows.length)return {data:null,error:{message:'Workspace changed during loading. Refresh for a complete report.'}};return {data:rows,error:null};}
 }
 return {data:null,error:{message:'Workspace is too large to load completely. Contact support before using reports.'}};
}
