import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, rename, rmdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dataDirectory } from './knowledge.mjs';

const safeName = value => {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) throw new Error('Use a skill name of 1–64 lowercase letters, digits, dashes or underscores.');
  return value;
};
export class Memory {
  constructor({ world, player, directory = dataDirectory }) {
    this.world = world; this.player = player;
    const key = createHash('sha256').update(world + '\0' + player.toLowerCase()).digest('hex').slice(0,24);
    this.directory = path.join(directory, 'agents', key);
  }
  async initialize() {
    for (const name of ['episodes', 'skills']) await mkdir(path.join(this.directory, name), { recursive: true });
  }
  async exclusive(work) {
    await this.initialize();
    const lock = path.join(this.directory, 'controller.lock');
    try { await mkdir(lock); } catch (e) {
      if (e.code === 'EEXIST') throw new Error('This character already has an active Wartime operation. After a crash, remove its controller.lock directory only after stopping all controllers.');
      throw e;
    }
    try { return await work(); } finally { await rmdir(lock); }
  }
  async writeJson(filename, value) {
    const temporary = filename + '.' + randomUUID() + '.part';
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, filename);
  }
  async record(episode) {
    await this.initialize();
    const id = Date.now() + '-' + randomUUID();
    const value = { schemaVersion: 1, id, world: this.world, player: this.player, recordedAt: new Date().toISOString(), ...episode };
    await this.writeJson(path.join(this.directory, 'episodes', id + '.json'), value);
    return value;
  }
  async episode(id) {
    if (typeof id !== 'string' || !/^\d+-[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid episode ID.');
    return JSON.parse(await readFile(path.join(this.directory, 'episodes', id + '.json'), 'utf8'));
  }
  async listSkills() {
    await this.initialize();
    const names = (await readdir(path.join(this.directory, 'skills'))).filter(n => n.endsWith('.json')).sort();
    return Promise.all(names.map(n => readFile(path.join(this.directory, 'skills', n), 'utf8').then(JSON.parse)));
  }
  async skill(name) {
    return JSON.parse(await readFile(path.join(this.directory, 'skills', safeName(name) + '.json'), 'utf8'));
  }
  async remember(name, episodeId, description) {
    safeName(name);
    if (typeof description !== 'string' || !description.trim() || description.length > 2000) throw new Error('Supply a brief skill description.');
    return this.exclusive(async () => {
      const episode = await this.episode(episodeId);
      if (episode.world !== this.world || episode.player !== this.player || episode.status !== 'verified' || !episode.steps?.length || episode.steps.some(s => s.status !== 'verified')) {
        throw new Error('Only an episode with observed success for every step can become a skill.');
      }
      const skill = { schemaVersion: 1, name, description, world: this.world, player: this.player, episodeId, learnedAt: new Date().toISOString(), evidence: 'Observed postconditions in one run; not proof of general reliability or optimality.', plan: episode.plan };
      await this.writeJson(path.join(this.directory, 'skills', name + '.json'), skill);
      return skill;
    });
  }
  async checkpoint(goal) {
    if (!goal || typeof goal.description !== 'string' || !goal.description.trim() || goal.description.length > 2000) throw new Error('A checkpoint needs a goal description of 1–2000 characters.');
    const value = { description: goal.description, nextStep: String(goal.nextStep || '').slice(0,2000), updatedAt: new Date().toISOString() };
    return this.exclusive(async () => { await this.writeJson(path.join(this.directory, 'goal.json'), value); return value; });
  }
  async goal() {
    try { return JSON.parse(await readFile(path.join(this.directory, 'goal.json'), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
}
