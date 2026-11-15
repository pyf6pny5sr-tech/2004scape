import { mkdir, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dataDirectory, databasePath, openKnowledge } from './knowledge.mjs';

const url = 'https://github.com/pyf6pny5sr-tech/2004scape/releases/download/v1.0.0/knowledge-base.sqlite.gz';
const expectedHash = 'fdc12d27a11b49b1aa90340ebac1a4c96b6f0a827bec7692b6c4fcab024cbfaf';
await mkdir(dataDirectory, { recursive: true });
try {
  await stat(databasePath);
  console.log('Knowledge database already exists. No file changed.');
  process.exit(0);
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
if (!response.ok) throw new Error('Download failed: HTTP ' + response.status);
const compressed = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(compressed).digest('hex') !== expectedHash) throw new Error('Download fingerprint does not match the published library.');
const temporary = databasePath + '.' + randomUUID() + '.part';
try {
  await writeFile(temporary, gunzipSync(compressed, { maxOutputLength: 150_000_000 }), { flag: 'wx' });
  const kb = await openKnowledge(temporary);
  try { if (!kb.search("Cook's Assistant").length) throw new Error('Knowledge search check failed.'); } finally { kb.close(); }
  await rename(temporary, databasePath);
} finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
console.log('Knowledge database downloaded and search checked. No game connection was opened.');
