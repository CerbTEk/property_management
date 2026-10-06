import * as oauth from 'oauth4webapi';

// Server-only preparation for approved manufacturer apps. No deployed route uses
// this module yet. A route must encrypt/store transactions, bind them to the
// initiating browser + authenticated host, and atomically consume them before
// calling complete(). Never accept a transaction supplied by a browser.
export const nativeCallback='https://treestand-manager.webflow.io/app/';
const tedeeBase='https://tedee.b2clogin.com/tedee.onmicrosoft.com/B2C_1A_Signup_Signin_With_Kmsi/oauth2/v2.0';
const providers=Object.freeze({
 igloohome:{issuer:'https://auth.igloohome.co',authorization_endpoint:'https://auth.igloohome.co/login',token_endpoint:'https://auth.igloohome.co/oauth2/token',scope:'igloohomeapi/get-devices',secret:true},
 tedee:{issuer:tedeeBase,authorization_endpoint:tedeeBase+'/authorize',token_endpoint:tedeeBase+'/token',scope:'https://tedee.onmicrosoft.com/api/user_impersonation https://tedee.onmicrosoft.com/api/Device.Read offline_access',secret:false}
});
export class NativeOAuthError extends Error{
 constructor(message,code){super(message);this.name='NativeOAuthError';this.code=code;}
}
export function nativeOAuth({provider,clientId,clientSecret,fetcher=fetch,now=Date.now}){
 const settings=providers[provider];
 if(!settings)throw new NativeOAuthError('Manufacturer authorization is not implemented.','unsupported');
 const configured=Boolean(clientId&&(!settings.secret||clientSecret));
 const client={client_id:clientId},server={...settings};
 const auth=settings.secret&&clientSecret?oauth.ClientSecretBasic(clientSecret):oauth.None();
 const options={signal:()=>AbortSignal.timeout(15000),[oauth.customFetch]:async(url,init)=>{
  if(String(url)!==settings.token_endpoint)throw new NativeOAuthError('Invalid authorization destination.','invalid');
  return fetcher(url,{...init,redirect:'error'});
 }};
 const assertConfigured=()=>{if(!configured)throw new NativeOAuthError('Manufacturer application approval and credentials are required.','not_configured');};
 function normalize(result,previousRefresh){
  const refreshToken=result.refresh_token||previousRefresh;
  if(typeof result.access_token!=='string'||!result.access_token||result.access_token.length>16384||typeof refreshToken!=='string'||!refreshToken||refreshToken.length>16384||!Number.isInteger(result.expires_in)||result.expires_in<=0||result.expires_in>31536000||result.token_type?.toLowerCase()!=='bearer')throw new NativeOAuthError('Invalid manufacturer token response. Reconnect.','invalid_response');
  return {accessToken:result.access_token,refreshToken,expiresAt:new Date(now()+result.expires_in*1000).toISOString()};
 }
 return {
  status(){return {provider,configured,liveValidated:false};},
  async begin(ownerId){
   assertConfigured();if(typeof ownerId!=='string'||!ownerId)throw new NativeOAuthError('Host authorization required.','ownership');
   const state=oauth.generateRandomState(),verifier=oauth.generateRandomCodeVerifier();
   const url=new URL(settings.authorization_endpoint);
   for(const [key,value] of Object.entries({client_id:clientId,redirect_uri:nativeCallback,response_type:'code',scope:settings.scope,state,code_challenge:await oauth.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'}))url.searchParams.set(key,value);
   return {url:url.href,transaction:{ownerId,provider,clientId,state,verifier,callback:nativeCallback,issuedAt:now()}};
  },
  async complete(ownerId,transaction,callbackUrl){
   assertConfigured();
   if(!transaction||transaction.ownerId!==ownerId||transaction.provider!==provider||transaction.clientId!==clientId||transaction.callback!==nativeCallback)throw new NativeOAuthError('Connection ownership mismatch.','ownership');
   if(!Number.isFinite(transaction.issuedAt)||transaction.issuedAt>now()||transaction.issuedAt+600000<=now())throw new NativeOAuthError('Authorization expired. Start a new connection.','expired');
   const url=new URL(callbackUrl),expected=new URL(nativeCallback);
   if(url.origin!==expected.origin||url.pathname!==expected.pathname||url.username||url.password||url.hash)throw new NativeOAuthError('Invalid authorization callback.','invalid');
   try{
    const params=oauth.validateAuthResponse(server,client,url,transaction.state);
    const response=await oauth.authorizationCodeGrantRequest(server,client,auth,params,nativeCallback,transaction.verifier,options);
    return normalize(await oauth.processAuthorizationCodeResponse(server,client,response));
   }catch(error){if(error instanceof NativeOAuthError)throw error;throw new NativeOAuthError('Manufacturer authorization failed. Start a new connection.','authorization_failed');}
  },
  async refresh(refreshToken){
   assertConfigured();if(typeof refreshToken!=='string'||!refreshToken||refreshToken.length>16384)throw new NativeOAuthError('Reconnect your manufacturer account.','invalid');
   try{
    const response=await oauth.refreshTokenGrantRequest(server,client,auth,refreshToken,options);
    return normalize(await oauth.processRefreshTokenResponse(server,client,response),refreshToken);
   }catch(error){if(error instanceof NativeOAuthError)throw error;throw new NativeOAuthError('Manufacturer token refresh failed. Reconnect.','authorization_failed');}
  }
 };
}
