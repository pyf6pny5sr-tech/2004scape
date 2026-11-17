import { randomUUID } from 'node:crypto';
// Explicit ordinary-resource goal authority. Standing goals execute bounded chunks, never invent goals. No SDK access here.
import { bounded, copy } from './protocol.mjs';
export function validateContinuation(input,state,token,now=Date.now()){
 if(!input||input.recipe!=='woodcut_firemake'||!['Tree','Oak'].includes(input.target?.name))throw Error('INVALID_CONTINUATION_RECIPE');
 const name=input.target.name,log=name==='Oak'?'Oak logs':'Logs';
 if(input.log?.name!==log)throw Error('CONTINUATION_LOG_MISMATCH');
 bounded(input.maxActions??80,1,80,'CONTINUATION_ACTIONS');
 const mode=input.mode??'bounded';if(!['standing','bounded'].includes(mode))throw Error('INVALID_CONTINUATION_MODE');
 if(mode==='standing'&&input.expiresAt!==undefined)throw Error('STANDING_GOAL_HAS_NO_WALL_CLOCK_EXPIRY');
 if(mode==='bounded'&&(!Number.isFinite(input.expiresAt)||input.expiresAt<=now||input.expiresAt>now+180000))throw Error('CONTINUATION_EXPIRY');
 const fireTiles=input.fireTiles??[];if(!Array.isArray(fireTiles)||fireTiles.length>8)throw Error('CONTINUATION_FIRE_TILES');
 for(const t of fireTiles){bounded(t.x,0,16383,'FIRE_X');bounded(t.z,0,16383,'FIRE_Z');}
 const g={mode,chunk:1,id:randomUUID(),recipe:input.recipe,target:{name},log:{name:log},fireTiles:fireTiles.map(t=>({x:t.x,z:t.z})),token:copy(token),expiresAt:mode==='standing'?null:input.expiresAt,remaining:input.maxActions??80,maxActions:input.maxActions??80,failures:0,consecutiveFailures:0,blockedTargets:[],blockedTiles:[]};
 return g;
}
export function nextContinuation(g,s,tick){
 const inventory=s.inventory??[], logs=inventory.filter(i=>i.name===g.log.name).reduce((n,i)=>n+i.count,0);
 if(logs){
  const blocked=g.relocate||s.nearbyLocs?.some(l=>l.level===s.player.level&&/^fire$/i.test(l.name)&&l.x===s.player.worldX&&l.z===s.player.worldZ);
  if(blocked){
   const defaults=[[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[2,2],[-3,0],[3,0],[0,-3],[0,3]].map(([dx,dz])=>({x:s.player.worldX+dx,z:s.player.worldZ+dz}));
   const tiles=[...g.fireTiles,...defaults].filter(t=>t.x>=0&&t.x<=16383&&t.z>=0&&t.z<=16383&&Math.max(Math.abs(t.x-s.player.worldX),Math.abs(t.z-s.player.worldZ))>1&&!g.blockedTiles.some(b=>b.x===t.x&&b.z===t.z)&&!s.nearbyLocs?.some(l=>l.level===s.player.level&&l.x===t.x&&l.z===t.z)).sort((a,b)=>Math.abs(a.x-s.player.worldX)+Math.abs(a.z-s.player.worldZ)-Math.abs(b.x-s.player.worldX)-Math.abs(b.z-s.player.worldZ));
   if(!tiles.length)return {reason:'CONTINUATION_NO_APPROVED_FIRE_TILE'};
   return {command:{action:'walk',...tiles[0],level:s.player.level,tolerance:1,resourceFireMove:true,avoidTiles:g.blockedTiles.map(b=>({x:b.x,z:b.z})),expect:[{type:'position',...tiles[0],level:s.player.level,tolerance:1}],timeoutMs:7000}};
  }
  return {command:{action:'burn_logs',item:copy(g.log),expect:[{type:'inventory_loss',item:copy(g.log),amount:1},{type:'xp_gain',skill:'Firemaking',amount:1}],timeoutMs:15000}};
 }
 if(inventory.length>=28)return {reason:'FULL_INVENTORY'};
 const target=(s.nearbyLocs??[]).filter(l=>l.name===g.target.name&&l.reachable!==false&&l.level===s.player.level&&!g.blockedTargets.some(b=>b.x===l.x&&b.z===l.z&&b.until>tick)).sort((a,b)=>(a.distance??0)-(b.distance??0))[0];
 if(!target)return {reason:'CONTINUATION_NO_REACHABLE_TARGET'};
 return {command:{action:'chop',target:{name:target.name,id:target.id,x:target.x,z:target.z},expect:[{type:'inventory_gain',item:copy(g.log),amount:1},{type:'xp_gain',skill:'Woodcutting',amount:1}],timeoutMs:15000}};
}

// Unknown/infrastructure failures never become autonomous retries.
export function ordinaryResourceFailure(reason,message=''){
 const text=String(message).slice(0,500);
 reason=String(reason??'').toUpperCase();
 if(/auth|unauthor|password|gateway|network|socket|connect|rate.limit|protocol|version|preempt|controller/i.test(text))return false;
 if(['ACTION_DEADLINE','FRESH_RESOURCE_TARGET_NOT_FOUND','FULL_INVENTORY','RESOURCE_UNAVAILABLE','RESOURCE_DEPLETED','RESOURCE_TIMEOUT','FIRE_BLOCKED','PATH_INCOMPLETE','RESOURCE_HELPER_DELAY','RESOURCE_EFFECT_TIMEOUT','RESOURCE_DIALOG_REFUSED'].includes(reason))return true;
 if(String(reason).startsWith('Target is not currently observed and reachable:'))return true;
 return ['TIMEOUT','CANT_REACH','OUT_OF_REACH','INVENTORY_FULL'].includes(reason)||/felled|No tree|No logs|firemaking|burn|light (?:a )?fire|waiting for fire|cannot reach|could not reach|No path|No route/i.test(text);
}

export const continuationLive=(g,now=Date.now())=>!!g&&(g.mode==='standing'||(g.expiresAt>now&&g.remaining>0));
