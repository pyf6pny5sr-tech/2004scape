import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const dataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '.wartime');
export const databasePath = path.join(dataDirectory, 'knowledge-base.sqlite');
const normalize = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function openKnowledge(filename = databasePath) {
  let db;
  if (globalThis.Bun) {
    const { Database } = await import('bun:sqlite');
    db = new Database(filename, { readonly: true, create: false });
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(filename, { readOnly: true });
  }
  return {
    search(query, { limit = 6, category } = {}) {
      if (typeof query !== 'string' || query.length > 500) throw new Error('Query must be at most 500 characters.');
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Limit must be 1–20.');
      const terms = [...new Set(normalize(query).split(' ').filter(Boolean))].slice(0,20);
      if (!terms.length) return [];
      const where = ['search_index MATCH ?'];
      const params = [terms.map(t => '"' + t + '"').join(' AND ')];
      if (category) { where.push('r.category = ?'); params.push(category); }
      params.push(limit);
      return db.prepare(`SELECT r.data, bm25(search_index,0,7,4,2,1) * CASE WHEN r.evidence_type='derived_from_implementation' THEN 2.5 WHEN r.kind='quest_journal' THEN 1.4 WHEN r.kind='configuration' THEN 0.7 ELSE 1 END AS rank FROM search_index JOIN records r ON r.id=search_index.id WHERE ${where.join(' AND ')} ORDER BY rank LIMIT ?`).all(...params).map(r => JSON.parse(r.data));
    },
    get(id) {
      if (typeof id !== 'string' || id.length > 200) throw new Error('Invalid record ID.');
      const row = db.prepare('SELECT data FROM records WHERE id=?').get(id);
      return row ? JSON.parse(row.data) : null;
    },
    close() { db.close(); }
  };
}
