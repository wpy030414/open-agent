/**
 * yida-client.mjs — 宜搭数据客户端
 *
 * 职责：
 *   - 读取 .cache/cookies-public.json 认证信息
 *   - 封装宜搭内部 HTTP API（应用列表 / 表单列表 / 数据查询 / Schema）
 *   - 定时预计算业务模块缓存，供 AI 问答注入上下文
 *
 * 注意：cookie 过期由上游钉钉 OAuth 登录保障，此处不做自动刷新。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 宜搭 cookies 缓存文件（由 tools/export-yida-cookies.cjs 或 openyida login 写入）
export const COOKIES_FILE = path.join(__dirname, '..', '.cache', 'cookies-public.json');

// ==================== 宜搭 API 客户端 ====================

class YidaAPI {
  constructor() {
    this.cookies = null;
    this.baseUrl = null;
    this.loadCookies();
  }

  loadCookies() {
    try {
      if (fs.existsSync(COOKIES_FILE)) {
        const data = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
        this.baseUrl = data.base_url;
        this.cookies = data.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const find = (name) => data.cookies.find(c => c.name === name)?.value;
        this.csrfToken = find('tianshu_csrf_token') || find('c_csrf') || '';
        const corpUser = find('tianshu_corp_user') || '';
        this.userId = corpUser.includes('_') ? corpUser.split('_').pop() : (find('userId') || '');
        this.orgId = find('corp_id') || find('tianshu_corp_id') || '';
        return true;
      }
    } catch (e) {
      console.error('加载 cookies 失败:', e.message);
    }
    return false;
  }

  isAvailable() {
    return !!(this.cookies && this.baseUrl && this.csrfToken);
  }

  async request(apiPath, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('宜搭未登录');
    }

    const url = new URL(apiPath, this.baseUrl);
    const searchParams = new URLSearchParams(options.params || {});
    if (options._csrf !== false) {
      searchParams.set('_csrf_token', this.csrfToken);
      searchParams.set('_stamp', String(Date.now()));
    }
    url.search = searchParams.toString();

    const controller = new AbortController();
    const timeoutMs = options.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: {
          'Cookie': this.cookies,
          'Accept': 'application/json, text/plain, */*',
          'Origin': this.baseUrl,
          'Referer': this.baseUrl + '/',
          'X-Requested-With': 'XMLHttpRequest',
          'global_csrf_token': this.csrfToken,
          ...options.headers
        },
        body: options.body,
        signal: controller.signal
      });
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getApps() {
    return this.request('/query/app/getAppList.json', {
      params: { _api: 'nattyFetch', _mock: 'false', pageIndex: 1, pageSize: 50 }
    });
  }

  async getForms(appType) {
    return this.request(`/dingtalk/web/${appType}/query/formnav/getFormNavigationListByOrder.json`, {
      params: { _api: 'Nav.queryList', _mock: 'false' },
      _csrf: false
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
      params: { formUuid, schemaVersion: 'V5' },
      _csrf: false
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
