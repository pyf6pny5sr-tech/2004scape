import { randomUUID } from 'node:crypto';
// Explicit, finite approval for ordinary resource work only. No SDK access here.
import { bounded, copy } from './protocol.mjs';
export const inside=(a,p)=>p.level===a.level&&Math.abs(p.worldX-a.x)<=a.radius&&Math.abs(p.worldZ-a.z)<=a.radius;
export function validateContinuation(input,state,token,now=Date.now()){
 if(!input||input.recipe!=='woodcut_firemake'||!['Tree','Oak'].includes(input.target?.name))throw Error('INVALID_CONTINUATION_RECIPE');
 const name=input.target.name,log=name==='Oak'?'Oak logs':'Logs';
 if(input.log?.name!==log)throw Error('CONTINUATION_LOG_MISMATCH');
 const a=input.area;if(!a)throw Error('CONTINUATION_AREA_REQUIRED');
 for(const [key,min,max]of [['x',0,16383],['z',0,16383],['level',0,3],['radius',1,16]])bounded(a[key],min,max,'CONTINUATION_'+key);
 bounded(input.maxActions,1,40,'CONTINUATION_ACTIONS');
 if(!Number.isFinite(input.expiresAt)||input.expiresAt<=now||input.expiresAt>now+120000)throw Error('CONTINUATION_EXPIRY');
 bounded(input.minHp??state.player.hp,1,state.player.maxHp??1000,'CONTINUATION_HP');
 const fireTiles=input.fireTiles??[];if(!Array.isArray(fireTiles)||fireTiles.length>8)throw Error('CONTINUATION_FIRE_TILES');
 for(const t of fireTiles){bounded(t.x,0,16383,'FIRE_X');bounded(t.z,0,16383,'FIRE_Z');if(!inside(a,{worldX:t.x,worldZ:t.z,level:a.level}))throw Error('FIRE_TILE_OUTSIDE_APPROVAL');}
 const g={id:randomUUID(),recipe:input.recipe,target:{name},log:{name:log},area:{x:a.x,z:a.z,level:a.level,radius:a.radius},fireTiles:fireTiles.map(t=>({x:t.x,z:t.z})),token:copy(token),expiresAt:input.expiresAt,remaining:input.maxActions,maxActions:input.maxActions,minHp:input.minHp??state.player.hp,approvedHp:state.player.hp,damageTick:state.player.combat?.lastDamageTick??-1,failures:0,consecutiveFailures:0,blockedTargets:[],blockedTiles:[]};
 if(!inside(a,state.player)||state.player.combat?.inCombat)throw Error('CONTINUATION_UNSAFE_APPROVAL');
 return g;
}
export function continuationUnsafe(g,s){
 if(!inside(g.area,s.player))return 'CONTINUATION_OUTSIDE_AREA';
 if(s.player.combat?.inCombat||s.player.hp<g.approvedHp||s.player.hp<g.minHp||(s.player.combat?.lastDamageTick??-1)>g.damageTick)return 'CONTINUATION_DAMAGE_OR_COMBAT';
 return null;
}
export function nextContinuation(g,s,tick){
 const inventory=s.inventory??[], logs=inventory.filter(i=>i.name===g.log.name).reduce((n,i)=>n+i.count,0);
 if(logs){
  const blocked=g.relocate||s.nearbyLocs?.some(l=>/^fire$/i.test(l.name)&&l.x===s.player.worldX&&l.z===s.player.worldZ);
  if(blocked){
   const tiles=g.fireTiles.filter(t=>Math.max(Math.abs(t.x-s.player.worldX),Math.abs(t.z-s.player.worldZ))>1&&!g.blockedTiles.some(b=>b.x===t.x&&b.z===t.z)&&!s.nearbyLocs?.some(l=>l.x===t.x&&l.z===t.z)).sort((a,b)=>Math.abs(a.x-s.player.worldX)+Math.abs(a.z-s.player.worldZ)-Math.abs(b.x-s.player.worldX)-Math.abs(b.z-s.player.worldZ));
   if(!tiles.length)return {reason:'CONTINUATION_NO_APPROVED_FIRE_TILE'};
   return {command:{action:'walk',...tiles[0],level:g.area.level,tolerance:1,expect:[{type:'position',...tiles[0],level:g.area.level,tolerance:1}],timeoutMs:15000}};
  }
  return {command:{action:'burn_logs',item:copy(g.log),expect:[{type:'inventory_loss',item:copy(g.log),amount:1},{type:'xp_gain',skill:'Firemaking',amount:1}],timeoutMs:15000}};
 }
 if(inventory.length>=28)return {reason:'FULL_INVENTORY'};
 const target=(s.nearbyLocs??[]).filter(l=>l.name===g.target.name&&l.reachable!==false&&inside(g.area,{worldX:l.x,worldZ:l.z,level:l.level})&&!g.blockedTargets.some(b=>b.x===l.x&&b.z===l.z&&b.until>tick)).sort((a,b)=>(a.distance??0)-(b.distance??0))[0];
 if(!target)return {reason:'CONTINUATION_NO_REACHABLE_TARGET'};
 return {command:{action:'chop',target:{name:target.name,id:target.id,x:target.x,z:target.z},expect:[{type:'inventory_gain',item:copy(g.log),amount:1},{type:'xp_gain',skill:'Woodcutting',amount:1}],timeoutMs:15000}};
}

// Unknown/infrastructure failures never become autonomous retries.
export function ordinaryResourceFailure(reason,message=''){
 const text=String(message).slice(0,500);
 if(/auth|unauthor|password|gateway|network|socket|connect|rate.limit|protocol|version|preempt|controller/i.test(text))return false;
 if(['ACTION_DEADLINE','FRESH_RESOURCE_TARGET_NOT_FOUND','FULL_INVENTORY'].includes(reason))return true;
 if(String(reason).startsWith('Target is not currently observed and reachable:'))return true;
 return ['timeout','cant_reach','out_of_reach','inventory_full'].includes(reason)||/felled|No tree|No logs|firemaking|burn|light (?:a )?fire|waiting for fire|cannot reach|could not reach|No path|No route/i.test(text);
}
