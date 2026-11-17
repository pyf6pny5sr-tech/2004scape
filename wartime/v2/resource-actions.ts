// Supported SDK packets with dispatch-time observation baselines. No planning/provider.
import { copy } from './protocol.mjs';
const count=(s:any,name:string)=>(s?.inventory??[]).filter((i:any)=>i.name?.toLowerCase()===name.toLowerCase()).reduce((n:number,i:any)=>n+i.count,0);
const xp=(s:any,name:string)=>s?.skills?.find((i:any)=>i.name===name)?.experience??0;
export async function resourceAction(sdk:any,bot:any,c:any,valid:()=>boolean){
 await bot.dismissBlockingUI();
 if(!valid())throw Error('INVALID_OWNER');
 const before=copy(sdk.getState()),received=sdk.getStateReceivedAt();
 if(c.action==='walk'&&c.resourceFireMove===true){
  if(c.level!==before.player.level)return {success:false,reason:'path_incomplete',message:'Fire move plane mismatch',observationBaseline:before,baselineReceivedAt:received};
  const empty=(s:any)=>!(s.nearbyLocs??[]).some((l:any)=>l.level===s.player.level&&l.x===s.player.worldX&&l.z===s.player.worldZ)&&!(c.avoidTiles??[]).some((t:any)=>t.x===s.player.worldX&&t.z===s.player.worldZ);
  const arrived=(s:any)=>s.player.level===c.level&&Math.max(Math.abs(s.player.worldX-c.x),Math.abs(s.player.worldZ-c.z))<=(c.tolerance??0)&&(s.player.worldX!==before.player.worldX||s.player.worldZ!==before.player.worldZ)&&empty(s);
  const result=await sdk.sendWalk(c.x,c.z,true);if(!result.success)return {...result,observationBaseline:before,baselineReceivedAt:received};
  try{const state=await sdk.waitForCondition((s:any)=>{if(!valid())throw Error('INVALID_OWNER');return arrived(s);},Math.max(100,(c.timeoutMs??7000)-500));return {success:arrived(state),observationBaseline:before,baselineReceivedAt:received};}
  catch(e:any){if(!valid()||e?.message!=='waitForCondition timed out')throw e;return {success:false,reason:'path_incomplete',message:'No verified moved-to empty fire tile',observationBaseline:before,baselineReceivedAt:received};}
 }
 if(c.action==='chop'){
  const selector=c.target;
  const candidates=(sdk.getState()?.nearbyLocs??[]).filter((l:any)=>l.level===before.player.level&&l.reachable!==false&&(selector.name?l.name.toLowerCase()===selector.name.toLowerCase():l.id===selector.id)&&(!selector.exact||(l.x===selector.x&&l.z===selector.z&&(selector.id===undefined||l.id===selector.id)))).sort((a:any,b:any)=>((a.x===selector.x&&a.z===selector.z)?-1:0)-((b.x===selector.x&&b.z===selector.z)?-1:0)||(a.distance??0)-(b.distance??0));
  const tree=candidates[0];if(!tree)return {success:false,reason:'resource_unavailable',message:'No matching reachable tree',observationBaseline:before,baselineReceivedAt:received};
  const log=tree.name==='Oak'?'Oak logs':'Logs',initial=count(before,log);let goneAt:number|null=null;
  const result=await sdk.sendInteractLoc(tree.x,tree.z,tree.id,1);
  if(!result.success)return {...result,observationBaseline:before,baselineReceivedAt:received,resolvedTarget:copy(tree)};
  try{
   const state=await sdk.waitForCondition((s:any)=>{
    if(!valid())throw Error('INVALID_OWNER');
    if(count(s,log)>initial&&xp(s,'Woodcutting')>xp(before,'Woodcutting'))return true;
    if(!s.nearbyLocs.some((l:any)=>l.id===tree.id&&l.x===tree.x&&l.z===tree.z)){goneAt??=s.tick;return s.tick-goneAt>=3;}
    return false;
   },Math.max(500,(c.timeoutMs??15000)-500));
   const success=count(state,log)>initial&&xp(state,'Woodcutting')>xp(before,'Woodcutting');
   return {success,reason:success?undefined:'resource_depleted',message:success?'Observed log and XP':'Tree depleted without observed log/XP',observationBaseline:before,baselineReceivedAt:received,resolvedTarget:copy(tree)};
  }catch(e:any){if(!valid()||e?.message!=='waitForCondition timed out')throw e;return {success:false,reason:'resource_timeout',message:'No observed chop effect before deadline',observationBaseline:before,baselineReceivedAt:received,resolvedTarget:copy(tree)};}
 }
 const log=c.item.name,item=sdk.getState()?.inventory.find((i:any)=>i.name.toLowerCase()===log.toLowerCase()),tinder=sdk.getState()?.inventory.find((i:any)=>/tinderbox/i.test(i.name));
 if(!item||!tinder)return {success:false,reason:'resource_unavailable',message:'No current logs or tinderbox',observationBaseline:before,baselineReceivedAt:received};
 if((before.nearbyLocs??[]).some((l:any)=>l.level===before.player.level&&/^fire$/i.test(l.name)&&l.x===before.player.worldX&&l.z===before.player.worldZ))return {success:false,reason:'fire_blocked',message:'Observed fire occupies current tile',observationBaseline:before,baselineReceivedAt:received};
 const messageCursor=Math.max(0,...(before.gameMessages??[]).map((m:any)=>m.observationId??m.tick??0));
 const blocked=(s:any)=>(s.gameMessages??[]).some((m:any)=>(m.observationId??m.tick??0)>messageCursor&&/can't light a fire|you need to move|can't do that here/i.test(m.text));
 const result=await sdk.sendUseItemOnItem(tinder.slot,item.slot);if(!result.success)return {...result,observationBaseline:before,baselineReceivedAt:received};
 let dialogTick=-10;
 const deadline=Date.now()+Math.max(500,(c.timeoutMs??15000)-500);
 try{
  while(Date.now()<deadline){
   if(!valid())throw Error('INVALID_OWNER');
   const state=await sdk.waitForCondition((s:any)=>{
    if(!valid())throw Error('INVALID_OWNER');
    return (xp(s,'Firemaking')>xp(before,'Firemaking')&&count(s,log)<count(before,log))||blocked(s)||(!!s.dialog?.isOpen&&s.tick-dialogTick>=3);
   },Math.max(1,deadline-Date.now()));
   if(xp(state,'Firemaking')>xp(before,'Firemaking')&&count(state,log)<count(before,log))return {success:true,observationBaseline:before,baselineReceivedAt:received};
   if(blocked(state))return {success:false,reason:'fire_blocked',message:'Fresh fire-location refusal',observationBaseline:before,baselineReceivedAt:received};
   dialogTick=state.tick;
   const option=state.dialog?.options?.find((o:any)=>/continue|light|burn|fire/i.test(o.text));
   const clicked=await sdk.sendClickDialog(option?.index??0);
   if(!clicked.success)throw Error('RESOURCE_DIALOG_REFUSED');
  }
  return {success:false,reason:'resource_timeout',message:'No observed burn effect before deadline',observationBaseline:before,baselineReceivedAt:received};
 }catch(e:any){if(!valid()||e?.message!=='waitForCondition timed out')throw e;return {success:false,reason:'resource_timeout',message:'No observed burn effect before deadline',observationBaseline:before,baselineReceivedAt:received};}
}
