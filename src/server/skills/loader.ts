import fs from 'fs'
import path from 'path'
import type { SkillManifest, InstalledSkill } from '../../shared/types.js'

const SKILLS_DIR = path.resolve('skills')

interface Frontmatter {
  name: string
  description: string
  version?: string
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: { name: 'unknown', description: '' }, body: content }
  }

  const yamlStr = match[1]
  const body = match[2].trim()

  // Simple YAML parser for flat key: value pairs
  const frontmatter: Record<string, string> = {}
  for (const line of yamlStr.split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/)
    if (m) {
      frontmatter[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }

  return {
    frontmatter: {
      name: frontmatter.name || 'unknown',
      description: frontmatter.description || '',
      version: frontmatter.version,
    },
    body,
  }
}

function loadSkill(skillDir: string): InstalledSkill | null {
  const skillPath = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillPath)) return null

  try {
    const raw = fs.readFileSync(skillPath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(raw)

    return {
      manifest: {
        name: frontmatter.name,
        description: frontmatter.description,
        version: frontmatter.version,
      },
      content: body,
      path: skillDir,
    }
  } catch (err) {
    console.error(`Failed to load skill from ${skillDir}:`, err)
    return null
  }
}

function scanSkillsDir(): InstalledSkill[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
    return []
  }

  const skills: InstalledSkill[] = []
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skill = loadSkill(path.join(SKILLS_DIR, entry.name))
    if (skill) skills.push(skill)
  }
  return skills
}

class SkillRegistryClass {
  private skills: Map<string, InstalledSkill> = new Map()

  constructor() {
    this.refresh()
  }

  refresh(): void {
    this.skills.clear()
    for (const skill of scanSkillsDir()) {
      this.skills.set(skill.manifest.name, skill)
    }
  }

  get(name: string): InstalledSkill | undefined {
    return this.skills.get(name)
  }

  getAll(): InstalledSkill[] {
    return [...this.skills.values()]
  }

  remove(name: string): boolean {
    return this.skills.delete(name)
  }
}

export const skillRegistry = new SkillRegistryClass()
