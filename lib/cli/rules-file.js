const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { debug } = require('../debug');

const CONFIG_DIR = path.join(os.homedir(), '.easy-proxy');
const RULESETS_DIR = path.join(CONFIG_DIR, 'rulesets');
const META_FILE = 'meta.json';
const META_PATH = path.join(RULESETS_DIR, META_FILE);

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir || CONFIG_DIR, { recursive: true });
  } catch (e) {
    debug('rules-file ensureDir failed:', e.message);
  }
}

function loadMeta() {
  ensureDir(RULESETS_DIR);
  try {
    if (fs.existsSync(META_PATH)) {
      return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    }
  } catch (e) {
    debug('loadMeta failed:', e.message);
  }
  return {};
}

function saveMeta(meta) {
  ensureDir(RULESETS_DIR);
  try {
    fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  } catch (e) {
    debug('saveMeta failed:', e.message);
  }
}

function listRulesets() {
  ensureDir(RULESETS_DIR);
  const meta = loadMeta();
  const results = [];

  try {
    const files = fs.readdirSync(RULESETS_DIR).filter((f) => f.endsWith('.txt'));
    for (const file of files) {
      const name = path.basename(file, '.txt');
      const content = fs.readFileSync(path.join(RULESETS_DIR, file), 'utf8');
      results.push({
        name,
        content,
        enabled: meta[name]?.enabled !== false,
        group: meta[name]?.group || '',
      });
    }
  } catch (e) {
    debug('listRulesets failed:', e.message);
  }

  return results;
}

function getRuleset(name) {
  ensureDir(RULESETS_DIR);
  const file = path.join(RULESETS_DIR, `${name}.txt`);
  try {
    if (fs.existsSync(file)) {
      const meta = loadMeta();
      return {
        name,
        content: fs.readFileSync(file, 'utf8'),
        enabled: meta[name]?.enabled !== false,
        group: meta[name]?.group || '',
      };
    }
  } catch (e) {
    debug('getRuleset failed for', `${name}:`, e.message);
  }
  return null;
}

function saveRuleset(name, content, enabled, group) {
  ensureDir(RULESETS_DIR);
  const file = path.join(RULESETS_DIR, `${name}.txt`);
  try {
    fs.writeFileSync(file, content, 'utf8');
    const meta = loadMeta();
    meta[name] = { enabled, group };
    saveMeta(meta);
    return true;
  } catch (e) {
    debug('saveRuleset failed for', `${name}:`, e.message);
  }
  return false;
}

function deleteRuleset(name) {
  const file = path.join(RULESETS_DIR, `${name}.txt`);
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      const meta = loadMeta();
      delete meta[name];
      saveMeta(meta);
      return true;
    }
  } catch (e) {
    debug('deleteRuleset failed for', `${name}:`, e.message);
  }
  return false;
}

module.exports = {
  RULESETS_DIR,
  listRulesets,
  getRuleset,
  saveRuleset,
  deleteRuleset,
};
