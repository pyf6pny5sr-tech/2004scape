// Run with Bun from an RS-SDK checkout containing wartime/ next to sdk/.
import { test, expect } from 'bun:test';
import { BotSDK } from '../../sdk/index';
import { BotActions } from '../../sdk/actions';
import { executionContext } from '../../sdk/execution-context';
import main from '../agent';
import { executeCode } from '../../mcp/execute-code';

function harness() {
  const sdk = new BotSDK({botUsername:'entrytest',password:'PRIVATE_TEST_SENTINEL',gatewayUrl:'wss://rs-sdk-demo.fly.dev/gateway',autoLaunchBrowser:false,autoReconnect:false});
  const internal = sdk as any;
  internal.state={inGame:true,tick:1,revision:1,player:{name:'entrytest',worldX:3200,worldZ:3200,level:0,hp:10,maxHp:10,lifeId:1,isDead:false,combat:{inCombat:false},animId:-1},inventory:[],equipment:[],skills:[],nearbyLocs:[],nearbyNpcs:[],groundItems:[],gameMessages:[],dialog:{isOpen:false,options:[]},bank:{isOpen:false},interface:{isOpen:false}};
  internal.stateReceivedAt=Date.now();internal.connectionState='connected';internal.ws={readyState:WebSocket.OPEN};
  const packets:any[]=[];
  internal.send=(message:any)=>{packets.push(message);queueMicrotask(()=>internal.pendingActions.get(message.actionId)?.resolve({success:true}));};
  sdk.sendFindPath=async()=>({success:true,reachedDestination:true,waypoints:[{x:3208,z:3200,level:0}]});
  return {sdk,bot:new BotActions(sdk),internal,packets};
}
const plan={goal:'Walk',steps:[{action:'walk',x:3208,z:3200,level:0,expect:[{type:'position',x:3208,z:3200,level:0}]}]};

test('actual entry point cancels real SDK waits and dispatch, releases its lock, and redacts config',async()=>{
  const h=harness();
  // Isolate the test's character memory from any other test invocation.
  h.sdk.config.botUsername='entry'+Date.now();
  const observed=await main({...h,args:{operation:'observe'}});
  expect(JSON.stringify(observed)).not.toContain('PRIVATE_TEST_SENTINEL');
  const result=await main({...h,args:{operation:'run_plan',plan,timeoutMs:1000}});
  expect(result.status).toBe('timeout');
  await Bun.sleep(30);
  expect(h.internal.stateListeners.size).toBe(0);
  expect(h.internal.pendingActions.size).toBe(0);
  expect(h.packets.length).toBe(1);
  await main({...h,args:{operation:'checkpoint',goal:{description:'Lock released after timeout'}}});
  await Bun.sleep(20);
  expect(h.packets.length).toBe(1);
});

test('parent cancellation reaches the actual agent and real SDK',async()=>{
  const h=harness();h.sdk.config.botUsername='parent'+Date.now();
  const abort=new AbortController();
  const running=executionContext.run({signal:abort.signal},()=>main({...h,args:{operation:'run_plan',plan,timeoutMs:60000}}));
  await Bun.sleep(30);abort.abort(new Error('parent cancelled'));
  await expect(running).rejects.toThrow('parent cancelled');
  await Bun.sleep(30);
  expect(h.internal.stateListeners.size).toBe(0);
  expect(h.internal.pendingActions.size).toBe(0);
  await main({...h,args:{operation:'checkpoint',goal:{description:'Cancellation lock released'}}});
});

test('entry point retrieves real cited SQLite records under Bun',async()=>{
  for(const query of ["Cook's Assistant",'iron mining','XP units','Rune Mysteries']) {
    const results=await main({args:{operation:'search',query}});
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].evidence_refs.length).toBeGreaterThan(0);
    expect(await main({args:{operation:'record',id:results[0].id}})).toEqual(results[0]);
  }
});

test('actual MCP execute_code loads the agent script and forwards JSON arguments',async()=>{
  const h=harness();h.sdk.config.botUsername='mcptest'+Date.now();
  const connection={sdk:h.sdk,bot:h.bot,username:h.sdk.config.botUsername,connected:true,lastShownMessageTick:-1};
  const manager={get:()=>connection,connect:async()=>connection};
  const result=await executeCode(manager as any,h.sdk.config.botUsername,{script:new URL('../agent.ts',import.meta.url).pathname},2000,undefined,undefined,{args:{operation:'observe'},world:'none'});
  expect(result.isError).toBeUndefined();
  expect(JSON.stringify(result)).toContain('https://rs-sdk-demo.fly.dev');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_TEST_SENTINEL');
});
