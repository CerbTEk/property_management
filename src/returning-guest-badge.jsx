import React from 'react';
import {RotateCcw} from 'lucide-react';
export function ReturningGuestBadge({match}){
 if(!match)return null;
 const detail=`Returning guest: ${match.count} previous confirmed ${match.count===1?'stay':'stays'} linked to this saved guest profile. Last checkout: ${match.lastDeparture}.`;
 return <span className="returning-guest-badge" title={detail} aria-label={detail}><RotateCcw size={14} aria-hidden="true"/>Returning guest Â· {match.count} prior {match.count===1?'stay':'stays'}</span>;
}
