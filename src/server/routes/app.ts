import { Hono } from 'hono'
import { getConfig } from '../config.js'

export const appRoute = new Hono()

// Public: get app name and favicon for white-label branding
appRoute.get('/', async (c) => {
  const config = await getConfig()
  return c.json({ app_name: config.app_name, app_favicon: config.app_favicon, app_background: config.app_background, support_attachments: config.support_attachments, show_github: config.show_github })
})
