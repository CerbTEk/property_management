const issuer='https://token.actions.githubusercontent.com';
export const audience='treestand-display-video';
const workflows=new Set([
 'CerbTEk/property_management/.github/workflows/display-video.yml@refs/heads/main',
 'CerbTEk/property_management/.github/workflows/display-video.yml@refs/heads/codex/photo-video'
]);
function bytes(text){return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function json(text){return JSON.parse(new TextDecoder().decode(bytes(text)));}
export function allowedClaims(claims,now=Date.now()/1000){
 return claims.iss===issuer&&claims.aud===audience&&claims.repository_id==='1406305861'
  &&claims.repository_owner_id==='337023550'&&claims.repository==='CerbTEk/property_management'
  &&workflows.has(claims.workflow_ref)&&['push','schedule','workflow_dispatch'].includes(claims.event_name)
  &&claims.ref===claims.workflow_ref.split('@')[1]&&claims.exp>now&&claims.nbf<=now+30
  &&claims.iat<=now+30&&claims.exp-claims.iat<=600;
}
let cache=null;
export async function verifyIdentity(token,fetcher=fetch){
 try{
  if(!token||token.length>20000)return false;
  const pieces=token.split('.');if(pieces.length!==3)return false;
  const header=json(pieces[0]),claims=json(pieces[1]);
  if(header.alg!=='RS256'||!allowedClaims(claims))return false;
  if(!cache||cache.until<Date.now()||!cache.keys.some(k=>k.kid===header.kid)){
   const response=await fetcher(`${issuer}/.well-known/jwks`,{signal:AbortSignal.timeout(10000)});
   if(!response.ok)return false;cache={keys:(await response.json()).keys,until:Date.now()+300000};
  }
  const jwk=cache.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(pieces[2]),new TextEncoder().encode(pieces.slice(0,2).join('.')));
 }catch{return false;}
}

