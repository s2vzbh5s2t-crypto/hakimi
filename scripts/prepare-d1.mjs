#!/usr/bin/env node
/**
 * 自动准备 D1（供 Workers Builds / GitHub Actions 使用）：
 *   1. 查找名为 hakimi 的 D1 数据库，不存在则创建
 *   2. 把真实 database_id 写入构建环境的 wrangler.toml（无需提交回仓库）
 *   3. 应用数据库迁移
 *
 * 前提：构建环境的 wrangler 已认证（Workers Builds 自带；
 *       但其默认 token 没有 D1 权限，需在 Build 设置里换成含 D1 Edit 的自定义 token）
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DB_NAME = 'hakimi';

const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

let id = '';
try {
  const list = JSON.parse(run('npx wrangler d1 list --json'));
  id = list.find((d) => d.name === DB_NAME)?.uuid ?? '';
} catch {
  // 列表失败（比如还没有任何数据库）时走创建流程
}

if (!id) {
  console.log(`D1 "${DB_NAME}" 不存在，正在创建…`);
  const out = run(`npx wrangler d1 create ${DB_NAME}`);
  id = out.match(/"?database_id"?\s*[:=]\s*"([^"]+)"/)?.[1] ?? '';
}
if (!id) {
  console.error('无法获取 D1 database_id（检查构建环境的 wrangler 认证与 D1 权限）');
  process.exit(1);
}

const toml = readFileSync('wrangler.toml', 'utf8');
writeFileSync('wrangler.toml', toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${id}"`));
console.log(`D1 "${DB_NAME}" database_id = ${id}`);

run(`npx wrangler d1 migrations apply ${DB_NAME} --remote`);
console.log('数据库迁移完成');
