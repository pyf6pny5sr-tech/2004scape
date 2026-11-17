// Restricts owned combat packets only. Does not pause resource work or guarantee server-side XP immunity.
const bows=new Set(['shortbow','longbow','oak shortbow','oak longbow','willow shortbow','willow longbow','maple shortbow','maple longbow','yew shortbow','yew longbow','magic shortbow','magic longbow']);
export const combatXp=s=>Object.fromEntries(['Attack','Strength'].map(name=>[name,s?.skills?.find(x=>x.name===name)?.experience??null]));
export function requireZeroMeleeXp(s){const xp=combatXp(s);if(Object.values(xp).some(x=>x!==0))throw Error('RANGE_TANK_REQUIRES_ZERO_ATTACK_STRENGTH_XP');return xp;}
export function rangeAttackReady(s,index=s?.combatStyle?.currentStyle){
 requireZeroMeleeXp(s);
 const weapon=s.equipment?.find(x=>x.slot===3),tab=s.combatStyle,style=tab?.styles?.find(x=>x.index===index);
 if(!weapon||!bows.has(weapon.name?.toLowerCase())||tab?.known!==true||tab.weaponName?.toLowerCase()!==weapon.name.toLowerCase())throw Error('RANGE_TANK_WEAPON_UNVERIFIED');
 if(!style||style.damageType!=='Ranged'||!style.trainsSkills?.includes('Ranged')||style.trainsSkills.some(x=>!['Ranged','Defence','Hitpoints'].includes(x)))throw Error('RANGE_TANK_STYLE_UNVERIFIED');
 if(!s.equipment?.some(x=>x.slot===13&&x.count>0&&/^(bronze|iron|steel|mithril|adamant|rune) arrows?$/i.test(x.name)))throw Error('RANGE_TANK_AMMO_UNVERIFIED');
 return true;
}
export function rangePacketGuard(s,action,command){
 const npc=action?.type==='interactNpc'?s?.nearbyNpcs?.find(n=>n.index===action.npcIndex):null;
 const attack=action?.type==='interactPlayer'&&action.optionIndex===2||action?.type==='interactNpc'&&(command?.action?.startsWith('attack_')||/^attack$/i.test(command?.option??'')||npc?.optionsWithIndex?.some(o=>o.opIndex===action.optionIndex&&/^attack$/i.test(o.text)));
 if(/spell.*(?:npc|player)|(?:npc|player).*spell/i.test(action?.type??''))throw Error('RANGE_TANK_COMBAT_OPCODE_UNSUPPORTED');
 if(attack){if(action.type==='interactNpc'&&!npc)throw Error('RANGE_TANK_TARGET_UNVERIFIED');rangeAttackReady(s);}
 if(action?.type==='setCombatStyle')rangeAttackReady(s,action.style??action.mode);
}
