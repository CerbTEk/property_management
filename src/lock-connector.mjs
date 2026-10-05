export async function invokeLockConnector(client,action,connection_id){
 const {data,error}=await client.functions.invoke('smart-lock-connect',{body:{action,connection_id}});
 if(error){let detail;try{detail=await error.context?.json();}catch{}
  const failure=Error(detail?.error||'Lock connector is unavailable. Recheck setup and try again.');
  failure.code=detail?.code||'unavailable';throw failure;
 }
 if(!data||typeof data!=='object')throw Error('Invalid connector response.');
 return data;
}
export function connectorLabel(status){
 if(!status)return 'Checking connection setup…';
 if(status.error)return status.error;
 if(!status.configured)return 'Add the Seam server key to connect your locks.';
 if(!status.ready)return 'The provider workspace is suspended.';
 return status.mode==='sandbox'?'Sandbox connected · simulated devices only':'Live workspace verified · ready for provider sign-in';
}
