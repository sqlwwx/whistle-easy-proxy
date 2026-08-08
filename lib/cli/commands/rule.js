const api = require('../rule-api');
const cfg = require('../../config');
const { parse, buildEditContent, findUnknownOperators } = require('../rule-editor');
const {
  warnWhistleNotRunning,
  editInEditor,
  promptConfirm,
  info,
  ok,
  warn,
  err,
  title,
  sep,
  c,
} = require('../helpers');

function registerRule(program) {
  const ruleCmd = program
    .command('rule')
    .description('Whistle 规则管理（离线可用，启动后自动同步）');

  ruleCmd
    .command('list')
    .description('列出所有规则集')
    .action(async () => {
      const running = warnWhistleNotRunning();
      try {
        let data, source;
        if (running) {
          data = await api.listRulesets();
          source = 'whistle（已连接）';
        } else {
          const rules = api.loadOfflineRulesets();
          data = {
            defaultRules: api.getOfflineDefaultRules(),
            list: rules,
            enabledCount: rules.filter((r) => r.enabled).length,
          };
          source = '本地配置';
        }
        title('Whistle 规则集');
        sep();
        const defaultOn = !data.defaultRulesIsDisabled;
        info(
          (defaultOn ? `${c.green}✓` : `${c.red}✗`) +
            c.reset +
            ' 默认规则' +
            c.gray +
            '（内置）' +
            c.reset
        );
        if (data.defaultRules) {
          const lines = data.defaultRules.split('\n').filter((l) => l.trim());
          lines.slice(0, 3).forEach((l) => console.log(`${c.gray}  ${l}${c.reset}`));
          if (lines.length > 3)
            console.log(`${c.gray}  ...（还有 ${lines.length - 3} 行）${c.reset}`);
        }
        const list = data.list || [];
        const groups = {};
        const ungrouped = [];
        let currentGroup = null;
        list.forEach((item) => {
          if (item.name && item.name.charCodeAt(0) === 13) {
            currentGroup = item.name;
            groups[currentGroup] = [];
          } else if (currentGroup) {
            groups[currentGroup].push(item);
          } else {
            ungrouped.push(item);
          }
        });
        if (groups[api.SYSTEM_GROUP]) {
          console.log(`${c.blue}⚙ ${api.SYSTEM_GROUP.slice(1)}${c.reset}`);
          groups[api.SYSTEM_GROUP].forEach((item) => {
            const on = item.selected;
            console.log(`  ${on ? `${c.green}✓` : `${c.red}✗`}${c.reset} ${item.name}`);
          });
        }
        if (groups[api.USER_GROUP]) {
          console.log(`${c.blue}✎ ${api.USER_GROUP.slice(1)}${c.reset}`);
          groups[api.USER_GROUP].forEach((item) => {
            const on = item.selected;
            console.log(`  ${on ? `${c.green}✓` : `${c.red}✗`}${c.reset} ${item.name}`);
            const data = item.data || item.content;
            if (data) {
              const lines = data.split('\n').filter((l) => l.trim());
              lines.slice(0, 3).forEach((l) => console.log(`${c.gray}    ${l}${c.reset}`));
              if (lines.length > 3)
                console.log(`${c.gray}    ...（还有 ${lines.length - 3} 行）${c.reset}`);
            }
          });
        }
        if (ungrouped.length > 0) {
          console.log(`${c.blue}📂 其他规则${c.reset}`);
          ungrouped.forEach((item) => {
            const on = item.selected;
            console.log(`  ${on ? `${c.green}✓` : `${c.red}✗`}${c.reset} ${item.name}`);
          });
        }
        sep();
        info(`共 ${list.length + 1} 个规则集（已启用 ${data.enabledCount} 个）`);
        info(`来源: ${source}`);
        if (running) info('Web 界面: http://local.whistlejs.com/#rules');
      } catch (e) {
        err(e.message);
        process.exit(1);
      }
    });

  ruleCmd
    .command('add <name> [pattern] [target]')
    .description('新增规则集（打开 $EDITOR，或直接指定 pattern+target）')
    .action(async (name, pattern, target) => {
      if (name === 'Default') {
        err('不能添加名为 "Default" 的规则集 — 请使用: easy-proxy rule edit Default');
        return;
      }
      const running = warnWhistleNotRunning();
      const api = require('../rule-api');
      try {
        let content;
        if (pattern && target) {
          content = `${pattern} ${target}`;
          // 校验直接传入的内容
          try {
            parse(content);
          } catch (e) {
            err(e.message);
            return;
          }
        } else {
          // 打开编辑器，带语法提示和校验循环
          let editText = buildEditContent('');
          while (true) {
            try {
              editText = editInEditor(editText, name);
            } catch (_e) {
              info('已取消');
              return;
            }
            try {
              parse(editText);
              break;
            } catch (e) {
              err(e.message);
              warn('解析失败，请修正后重新保存...');
            }
          }
          // 从编辑内容中提取有效规则（去掉注释头部）
          content = editText;
        }
        if (!content.trim()) {
          info('内容为空，已取消');
          return;
        }

        if (running) {
          const data = await api.listRulesets();
          const exists = (data.list || []).some((r) => r.name === name);
          if (exists) {
            err(`规则集 "${name}" 已存在 — 请使用: easy-proxy rule edit ${name}`);
            return;
          }
          await api.createGroup(api.USER_GROUP);
          await api.addRuleset(name, content, api.USER_GROUP);
        }

        if (api.loadOfflineRulesets().some((r) => r.name === name)) {
          err(`规则集 "${name}" 已存在`);
          return;
        }
        cfg.saveRuleset(name, content, false, api.USER_GROUP);
        ok(`规则集 "${name}" 已添加: ${content}`);
      } catch (e) {
        err(e.message);
        process.exit(1);
      }
    });

  ruleCmd
    .command('edit <name>')
    .description('编辑规则集内容（打开 $EDITOR，带语法提示和校验）')
    .action(async (name) => {
      const running = warnWhistleNotRunning();
      try {
        let current = '';
        if (running) {
          const data = await api.listRulesets();
          if (name === 'Default') current = data.defaultRules || '';
          else {
            const item = (data.list || []).find((r) => r.name === name);
            if (!item) {
              err(`规则集 "${name}" 不存在`);
              return;
            }
            current = item.data || '';
          }
        } else {
          if (name === 'Default') current = api.getOfflineDefaultRules() || '';
          else {
            const item = api.loadOfflineRulesets().find((r) => r.name === name);
            if (!item) {
              err(`规则集 "${name}" 不存在`);
              return;
            }
            current = item.content || '';
          }
        }

        // 打开编辑器，带注释头部和语法校验循环
        let editText = buildEditContent(current);
        let parsedRules;
        while (true) {
          try {
            editText = editInEditor(editText, name);
          } catch (_e) {
            info('已取消');
            return;
          }
          try {
            parsedRules = parse(editText);
            break;
          } catch (e) {
            err(e.message);
            warn('解析失败，请修正后重新保存...');
          }
        }

        // 重新格式化回纯规则文本（去掉注释头部）
        const { format } = require('../rule-editor');
        const content = format(parsedRules);

        if (content === current.trim()) {
          info('无改动');
          return;
        }

        // 未知 operator 警告（不阻塞）
        const unknown = findUnknownOperators(parsedRules);
        if (unknown.length > 0) {
          warn(
            `注意：${unknown.length} 个操作符未识别：${unknown.map((u) => u.operator).join(', ')}`
          );
          info('保存继续，如需取消请按 Ctrl+C');
        }

        if (running) await api.addRuleset(name, content);
        if (name === 'Default') cfg.saveRuleset('default', content, true, '');
        else {
          const r = cfg.getRuleset(name);
          if (r) cfg.saveRuleset(name, content, r.enabled, r.group);
        }
        ok(`规则集 "${name}" 已更新（${parsedRules.length} 条规则）`);
      } catch (e) {
        err(e.message);
        process.exit(1);
      }
    });

  ruleCmd
    .command('remove <name>')
    .description('移除规则集')
    .action(async (name) => {
      if (name === 'Default') {
        err('不能移除默认规则集');
        return;
      }
      const running = warnWhistleNotRunning();
      try {
        if (running) {
          const data = await api.listRulesets();
          if (!(data.list || []).some((r) => r.name === name)) {
            err(`规则集 "${name}" 不存在`);
            return;
          }
          const confirmed = await promptConfirm(`删除规则集 "${name}"？(y/N) `);
          if (!confirmed) {
            info('已取消');
            return;
          }
          await api.removeRuleset(name);
        }
        if (!cfg.getRuleset(name)) {
          err(`规则集 "${name}" 不存在`);
          return;
        }
        cfg.deleteRuleset(name);
        ok(`规则集 "${name}" 已移除`);
      } catch (e) {
        err(e.message);
        process.exit(1);
      }
    });

  ruleCmd
    .command('enable <name>')
    .description('启用规则集')
    .action(async (name) => {
      const running = warnWhistleNotRunning();
      try {
        if (running) {
          if (name === 'Default') await api.enableDefault();
          else {
            const data = await api.listRulesets();
            const item = (data.list || []).find((r) => r.name === name);
            if (!item) {
              err(`规则集 "${name}" 不存在`);
              return;
            }
            await api.selectRuleset(name, item.data || '');
          }
        }
        const r = cfg.getRuleset(name);
        if (r) cfg.saveRuleset(name, r.content, true, r.group);
        ok(`规则集 "${name}" 已启用`);
      } catch (e) {
        err(e.message);
        process.exit(1);
      }
    });

  ruleCmd
    .command('disable <name>')
    .description('关闭规则集')
    .action(async (name) => {
      const running = warnWhistleNotRunning();
      try {
        if (running) {
          if (name === 'Default') await api.disableDefault();
          else {
            const data = await api.listRulesets();
            const item = (data.list || []).find((r) => r.name === name);
            if (!item) {
              err(`规则集 "${name}" 不存在`);
              return;
            }
            await api.unselectRuleset(name, item.data || '');
          }
        }
        const r = cfg.getRuleset(name);
        if (r) cfg.saveRuleset(name, r.content, false, r.group);
        ok(`规则集 "${name}" 已关闭`);
      } catch (e) {
        err(e.message);
        process.exit(1);
      }
    });
}

module.exports = {
  registerRule,
};
