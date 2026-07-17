#!/usr/bin/env node
/**
 * AI 秘书 Web 原型 - 一键启动脚本
 * 用法: node start.mjs
 *
 * 前置条件:
 *   1. Node.js >= 16
 *   2. 设置环境变量 ANTHROPIC_API_KEY (可选，不设置则无法使用 AI 问答)
 *
 * 启动后:
 *   - 前端: http://localhost:5173
 *   - 后端: http://localhost:3001
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

// 检查依赖
function checkDependencies() {
  const nodeModules = join(__dirname, 'node_modules');
  if (!existsSync(nodeModules)) {
    log('\n📦 首次运行，正在安装依赖...', colors.yellow);
    return false;
  }
  return true;
}

// 安装依赖
function installDependencies() {
  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install'], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });
    npm.on('close', code => {
      if (code === 0) {
        log('✅ 依赖安装完成', colors.green);
        resolve();
      } else {
        reject(new Error(`npm install 失败，退出码: ${code}`));
      }
    });
  });
}

// 启动服务
async function start() {
  log('\n' + '='.repeat(50), colors.cyan);
  log('  🤖 AI 秘书 Web 原型 - 启动中...', colors.cyan);
  log('='.repeat(50), colors.cyan);

  // 检查 API Key
  if (!process.env.ANTHROPIC_API_KEY) {
    log('\n⚠️  未设置 ANTHROPIC_API_KEY 环境变量', colors.yellow);
    log('   AI 问答功能将不可用，但数据面板仍可正常查看', colors.yellow);
    log('   如需启用 AI，请运行:\n', colors.yellow);
    log('   export ANTHROPIC_API_KEY=sk-ant-...\n', colors.cyan);
  } else {
    log('\n✅ Claude API Key 已配置', colors.green);
  }

  // 检查并安装依赖
  if (!checkDependencies()) {
    await installDependencies();
  }

  log('\n🚀 启动服务...\n', colors.green);

  // 直接启动后端 server.mjs
  const server = spawn('node', ['server.mjs'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', data => {
    process.stdout.write(`${colors.blue}[SERVER]${colors.reset} ${data}`);
  });
  server.stderr.on('data', data => {
    process.stderr.write(`${colors.blue}[SERVER]${colors.reset} ${data}`);
  });

  // 启动前端 vite
  const client = spawn('npx', ['vite', '--host'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  client.stdout.on('data', data => {
    process.stdout.write(`${colors.magenta}[CLIENT]${colors.reset} ${data}`);
  });
  client.stderr.on('data', data => {
    process.stderr.write(`${colors.magenta}[CLIENT]${colors.reset} ${data}`);
  });

  // 错误处理
  server.on('error', err => {
    log(`\n❌ 后端启动失败: ${err.message}`, colors.red);
  });
  client.on('error', err => {
    log(`\n❌ 前端启动失败: ${err.message}`, colors.red);
  });

  // 优雅退出
  const shutdown = () => {
    log('\n\n👋 正在关闭服务...', colors.yellow);
    server.kill('SIGTERM');
    client.kill('SIGTERM');
    setTimeout(() => process.exit(0), 500);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('close', code => {
    if (code !== 0) {
      log(`\n⚠️ 后端进程退出，码: ${code}`, colors.yellow);
    }
    shutdown();
  });

  client.on('close', code => {
    if (code !== 0) {
      log(`\n⚠️ 前端进程退出，码: ${code}`, colors.yellow);
    }
    shutdown();
  });
}

start().catch(err => {
  log(`\n❌ 启动失败: ${err.message}`, colors.red);
  process.exit(1);
});
