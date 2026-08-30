export const MAX_TOOL_ROUNDS = 5
export const MAX_HISTORY_MESSAGES = 20
export const SUGGESTIONS_FENCE = '```suggestions'
export const ADMIN_TOKEN_EXPIRY_HOURS = 24
// Default system prompt is empty — the hard-coded suggestions-format instruction
// in server/ai/loop.ts:buildSystemPrompt guarantees suggestions are always produced.
export const DEFAULT_SYSTEM_PROMPT = ''
export const DEFAULT_APP_NAME = 'Open Agent'
export const DEFAULT_API_ENDPOINT = 'https://api.openai.com/v1'
export const DEFAULT_MODEL = 'gpt-4o'
