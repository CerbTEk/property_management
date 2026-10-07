export const displayDefaults={title:'Welcome, {{guest}}',welcome:'Make yourself at home. We hope you enjoy your stay.',guidebook:'',recommendations:'',contact:'',house_rules:'',slideshow_seconds:20,music_enabled:true,music_default:'woodland',music_volume:15,personalize:false};
export const contentFields=[['house_rules','House rules'],['guidebook','House guide'],['recommendations','Local recommendations'],['contact','Host contact'],['title','Welcome title'],['welcome','Welcome message'],['slideshow_seconds','Photo rotation'],['music_enabled','Automatic music'],['music_default','Default music'],['music_volume','Starting volume'],['personalize','Guest name personalization']];
export const textFields=new Set(['house_rules','guidebook','recommendations','contact','title','welcome']);
export function displaySnapshot(row){return Object.fromEntries(Object.keys(displayDefaults).map(k=>[k,row[k]]));}
export function bulkContentPlan(properties,displays,ownerId,sourceId,targetIds,fields,mode='replace',allowEmpty=false){
 if(!ownerId||!properties.some(p=>p.id===sourceId&&p.owner_id===ownerId))throw Error('Choose an owned source listing.');
 const source=displays.find(d=>d.property_id===sourceId&&d.owner_id===ownerId);if(!source)throw Error('Save the source listing’s display settings first.');
 if(!['replace','empty'].includes(mode))throw Error('Choose a valid update mode.');
 if(!fields.length||fields.length>contentFields.length||new Set(fields).size!==fields.length||fields.some(k=>!contentFields.some(([id])=>id===k)))throw Error('Choose fields to apply.');
 if(mode==='empty'&&fields.some(k=>!textFields.has(k)))throw Error('Fill empty fields supports text fields only.');
 if(!targetIds.length||targetIds.length>100||new Set(targetIds).size!==targetIds.length||targetIds.includes(sourceId))throw Error('Choose 1–100 different destination listings.');
 if(!allowEmpty&&fields.some(k=>textFields.has(k)&&!source[k].trim()))throw Error('A selected source field is blank. Uncheck it or allow clearing destination text.');
 const rows=targetIds.map(id=>{const property=properties.find(p=>p.id===id&&p.owner_id===ownerId);if(!property)throw Error('Every destination must be an owned listing.');const saved=displays.find(d=>d.property_id===id&&d.owner_id===ownerId),before=saved?displaySnapshot(saved):{...displayDefaults,welcome:''};
 const changes=fields.filter(k=>(mode==='replace'||before[k]==='')&&before[k]!==source[k]).map(k=>({key:k,label:contentFields.find(([id])=>id===k)[1],before:before[k],after:source[k]}));
 return {propertyId:id,name:property.name,expected:saved?displaySnapshot(saved):null,changes,creates:!saved};});
 return {sourceId,expectedSource:displaySnapshot(source),fields,mode,allowEmpty,rows,changed:rows.filter(r=>r.creates||r.changes.length).length};
}
export function bulkContentArgs(plan){return {p_source:plan.sourceId,p_expected_source:plan.expectedSource,p_targets:plan.rows.map(r=>({id:r.propertyId,expected:r.expected})),p_fields:plan.fields,p_mode:plan.mode,p_allow_empty:plan.allowEmpty};}
