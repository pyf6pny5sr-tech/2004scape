#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const args=process.argv.slice(2), options={limit:8,json:false,full:false}, terms=[];
const usage='Usage: node search.mjs "search terms" [--limit 8] [--category quests] [--source lostcity-content] [--json] [--full]\n       node search.mjs --id RECORD_ID [--json]\nCategories: quests, skills, areas, drops, minigames, tutorial, interface, general, engine, guides, guidance';
for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--help'||a==='-h'){console.log(usage);process.exit(0);}
  if(['--json','--full'].includes(a)){options[a.slice(2)]=true;continue;}
  if(['--limit','--category','--source','--id'].includes(a)){
    if(!args[i+1]||args[i+1].startsWith('--')){console.error('Missing value for '+a);process.exit(2);}
    options[a.slice(2)]=args[++i];continue;
  }
  if(a.startsWith('--')){console.error('Unknown option '+a);process.exit(2);}
  terms.push(a);
}
options.limit=Number(options.limit);
if(!Number.isInteger(options.limit)||options.limit<1||options.limit>100){console.error('--limit must be 1–100');process.exit(2);}
const query=terms.join(' ').trim();
const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const tokens=[...new Set(normalize(query).split(' ').filter(Boolean))].slice(0,20);
if(!options.id&&!tokens.length){console.log(usage);process.exit(query?2:0);}
const database=new DatabaseSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'knowledge-base.sqlite'),{readOnly:true});
let rows;
if(options.id){rows=database.prepare('SELECT data FROM records WHERE id=?').all(options.id);}
else{
  const where=['search_index MATCH ?'],params=[tokens.map(t=>'"'+t+'"').join(' AND ')];
  if(options.category){where.push('r.category=?');params.push(options.category);}
  if(options.source){where.push('r.source_id=?');params.push(options.source);}
  rows=database.prepare(`SELECT r.data,bm25(search_index,0,7,4,2,1) * CASE WHEN r.evidence_type='derived_from_implementation' THEN 2.5 WHEN r.kind='quest_journal' THEN 1.4 WHEN r.kind='configuration' THEN 0.7 ELSE 1 END AS rank FROM search_index JOIN records r ON r.id=search_index.id WHERE ${where.join(' AND ')} ORDER BY rank LIMIT ?`).all(...params,options.limit);
}
const results=rows.map(row=>JSON.parse(row.data));
database.close();
if(options.json){console.log(JSON.stringify({query:options.id||query,count:results.length,search_type:'keyword',results},null,2));}
else if(!results.length){console.log('No results. Try fewer words, a quest name, an item name, or a skill.');}
else for(const r of results){
  const display=options.full||options.id?r.text:r.text.slice(0,750)+(r.text.length>750?'\n[Use --id '+r.id+' for the full record.]':'');
  console.log(`${r.title}\nID: ${r.id}\n${r.category} | ${r.evidence_type} | ${r.revision}${r.has_uncertainty?' | source uncertainty flagged':''}\n${r.source_url||'Local explanatory guidance'}\n${display}\n`);
}
