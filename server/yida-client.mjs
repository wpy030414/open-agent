/**
 * yida-client.mjs — 宜搭数据客户端（openyida token 模式）
 *
 * 职责：
 *   - 通过 openyida 的 token 认证（Bearer token，自动 refresh）调宜搭内部 HTTP API
 *   - 封装应用列表 / 表单列表 / 数据查询 / Schema
 *   - 定时预计算业务模块缓存，供 AI 问答注入上下文
 *
 * 认证来源：openyida login 写入的 .cache/auth-token-public.json
 * openyida 全局安装路径通过 createRequire 解析，getAccessToken 自动 refresh token。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// 兼容旧引用（server/index.mjs 仍 import COOKIES_FILE），token 模式下指向 token 文件
export const COOKIES_FILE = path.join(PROJECT_ROOT, '.cache', 'auth-token-public.json');

// 解析全局安装的 openyida，复用其 getAccessToken（含自动 refresh）
const require = createRequire(import.meta.url);
let openyidaTokenAuth;
try {
  // 优先从项目本地的 openyida 解析（若装了），否则回退全局路径
  const candidatePaths = [
    path.join(PROJECT_ROOT, 'node_modules', 'openyida', 'lib', 'auth', 'token-auth.js'),
    '/usr/local/node-v24.19.0-linux-x64-glibc-217/lib/node_modules/openyida/lib/auth/token-auth.js',
  ];
  const resolved = candidatePaths.find(p => fs.existsSync(p));
  if (!resolved) throw new Error('openyida 未安装（找不到 token-auth.js）');
  openyidaTokenAuth = require(resolved);
} catch (e) {
  console.error('[yida-client] 加载 openyida token-auth 失败:', e.message);
  openyidaTokenAuth = null;
}

// 读取 token 文件里的静态字段（base_url / corp_id / user_id），access_token 由 getAccessToken 动态获取
function loadTokenMeta() {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      return {
        baseUrl: data.base_url || data.raw?.base_url || null,
        corpId: data.corp_id || null,
        userId: data.user_id || data.raw?.user_id || null,
        userName: data.user_name || data.raw?.user_name || '',
      };
    }
  } catch (e) {
    console.error('[yida-client] 读取 token 元数据失败:', e.message);
  }
  return { baseUrl: null, corpId: null, userId: null, userName: '' };
}

// ==================== 宜搭 API 客户端 ====================

class YidaAPI {
  constructor() {
    this.cookies = null;       // 兼容字段（token 模式不用）
    this.csrfToken = '';       // 兼容字段
    this.reload();
  }

  reload() {
    const meta = loadTokenMeta();
    this.baseUrl = meta.baseUrl;
    this.corpId = meta.corpId;
    this.userId = meta.userId;
    this.userName = meta.userName;
  }

  isAvailable() {
    return !!(this.baseUrl && this.userId);
  }

  // 读取 token 文件的 expires_at（ms），判断 access_token 是否已过期
  isTokenExpired() {
    try {
      const data = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      const exp = data.expires_at || data.raw?.expires_at;
      if (!exp) return false; // 无过期信息，交给业务端 401 兜底
      return Number(exp) <= Date.now() + 60_000; // 提前 1 分钟判过期
    } catch { return false; }
  }

  async getAccessToken() {
    if (!openyidaTokenAuth) return null;
    try {
      // openyida 的 getAccessToken 只在有 access_token 时直接返回、不判过期；
      // 主动检查 expires_at，过期先 refresh，避免一直用过期 token
      if (this.isTokenExpired() && openyidaTokenAuth.tokenRefresh) {
        try { await openyidaTokenAuth.tokenRefresh({ projectRoot: PROJECT_ROOT }); }
        catch (e) { console.error('[yida-client] tokenRefresh 失败:', e.message); }
      }
      return await openyidaTokenAuth.getAccessToken({ projectRoot: PROJECT_ROOT });
    } catch (e) {
      console.error('[yida-client] getAccessToken 失败:', e.message);
      return null;
    }
  }

  // 单次 fetch（不带重试），返回 { ok, status, json }
  async _fetchOnce(apiPath, options, token) {
    const url = new URL(apiPath, this.baseUrl);
    const searchParams = new URLSearchParams(options.params || {});
    searchParams.set('_stamp', String(Date.now()));
    url.search = searchParams.toString();

    const controller = new AbortController();
    const timeoutMs = options.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json, text/plain, */*',
          'Origin': this.baseUrl,
          'Referer': this.baseUrl + '/',
          'X-Requested-With': 'XMLHttpRequest',
          ...options.headers
        },
        body: options.body,
        signal: controller.signal
      });
      const text = await response.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { _rawText: text }; }
      // 401 或响应体标记 token 失效 → 触发上层 refresh 重试
      const invalid = response.status === 401 ||
        json?.status === 'invalid_access_token' ||
        json?.status === 'access_token_expired';
      return { invalid, json };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async request(apiPath, options = {}) {
    if (!this.isAvailable()) throw new Error('宜搭未登录（token 不可用，请先 openyida login）');
    let token = await this.getAccessToken();
    if (!token) throw new Error('宜搭 token 获取失败');

    let { invalid, json } = await this._fetchOnce(apiPath, options, token);
    // token 失效 → refresh 后重试一次（对齐 openyida requestWithAutoLogin 语义）
    if (invalid && openyidaTokenAuth?.tokenRefresh) {
      try {
        await openyidaTokenAuth.tokenRefresh({ projectRoot: PROJECT_ROOT });
        token = await this.getAccessToken();
        if (token) ({ invalid, json } = await this._fetchOnce(apiPath, options, token));
      } catch (e) {
        console.error('[yida-client] 401 重试 refresh 失败:', e.message);
      }
    }
    return json;
  }

  async getApps() {
    return this.request('/query/app/getAppList.json', {
      params: { _api: 'nattyFetch', _mock: 'false', pageIndex: 1, pageSize: 100 }
    });
  }

  async getForms(appType) {
    return this.request(`/dingtalk/web/${appType}/query/formnav/getFormNavigationListByOrder.json`, {
      params: { _api: 'Nav.queryList', _mock: 'false' }
    });
  }

  async queryFormData(appType, formUuid, pageNo = 1, pageSize = 100) {
    return this.request(`/dingtalk/web/${appType}/v1/form/searchFormDatas.json`, {
      params: { formUuid, appType, currentPage: pageNo, pageSize }
    });
  }

  async queryProcessData(appType, formUuid, pageNo = 1, pageSize = 100) {
    return this.request(`/dingtalk/web/${appType}/v1/process/getInstances.json`, {
      params: { formUuid, currentPage: pageNo, pageSize }
    });
  }

  async getFormSchema(appType, formUuid) {
    return this.request(`/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`, {
      params: { formUuid, schemaVersion: 'V5' }
    });
  }
}

export const yida = new YidaAPI();

// ==================== 模块索引（只存元数据，不存 record） ====================

export let CACHE = { lastUpdated: null, modules: {}, dataSource: 'yida' };

function precomputeCache() {
  const now = new Date();
  console.log(`[${now.toISOString()}] 开始构建模块索引...`);

  if (yida.isAvailable()) {
    buildModuleIndex()
      .then(data => {
        Object.assign(CACHE, {
          lastUpdated: new Date().toISOString(),
          modules: data,
          dataSource: 'yida'
        });
        const count = Object.keys(CACHE.modules).length;
        console.log(`[预计算] 模块索引完成，共 ${count} 个表单`);
        console.log(`[${new Date().toISOString()}] 缓存更新完成（宜搭元数据）`);
      })
      .catch(e => {
        console.error('模块索引构建失败:', e.message);
        CACHE.lastUpdated = new Date().toISOString();
      });
  } else {
    console.log('宜搭未连接，等待登录...');
  }

  return CACHE;
}

// 只拉应用列表 + 表单列表（元数据），不拉实际 record
async function buildModuleIndex() {
  const result = {};

  try {
    const apps = await yida.getApps();
    const appList = apps?.content?.data || apps?.apps || [];
    console.log('获取到应用数:', appList.length);

    for (const app of appList) {
      const appType = app.appType;
      const appName = app.appName?.zh_CN || app.appName;
      try {
        const forms = await yida.getForms(appType);
        const formList = forms?.content || forms?.data || [];
        const realForms = formList.filter(f => f && f.formUuid && f.formType);
        for (const form of realForms) {
          result[form.formUuid] = {
            formUuid: form.formUuid,
            formName: form.title?.zh_CN || form.formName || form.title,
            appType,
            appName,
            formType: form.formType
          };
        }
        console.log(`  应用 ${appName}: ${realForms.length} 个表单`);
      } catch (e) {
        console.error(`  获取应用 ${appName} 表单列表失败:`, e.message);
      }
    }
  } catch (e) {
    console.error('获取应用列表失败:', e.message);
  }

  return result;
}

// ==================== 工具执行器（AI tool_use → 实时宜搭查询） ====================

function summarizeRecord(r, formType) {
  const base = {
    title: r.title || '',
  };
  if (r.originator) {
    base.originator = r.originator?.name?.zh_CN || r.originator?.name || '';
  }
  if (r.gmtCreate) base.gmtCreate = r.gmtCreate;
  if (formType === 'process') {
    if (r.instanceStatus) base.instanceStatus = r.instanceStatus;
    if (r.approvedResult) base.approvedResult = r.approvedResult;
  }
  return base;
}

export async function executeTool(name, input = {}) {
  switch (name) {
    case 'yida_app_list': {
      const apps = await yida.getApps();
      const list = (apps?.content?.data || apps?.apps || []).map(a => ({
        appType: a.appType,
        appName: a.appName?.zh_CN || a.appName
      }));
      return { apps: list, total: list.length };
    }

    case 'yida_form_list': {
      if (!input.appType) throw new Error('缺少 appType');
      const forms = await yida.getForms(input.appType);
      const list = (forms?.content || forms?.data || [])
        .filter(f => f?.formUuid && f?.formType)
        .map(f => ({
          formUuid: f.formUuid,
          formName: f.title?.zh_CN || f.formName || f.title,
          formType: f.formType
        }));
      return { forms: list, total: list.length };
    }

    case 'yida_form_data': {
      const { appType, formUuid, formType, page = 1, size = 50 } = input;
      if (!appType || !formUuid) throw new Error('缺少 appType 或 formUuid');
      const isProcess = formType === 'process';
      const raw = isProcess
        ? await yida.queryProcessData(appType, formUuid, page, Math.min(size, 50))
        : await yida.queryFormData(appType, formUuid, page, Math.min(size, 50));
      const records = (raw?.content?.data || raw?.data || []).map(r => ({
        ...r,
        _summary: summarizeRecord(r, formType)
      }));
      return {
        records,
        count: records.length,
        total: raw?.content?.totalCount || raw?.totalCount || records.length,
        page
      };
    }

    case 'yida_form_schema': {
      const { appType, formUuid } = input;
      if (!appType || !formUuid) throw new Error('缺少 appType 或 formUuid');
      const raw = await yida.getFormSchema(appType, formUuid);
      const schema = raw?.content || raw?.data || raw || {};
      const components = (schema.components || schema.componentList || []).map(c => ({
        id: c.id || c.componentId,
        type: c.type || c.componentType,
        label: c.title?.zh_CN || c.label || c.title || ''
      }));
      return { formUuid, components, count: components.length };
    }

    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// 启动定时缓存刷新（模块加载时调用一次）
export function startPrecompute() {
  precomputeCache();
  setInterval(precomputeCache, 6 * 60 * 60 * 1000);
}
