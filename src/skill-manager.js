/**
 * Skill 管理器 - 自动发现和管理技能包
 *
 * 提供统一的技能加载和调用接口喵～🐾
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skill 定义缓存
const skillCache = new Map();

/**
 * 扫描并注册所有可用的 skill
 * @param {string} skillsDir - skill 目录路径
 * @returns {Array<Object>} skill 列表
 */
export function discoverSkills(skillsDir = join(__dirname, '../docs')) {
  const skills = [];

  try {
    // 扫描 docs 目录下的所有子目录
    const dirs = readdirSync(skillsDir, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const skillPath = join(skillsDir, dir.name, 'SKILL.md');

      try {
        // 读取 SKILL.md 文件
        const content = readFileSync(skillPath, 'utf-8');

        // 解析 YAML frontmatter
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (match) {
          const yaml = match[1];
          const metadata = parseYamlFrontmatter(yaml);

          skills.push({
            name: metadata.name || dir.name,
            description: metadata.description || '',
            version: metadata.version || '1.0.0',
            capabilities: metadata.capabilities || [],
            path: skillPath,
            module: `../docs/${dir.name}/SKILL.md`
          });
        }
      } catch (err) {
        // 忽略没有 SKILL.md 的目录
        console.log(`跳过 ${dir.name}: 没有 SKILL.md 文件`);
      }
    }
  } catch (err) {
    console.error('扫描 skills 失败:', err.message);
  }

  return skills;
}

/**
 * 加载指定 skill
 * @param {string} skillName - skill 名称
 * @returns {Object|null} skill 对象或 null
 */
export async function loadSkill(skillName) {
  // 检查缓存
  if (skillCache.has(skillName)) {
    return skillCache.get(skillName);
  }

  // 目前已知的 skills
  const skillModules = {
    'dingpass': () => import('../src/dingpass/index.js')
  };

  const loader = skillModules[skillName];
  if (!loader) {
    console.warn(`未找到 skill: ${skillName}`);
    return null;
  }

  try {
    const module = await loader();
    skillCache.set(skillName, module);
    return module;
  } catch (err) {
    console.error(`加载 skill ${skillName} 失败:`, err.message);
    return null;
  }
}

/**
 * 调用 skill 的功能
 * @param {string} skillName - skill 名称
 * @param {Object} params - 调用参数
 * @returns {Promise<Object>} 调用结果
 */
export async function callSkill(skillName, params) {
  const skill = await loadSkill(skillName);

  if (!skill) {
    throw new Error(`skill ${skillName} 未找到`);
  }

  if (!skill.call) {
    throw new Error(`skill ${skillName} 没有导出 call 函数`);
  }

  return await skill.call(params);
}

/**
 * 获取所有已发现的 skills
 * @returns {Array<Object>} skill 列表
 */
export function getAvailableSkills() {
  return discoverSkills();
}

// 辅助函数：解析 YAML frontmatter
function parseYamlFrontmatter(yaml) {
  const result = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();

      // 处理数组格式 [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim());
      }

      // 去掉引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

// 默认导出
export default {
  discoverSkills,
  loadSkill,
  callSkill,
  getAvailableSkills
};
