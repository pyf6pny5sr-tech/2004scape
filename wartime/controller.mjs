import { Memory } from './memory.mjs';

export const WORLD = 'https://rs-sdk-demo.fly.dev';
const clone = value => JSON.parse(JSON.stringify(value));
const norm = value => String(value).toLowerCase();
const integer = (v, low, high, label) => {
  if (!Number.isSafeInteger(v) || v < low || v > high) throw new Error(`${label} must be an integer between ${low} and ${high}.`);
  return v;
};
const text = (v, label) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 200) throw new Error(`${label} must be a nonempty string of at most 200 characters.`);
  return v;
};
function selector(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s) || (s.id === undefined && s.name === undefined)) throw new Error('Target needs an exact name or numeric id.');
  if (s.name !== undefined) text(s.name, 'Target name');
  if (s.id !== undefined) integer(s.id, 0, 1000000, 'Target id');
  return s;
}
const matches = (item, s) => (s.id === undefined || item.id === s.id) && (s.name === undefined || norm(item.name) === norm(s.name));
const count = (items, s) => (items || []).filter(i => matches(i,s)).reduce((n,i) => n+i.count,0);
const xp = (state, skill) => state.skills?.find(s => norm(s.name) === norm(skill))?.experience;

export function validateExpectation(e) {
  if (!e || typeof e !== 'object') throw new Error('Expected outcome must be an object.');
  switch (e.type) {
    case 'inventory_gain': case 'inventory_loss':
      selector(e.item); integer(e.amount, 1, 1000000, 'Item quantity'); break;
    case 'xp_gain': text(e.skill, 'Skill'); integer(e.amount, 1, 1000000, 'XP gain'); break;
    case 'hp_gain': integer(e.amount, 1, 1000, 'HP gain'); break;
    case 'position': integer(e.x, 0, 16383, 'X'); integer(e.z, 0, 16383, 'Z'); integer(e.level, 0, 3, 'Plane'); integer(e.tolerance ?? 0, 0, 5, 'Tolerance'); break;
    case 'bank_open': if (typeof e.value !== 'boolean') throw new Error('bank_open value must be boolean.'); break;
    case 'equipped': selector(e.item); break;
    case 'dialog_changed': break;
    default: throw new Error('Unsupported expected outcome: ' + e.type);
  }
}
export function checkExpectation(e, before, after) {
  switch (e.type) {
    case 'inventory_gain': return count(after.inventory,e.item)-count(before.inventory,e.item) >= e.amount;
    case 'inventory_loss': return count(before.inventory,e.item)-count(after.inventory,e.item) >= e.amount;
    case 'xp_gain': { const b=xp(before,e.skill), a=xp(after,e.skill); return Number.isFinite(b) && Number.isFinite(a) && a-b >= e.amount; }
    case 'hp_gain': return after.player.hp-before.player.hp >= e.amount;
    case 'position': return after.player.level===e.level && Math.abs(after.player.worldX-e.x)<= (e.tolerance??0) && Math.abs(after.player.worldZ-e.z)<= (e.tolerance??0);
    case 'bank_open': return after.bank?.isOpen===e.value;
    case 'equipped': return (after.equipment||[]).some(i=>matches(i,e.item));
    case 'dialog_changed': return JSON.stringify(before.dialog)!==JSON.stringify(after.dialog);
    default: return false;
  }
}

const TARGET_ACTIONS = new Set(['chop','mine','talk','interact_object','interact_npc','pickup','eat','equip','deposit','withdraw','use_item_on_object','use_item_on_npc','attack_npc']);
const ACTIONS = new Set([...TARGET_ACTIONS,'walk','open_bank','close_bank','close_interface','dialog_choice','dialog_continue','burn_logs']);
export function validateStep(step) {
  if (!step || !ACTIONS.has(step.action)) throw new Error('Unsupported action.');
  if (!Array.isArray(step.expect) || !step.expect.length || step.expect.length>5) throw new Error('Each step needs 1–5 explicit expected outcomes.');
  step.expect.forEach(validateExpectation);
  if (TARGET_ACTIONS.has(step.action)) selector(step.target);
  if (step.action==='walk') { integer(step.x,0,16383,'X'); integer(step.z,0,16383,'Z'); integer(step.level,0,3,'Plane'); integer(step.tolerance??0,0,5,'Tolerance'); }
  if (['use_item_on_object','use_item_on_npc','burn_logs'].includes(step.action)) selector(step.item);
  if (['interact_object','interact_npc'].includes(step.action)) text(step.option,'Visible option');
  if (step.action==='dialog_choice') text(step.text,'Dialogue choice');
  if (['deposit','withdraw'].includes(step.action)) integer(step.amount,1,1000000,'Amount');
  if (step.verifyTimeoutMs!==undefined) integer(step.verifyTimeoutMs,1,30000,'Verification timeout');
  if (step.preconditions!==undefined && (!Array.isArray(step.preconditions)||step.preconditions.length>10)) throw new Error('At most 10 preconditions are supported.');
  for(const p of step.preconditions||[]) {
    if (p.type==='inventory_at_least') {selector(p.item);integer(p.amount,1,1000000,'Required quantity');}
    else if(p.type==='skill_at_least') {text(p.skill,'Required skill');integer(p.level,1,99,'Required level');}
    else if(p.type==='hp_at_least') integer(p.amount,1,1000,'Required HP');
    else throw new Error('Unsupported precondition.');
  }
}

export class WartimeController {
  constructor({ sdk, bot, directory, maxStateAgeMs = 3000 }) {
    this.sdk=sdk; this.bot=bot;
    this.maxStateAgeMs=integer(maxStateAgeMs,1,10000,'Maximum state age');
    const gateway=new URL(sdk.config.gatewayUrl || `ws://${sdk.config.host}:${sdk.config.port}`);
    if(gateway.origin !== 'wss://rs-sdk-demo.fly.dev' || gateway.pathname!=='/gateway' || gateway.search || gateway.username || gateway.password) throw new Error('Controller is configured only for wss://rs-sdk-demo.fly.dev/gateway. Correct SERVER/GATEWAY_URL before connecting.');
    this.player=text(sdk.config.botUsername,'Bot username');
    this.memory=new Memory({world:WORLD,player:this.player,directory});
  }
  ready() {
    const state=this.sdk.getState();
    if(!this.sdk.isConnected() || !state?.inGame || !state.player) throw new Error('No connected, in-game character state.');
    const age=this.sdk.getStateAge();
    if(!Number.isFinite(age)||age<0||age>this.maxStateAgeMs) throw new Error('Game state is stale; observe a fresh state before acting.');
    if(state.player.isDead || state.player.hp<=0) throw new Error('Character is dead; re-observe after respawn and replan.');
    return clone(state);
  }
  observe() {
    const state=this.sdk.getState();
    if(!state) return {world:WORLD,connected:this.sdk.isConnected(),inGame:false,state:null};
    // Copy only game observations. SDK configuration contains credentials and is never returned.
    const keys=['tick','revision','inGame','player','skills','inventory','equipment','nearbyNpcs','nearbyLocs','groundItems','dialog','interface','bank','shop','modalOpen','modalInterface','prayers','combatStyle'];
    const visible=Object.fromEntries(keys.filter(k=>state[k]!==undefined).map(k=>[k,state[k]]));
    return clone({world:WORLD,connected:this.sdk.isConnected(),stateAgeMs:this.sdk.getStateAge(),knowledgeRevision:'274 baseline; live modifications must be checked',state:visible});
  }
  resolve(list, target, plane) {
    const candidates=(list||[]).filter(i=>matches(i,target)&&i.reachable!==false&&(plane===undefined||i.level===plane)).sort((a,b)=>(a.distance??0)-(b.distance??0));
    if(!candidates.length) throw new Error('Target is not currently observed and reachable: '+JSON.stringify(target));
    return candidates[0];
  }
  async dispatch(step,state) {
    const b=this.bot, s=this.sdk;
    const inventory=()=>this.resolve(state.inventory,step.target);
    const loc=()=>this.resolve(state.nearbyLocs,step.target,state.player.level);
    const npc=()=>this.resolve(state.nearbyNpcs,step.target);
    const option=(target)=>{
      const found=target.optionsWithIndex?.find(o=>norm(o.text)===norm(step.option));
      if(!found) throw new Error('Requested option is not visible on the current target.');
      return found.opIndex;
    };
    switch(step.action) {
      case 'walk': if(step.level!==state.player.level) throw new Error('Walking cannot change planes. Interact with the observed staircase or ladder.'); return b.walkTo(step.x,step.z,step.tolerance??0,{timeout:30000});
      case 'chop': return b.chopTree(loc());
      case 'mine': return b.mineRock(loc(),{timeout:30000});
      case 'talk': return b.talkTo(npc());
      case 'interact_object': {const target=loc();return b.interactLoc(target,option(target));}
      case 'interact_npc': {const target=npc();return b.interactNpc(target,option(target));}
      case 'pickup': return b.pickupItem(this.resolve(state.groundItems,step.target));
      case 'eat': return b.eatFood(inventory());
      case 'equip': return b.equipItem(inventory());
      case 'open_bank': return b.openBank();
      case 'close_bank': return b.closeBank();
      case 'close_interface': return b.closeInterface();
      case 'deposit': if(!state.bank?.isOpen) throw new Error('Open the bank first.'); return b.depositItem(inventory(),step.amount);
      case 'withdraw': if(!state.bank?.isOpen) throw new Error('Open the bank first.'); return b.withdrawItem(this.resolve(state.bank.items,step.target),step.amount);
      case 'use_item_on_object': return b.useItemOnLoc(this.resolve(state.inventory,step.item),loc(),{timeout:30000});
      case 'use_item_on_npc': return b.useItemOnNpc(this.resolve(state.inventory,step.item),npc(),{timeout:30000});
      case 'burn_logs': return b.burnLogs(this.resolve(state.inventory,step.item));
      case 'attack_npc': return b.attack(npc());
      case 'dialog_choice': {
        if(!state.dialog?.isOpen || !state.dialog.options.some(o=>norm(o.text)===norm(step.text))) throw new Error('Dialogue choice is not currently visible.');
        const escaped=step.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        return s.clickDialogByText(new RegExp('^'+escaped+'$','i'));
      }
      case 'dialog_continue':
        if(!state.dialog?.isOpen || state.dialog.options.length) throw new Error('Continue is only available on a dialogue page with no choices.');
        return s.sendClickDialog(0);
    }
  }
  async step(step) {
    const before=this.ready();
    if(this.sdk.getConnectionMode?.()!=='control') throw new Error('This SDK connection does not own character control.');
    for(const p of step.preconditions||[]) {
      const ok=p.type==='inventory_at_least'?count(before.inventory,p.item)>=p.amount:p.type==='hp_at_least'?before.player.hp>=p.amount:before.skills.some(s=>norm(s.name)===norm(p.skill)&&s.baseLevel>=p.level);
      if(!ok) throw new Error('Precondition failed: '+JSON.stringify(p));
    }
    const priorReceived=this.sdk.getStateReceivedAt();
    const summary=s=>({tick:s.tick,revision:s.revision,player:s.player,inventory:s.inventory,skills:s.skills,equipment:s.equipment,dialog:s.dialog,bank:s.bank});
    if(step.expect.every(e=>['position','bank_open','equipped'].includes(e.type)&&checkExpectation(e,before,before))) {
      return {status:'already_satisfied',before:summary(before),after:summary(before),message:'Expected state already holds; no action sent.'};
    }
    const result=await this.dispatch(step,before);
    if(result?.success===false) return {status:'failed',result:clone(result),before:summary(before),after:summary(this.sdk.getState()||before)};
    let after, verificationError;
    const verified=state=>{
      const age=this.sdk.getStateAge();
      const fresh=(state.revision!==undefined&&before.revision!==undefined?state.revision>before.revision:state.tick>before.tick||this.sdk.getStateReceivedAt()>priorReceived);
      return fresh && age<=this.maxStateAgeMs && state.inGame && state.player && !state.player.isDead && state.player.hp>0 && state.player.lifeId===before.player.lifeId && step.expect.every(e=>checkExpectation(e,before,state));
    };
    try {
      const current=this.sdk.getState();
      after=verified(current)?clone(current):clone(await this.sdk.waitForCondition(verified,step.verifyTimeoutMs??10000));
    } catch(e) {verificationError=String(e.message||e);after=clone(this.sdk.getState()||before);}
    return {status:!verificationError&&verified(after)?'verified':'unverified',result:result===undefined?null:clone(result),verificationError,before:summary(before),after:summary(after),criteria:step.expect};
  }
  async runPlan(plan) {
    if(!plan||typeof plan.goal!=='string'||!plan.goal.trim()||plan.goal.length>2000||!Array.isArray(plan.steps)||!plan.steps.length||plan.steps.length>10) throw new Error('A plan needs a goal and 1–10 steps.');
    plan.steps.forEach(validateStep);
    // Snapshot caller input so it cannot change between validation and dispatch.
    const fixed=clone({goal:plan.goal,recordIds:Array.isArray(plan.recordIds)?plan.recordIds.filter(x=>typeof x==='string').slice(0,30):[],steps:plan.steps});
    return this.memory.exclusive(async()=>{
      const steps=[];
      for(const step of fixed.steps) {
        try {steps.push(await this.step(step));}
        catch(e) {steps.push({status:'failed',message:String(e.message||e)});}
        if(!['verified','already_satisfied'].includes(steps.at(-1).status)) break;
      }
      const status=steps.length===fixed.steps.length&&steps.every(s=>s.status==='verified')?'verified':steps.length===fixed.steps.length&&steps.every(s=>['verified','already_satisfied'].includes(s.status))?'satisfied':'needs_replan';
      return this.memory.record({status,plan:fixed,steps});
    });
  }
  async runSkill(name) {
    const skill=await this.memory.skill(name);
    if(skill.world!==WORLD||skill.player!==this.player) throw new Error('Skill belongs to another world or character.');
    return this.runPlan(skill.plan);
  }
}
