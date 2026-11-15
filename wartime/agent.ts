import { WartimeController } from './controller.mjs';
import { openKnowledge } from './knowledge.mjs';
import { withExecutionDeadline } from '../sdk/execution-context.ts';

// RS-SDK MCP entry point. Install this directory as <rs-sdk>/wartime/.
// The existing MCP host supplies its authenticated bot and SDK instances.
export default async function main({ bot, sdk, args = {} }: any) {
  const operation = args.operation ?? 'observe';
  if (operation === 'search' || operation === 'record') {
    const kb = await openKnowledge();
    try { return operation === 'search' ? kb.search(args.query, {limit:args.limit??6,category:args.category}) : kb.get(args.id); }
    finally { kb.close(); }
  }
  const controller = new WartimeController({ bot, sdk });
  switch(operation) {
    case 'observe': return { observation:controller.observe(), goal:await controller.memory.goal(), skills:await controller.memory.listSkills() };
    case 'checkpoint': return controller.memory.checkpoint(args.goal);
    case 'skills': return controller.memory.listSkills();
    case 'remember': return controller.memory.remember(args.name,args.episodeId,args.description);
    case 'episode': return controller.memory.episode(args.id);
    case 'run_plan': case 'run_skill': {
      const timeoutMs=args.timeoutMs??60000;
      if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000) throw new Error('timeoutMs must be 1000–60000.');
      return withExecutionDeadline(timeoutMs,
        ()=>operation==='run_plan'?controller.runPlan(args.plan):controller.runSkill(args.name),
        ()=>({status:'timeout',message:'Execution deadline reached. Further SDK waits and actions were cancelled. An action already sent may still complete; observe before replanning.'}));
    }
    default: throw new Error('Unknown operation. Use observe, search, record, checkpoint, skills, episode, run_plan, run_skill or remember.');
  }
}
