/**
 * i18n 配置 - 玫东智能体 Web 原型
 *
 * 多语言包结构：{ 'zh-CN': { ... }, 'en-US': { ... } }
 * 当前仅实现中文，英文等未来补充
 */

const zhCN = {
  // ==================== 白标化：产品信息 ====================
  product: {
    name: '玫东智能体',
    shortName: '玫东智能体',
    tagline: '您的智能业务数据分析助手',
    description: '请登录以接入组织全部业务数据',
    features: '销售 · 财务 · 人力资源 · 项目交付',
  },

  // ==================== 登录页 ====================
  login: {
    title: '玫东智能体',
    subtitle: '您的智能业务数据分析助手',
    description: '请登录以接入组织全部业务数据',
    features: '销售 · 财务 · 人力资源 · 项目交付',
    button: '本机免登登录',
    buttonDingTalk: '钉钉登录',
    buttonLoading: '正在登录...',
    tip: '将自动使用本机已登录的宜搭身份',
    tipDingTalkReady: '将跳转至钉钉完成授权登录',
    tipDingTalkNotConfigured: '钉钉登录未配置，请在 .env 设置 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET / DINGTALK_REDIRECT_URI',
    featuresList: [
      { icon: 'chart', text: '实时数据查询' },
      { icon: 'rocket', text: '智能业务分析' },
      { icon: 'people', text: '团队协作支持' },
    ],
  },

  // ==================== 回调页 ====================
  callback: {
    loggingIn: '正在登录...',
    verifying: '请稍候，正在完成钉钉身份验证',
    backToHome: '返回首页',
  },

  // ==================== 主界面 ====================
  app: {
    sidebar: {
      newChat: '新建对话',
      emptyState: '暂无历史对话',
      expandSidebar: '展开侧边栏',
      collapseSidebar: '收起侧边栏',
      deleteConversation: '删除',
      settings: '设置',
      footer: {
        modelBadge: '玫东智能体',
        cacheInfo: '数据每 6 小时更新',
        themeToggle: '切换主题',
      },
    },
    topBar: {
      brand: '玫东智能体',
    },
    home: {
      greeting: '您好，{userName}',
      subtitle: '我是您的 玫东智能体，已接入组织全部业务数据',
      subtitle2: '可以即时回答您的业务问询，并自动调取相关数据分析',
      inputPlaceholder: '发送消息...',
      inputHint: '玫东智能体会基于组织真实数据回答，但可能偶尔出错，请核查关键数据',
      questionAttendance: '{formName}最新数据如何？共{totalCount}条记录',
      questionApproval: '{formName}有多少待处理？共{totalCount}条',
      questionCourse: '{formName}开展情况如何？共{totalCount}条记录',
      questionDefault: '{formName}数据概况？共{totalCount}条',
    },
    chat: {
      inputPlaceholder: '发送消息...',
      inputHint: '玫东智能体会基于组织真实数据回答，但可能偶尔出错，请核查关键数据',
      loading: 'AI 正在分析数据...',
      cacheBadge: '已调取 {module} 数据',
      cacheBadgeDefault: '业务',
    },
    quickQuestions: [
      { icon: 'chart', text: '课后服务开展情况如何？', module: 'afterSchool' },
      { icon: 'wallet', text: '采购申请有多少待处理？', module: 'procurement' },
      { icon: 'people', text: '物品领用数据概况？', module: 'inventory' },
      { icon: 'rocket', text: '用车申请有多少？', module: 'vehicle' },
    ],
    moduleNames: {
      afterSchool: '课后服务管理',
      procurement: '采购管理',
      inventory: '物品领用管理',
      vehicle: '用车管理',
      meeting: '会议管理',
      student: '学生事务',
      hr: '人力资源',
    },
  },

  // ==================== 用户 ====================
  user: {
    defaultName: '用户',
    devName: '玫东用户',
    devOrg: '开发环境',
    logout: '退出登录',
    roleAdmin: '管理员',
    deptManagement: '管理层',
  },

  // ==================== 设置 ====================
  settings: {
    title: '设置',
    theme: '主题',
    themeSystem: '跟随系统',
    themeLight: '白日',
    themeDark: '黑夜',
    close: '关闭',
  },

  // ==================== 主题色板 ====================
  theme: {
    colorBlue: '蓝',
    colorGreen: '绿',
    colorPink: '粉',
  },

  // ==================== 折叠面板 ====================
  thinking: {
    title: '思考过程',
  },
  toolCalls: {
    title: '🔧 工具调用（{count} 次）',
  },

  // ==================== 错误提示 ====================
  errors: {
    loginFailed: '登录失败',
    identityFetchFailed: '身份获取失败',
    sendFailed: '发送失败',
    callbackInvalidLink: '回调链接无效，缺少授权码 code',
    dingtalkLoginFailed: '钉钉登录失败',
    dingtalkNotConfigured: '钉钉登录未配置',
    stateMismatch: '登录状态校验失败（state 不匹配），请重新登录',
    aiCallFailed: 'AI 调用失败',
    noReply: 'AI 未能生成回复，请重试。',
  },
};

export const I18N = {
  'zh-CN': zhCN,
};

let currentLocale = 'zh-CN';

export function setLocale(locale) {
  if (I18N[locale]) {
    currentLocale = locale;
    localStorage.setItem('ai-secretary-locale', locale);
  } else {
    console.warn(`[i18n] 不支持的语言: ${locale}`);
  }
}

export function getLocale() {
  return currentLocale;
}

// 初始化时从 localStorage 读取
const savedLocale = localStorage.getItem('ai-secretary-locale');
if (savedLocale && I18N[savedLocale]) {
  currentLocale = savedLocale;
}

/**
 * 获取 i18n 字符串，支持模板变量替换
 * @param {string} path - 点分隔的路径，如 'app.home.greeting'
 * @param {object} vars - 模板变量，如 { userName: '张总' }
 * @returns {string}
 */
export function t(path, vars = {}) {
  const keys = path.split('.');
  let value = I18N[currentLocale];

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.warn(`[i18n] 未找到 key: ${path}`);
      return path;
    }
  }

  if (typeof value !== 'string') {
    console.warn(`[i18n] key 不是字符串: ${path}`);
    return path;
  }

  // 替换模板变量 {key}
  return value.replace(/\{(\w+)\}/g, (match, varName) => {
    return vars[varName] !== undefined ? vars[varName] : match;
  });
}

export default I18N;
