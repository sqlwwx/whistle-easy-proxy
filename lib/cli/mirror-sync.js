/**
 * 镜像规则集 → whistle 同步
 * 规则集名统一加 "mirror-" 前缀放独立分组，关闭 = 从 whistle 删除规则集，
 * 不污染用户的自定义规则空间。
 */

const MIRROR_GROUP = '\rEasyProxy 镜像加速';
const RULESET_PREFIX = 'mirror-';

/**
 * 把当前开关状态同步到 whistle（规则集存在性 = 开关状态）
 * @returns {Promise<{added: string[], removed: string[]}>}
 */
async function syncMirrors() {
  const api = require('./rule-api');
  const { MIRROR_RULESETS } = require('./mirror-rulesets');
  const { loadMirrorState } = require('./commands/mirror');
  const state = loadMirrorState();

  await api.createGroup(MIRROR_GROUP);
  const added = [];
  const removed = [];

  for (const [name, rule] of Object.entries(MIRROR_RULESETS)) {
    const rulesetName = RULESET_PREFIX + name;
    if (state[name] === true) {
      await api.addRuleset(rulesetName, rule, MIRROR_GROUP);
      await api.selectRuleset(rulesetName, rule);
      added.push(rulesetName);
    } else {
      // 关闭 = 删除规则集（不存在时 remove 返回错误，忽略）
      try {
        await api.removeRuleset(rulesetName);
        removed.push(rulesetName);
      } catch (_e) {
        // 本来就没开，跳过
      }
    }
  }

  return { added, removed };
}

module.exports = {
  syncMirrors,
  MIRROR_GROUP,
  RULESET_PREFIX,
};
