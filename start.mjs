#!/usr/bin/env node
/**
 * AI 秘书 Web 原型 - 一键全栈启动
 * 用法: node start.mjs
 *
 * 1. 首次运行自动 npm install
 * 2. 检查 API Key
 * 3. 启动后端 + 前端
 */
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { spawn } from 'child_process';

config();
const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. 依赖缺失 → 自动安装
if (!existsSync(join(__dirname, 'node_modules'))) {
  console.log('📦 首次运行，正在安装依赖...');
  const cp = spawn('npm', ['install'], { cwd: __dirname, stdio: 'inherit', shell: true });
  await new Promise(r => cp.on('exit', code => { if (code !== 0) process.exit(code); r(); }));
}

// 2. API Key 未配置 → 提示
if (!process.env.OPENAI_API_KEY) {
  console.log('⚠️  未设置 OPENAI_API_KEY，AI 问答不可用\n');
}

// 3. 启动后端 + 前端
const server = spawn('node', ['server/index.mjs'], { cwd: __dirname, stdio: 'inherit' });
const client = spawn('npx', ['vite', '--host'],   { cwd: __dirname, stdio: 'inherit' });

const cleanup = () => { server.kill(); client.kill(); process.exit(); };
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
