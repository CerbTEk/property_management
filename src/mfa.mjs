// Temporary owner exception for the manual pilot, mirrored in database policy.
export const pilotOwnerId='3f03551d-89de-4214-aa7a-db7a86fe1735';
export function requiresHostMfa(user){return user?.id!==pilotOwnerId;}
// Authenticated MFA APIs are the authority; do not decode user-editable metadata.
export async function mfaState(auth){
 const {data:levels,error}=await auth.mfa.getAuthenticatorAssuranceLevel();
 if(error)throw error;
 if(levels.currentLevel==='aal2'&&levels.nextLevel==='aal2')return {mode:'ready'};
 const {data,error:factorError}=await auth.mfa.listFactors();
 if(factorError)throw factorError;
 const factors=(data.totp||[]).filter(f=>f.status==='verified');
 return factors.length?{mode:'challenge',factors}:{mode:'enroll'};
}
export async function verifyMfa(auth,factorId,code){
 if(!factorId||!/^\d{6}$/.test(code))throw Error('Enter the six-digit code from your authenticator.');
 const {error}=await auth.mfa.challengeAndVerify({factorId,code});
 if(error)throw error;
 const state=await mfaState(auth);
 if(state.mode!=='ready')throw Error('Verification did not complete. Try again.');
 return state;
}
