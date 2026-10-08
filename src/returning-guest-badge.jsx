import React from 'react';
import {RotateCcw} from 'lucide-react';
export function ReturningGuestBadge({match}){
 if(!match)return null;
 const detail=`Possible returning guest: matching name and last four phone digits on ${match.count} previous confirmed ${match.count===1?'stay':'stays'}. Last checkout: ${match.lastDeparture}. Verify the guestâ€™s identity before relying on this match.`;
 return <span className="returning-guest-badge" title={detail} aria-label={detail}><RotateCcw size={14} aria-hidden="true"/>Possible returning guest</span>;
}
