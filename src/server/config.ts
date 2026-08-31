import 'dotenv/config'
import { db } from './db.js'
import { settings } from './schema.js'
import { eq } from 'drizzle-orm'
import type { AppConfig } from '../shared/types.js'
import {
  DEFAULT_APP_NAME,
  DEFAULT_API_ENDPOINT,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
} from '../shared/constants.js'

// .env values (read at startup, not hot-reloadable)
export const env = {
  ADMIN_KEY: process.env.ADMIN_KEY || '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || DEFAULT_API_ENDPOINT,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  PORT: parseInt(process.env.PORT || '3001', 10),
}

// Runtime config (stored in DB, hot-reloadable by admin)
async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get()
  return row?.value ?? fallback
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.select().from(settings).where(eq(settings.key, key)).get()
  if (existing) {
    await db.update(settings).set({ value }).where(eq(settings.key, key)).run()
  } else {
    await db.insert(settings).values({ key, value }).run()
  }
}

export async function getConfig(): Promise<AppConfig> {
  return {
    app_name: await getSetting('app_name', DEFAULT_APP_NAME),
    app_favicon: await getSetting('app_favicon', ''),
    app_background: await getSetting('app_background', ''),
    api_endpoint: await getSetting('api_endpoint', env.OPENAI_BASE_URL),
    api_key: await getSetting('api_key', env.OPENAI_API_KEY),
    model: await getSetting('model', env.OPENAI_MODEL),
    system_prompt: await getSetting('system_prompt', DEFAULT_SYSTEM_PROMPT),
    support_attachments: (await getSetting('support_attachments', 'false')) === 'true',
  }
}

export async function updateConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      const stored = key === 'support_attachments' ? (value ? 'true' : 'false') : value
      await setSetting(key, stored as string)
    }
  }
  return getConfig()
}
