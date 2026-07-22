/**
 * 钉钉 API 客户端工具
 *
 * 提供统一的钉钉 API 调用接口，处理认证、签名、重试等逻辑喵～🐾
 */

import crypto from 'crypto';

// 从环境变量读取配置
const APP_KEY = process.env.DINGTALK_CLIENT_ID || '';
const APP_SECRET = process.env.DINGTALK_CLIENT_SECRET || '';

// 钉钉 API 基础 URL
const DINGTALK_API_BASE = 'https://oapi.dingtalk.com';
const DINGTALK_TOPAPI_BASE = 'https://oapi.dingtalk.com/topapi';

/**
 * 生成钉钉 API 签名
 * @param {string} appSecret - 应用密钥
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {string} Base64 编码的签名
 */
export function generateSignature(appSecret, timestamp) {
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(Buffer.from(String(timestamp)));
  return hmac.digest('base64');
}

/**
 * 获取 access_token
 * @returns {Promise<string>} access_token
 */
export async function getAccessToken() {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('缺少钉钉应用凭证，请设置 DINGTALK_CLIENT_ID 和 DINGTALK_CLIENT_SECRET');
  }

  const url = `${DINGTALK_API_BASE}/gettoken?appkey=${APP_KEY}&appsecret=${APP_SECRET}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.errcode !== 0) {
      throw new Error(`获取 access_token 失败: ${data.errmsg}`);
    }

    return data.access_token;
  } catch (error) {
    throw new Error(`获取 access_token 失败: ${error.message}`);
  }
}

/**
 * 调用钉钉服务端 API（带 token 自动刷新）
 * @param {string} path - API 路径
 * @param {Object} params - 查询参数
 * @param {Object} body - 请求体
 * @param {string} method - 请求方法
 * @returns {Promise<Object>} API 响应
 */
export async function callDingTalkApi(path, params = {}, body = null, method = 'GET') {
  let accessToken = await getAccessToken();
  const url = new URL(`${DINGTALK_API_BASE}${path}`);

  // 添加查询参数
  url.searchParams.set('access_token', accessToken);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    let response = await fetch(url.toString(), options);

    // 如果 token 过期，刷新后重试一次
    if (response.status === 401 || response.status === 403) {
      accessToken = await getAccessToken();
      url.searchParams.set('access_token', accessToken);
      response = await fetch(url.toString(), options);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 检查钉钉 API 错误码
    if (data.errcode && data.errcode !== 0) {
      throw new Error(`钉钉 API 错误 [${data.errcode}]: ${data.errmsg || data.sub_msg}`);
    }

    return data;
  } catch (error) {
    throw new Error(`调用钉钉 API ${path} 失败: ${error.message}`);
  }
}

/**
 * 调用钉钉 TOP API（POST 方式，使用 topapi 前缀）
 * @param {string} apiName - API 名称（如 v2.department.listsub）
 * @param {Object} request - 请求体
 * @returns {Promise<Object>} API 响应
 */
export async function callTopApi(apiName, request = {}) {
  const path = `/topapi/${apiName}`;
  return callDingTalkApi(path, {}, request, 'POST');
}

/**
 * 分页获取所有数据
 * @param {Function} fetchPage - 获取单页数据的函数
 * @param {number} pageSize - 每页大小
 * @returns {Promise<Array>} 所有数据
 */
export async function fetchAllPages(fetchPage, pageSize = 20) {
  const allItems = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const { items, has_more } = await fetchPage(cursor, pageSize);
    allItems.push(...items);
    cursor += items.length;
    hasMore = has_more;
  }

  return allItems;
}

// 导出常量
export const API_PATHS = {
  // 部门相关
  DEPARTMENT_LIST: '/topapi/v2/department/listsub',
  DEPARTMENT_GET: '/topapi/v2/department/get',
  DEPARTMENT_CREATE: '/topapi/v2/department/create',
  DEPARTMENT_UPDATE: '/topapi/v2/department/update',
  DEPARTMENT_DELETE: '/topapi/v2/department/delete',

  // 员工相关
  USER_GET: '/topapi/v2/user/get',
  USER_LIST: '/topapi/v2/user/listsimple',
  USER_SEARCH: '/topapi/v2/user/search',

  // 考勤相关
  ATTENDANCE_CHECKIN: '/topapi/attendance/getusercheckin',
  LEAVE_SUBMIT: '/topapi/oa/approval/create',
  OVERTIME_SUBMIT: '/topapi/attendance/overtime/create',
  ATTENDANCE_STATS: '/topapi/attendance/getusergroupstats'
};
