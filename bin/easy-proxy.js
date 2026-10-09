#!/usr/bin/env node

const { program } = require('commander');
const { registerAllCommands } = require('../lib/cli/commands');
const { version } = require('../package.json');

program
  .name('easy-proxy')
  .description('EasyProxy CLI — GitHub 加速、SNI 改写、Hosts 管理')
  .version(version);

// 注册所有命令
registerAllCommands(program);

program.parse(process.argv);
