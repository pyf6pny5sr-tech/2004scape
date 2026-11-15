import { openKnowledge } from './knowledge.mjs';
const query=process.argv.slice(2).join(' ').trim();
if(!query) { console.error('Usage: node wartime/search.mjs "iron mining"'); process.exit(2); }
const kb=await openKnowledge();
try {console.log(JSON.stringify(kb.search(query),null,2));} finally {kb.close();}
