/**
 * i18n 配置 - AI 秘书 Web 原型
 *
 * 白标化说明：
 * - 所有面向用户的字符串都集中在此文件
 * - 修改此处即可更换产品名、问候语、按钮文案等
 * - 支持多语言扩展（目前只有 zh-CN）
 */

export const I18N = {
  // ==================== 白标化：产品信息 ====================
  product: {
    name: 'AI 秘书',
    shortName: 'AI 秘书',
    tagline: '您的智能业务数据分析助手',
    description: '请登录以接入公司全部业务数据',
    features: '销售 · 财务 · 人力资源 · 项目交付',
  },

  // ==================== 登录页 ====================
  login: {
    title: 'AI 秘书',
    subtitle: '您的智能业务数据分析助手',
    description: '请登录以接入公司全部业务数据',
    features: '销售 · 财务 · 人力资源 · 项目交付',
    button: '本机免登登录',
    buttonLoading: '正在登录...',
    tip: '将自动使用本机已登录的宜搭身份',
    featuresList: [
      { icon: 'chart', text: '实时数据查询' },
      { icon: 'rocket', text: '智能业务分析' },
      { icon: 'people', text: '团队协作支持' },
    ],
  },

  // ==================== 主界面 ====================
  app: {
    // 侧边栏
    sidebar: {
      newChat: '新建对话',
      emptyState: '暂无历史对话',
      footer: {
        modelBadge: 'AI 秘书',
        cacheInfo: '数据每 6 小时更新',
        themeToggle: '切换主题',
      },
    },
    // 顶栏
    topBar: {
      brand: 'AI 秘书',
    },
    // 首页
    home: {
      greeting: '您好，{userName}',
      subtitle: '我是您的 AI 秘书，已接入公司全部业务数据',
      subtitle2: '可以即时回答您的业务问询，并自动调取相关数据分析',
      inputPlaceholder: '发送消息...',
      inputHint: 'AI 秘书会基于公司真实数据回答，但可能偶尔出错，请核查关键数据',
    },
    // 聊天页
    chat: {
      inputPlaceholder: '发送消息...',
      inputHint: 'AI 秘书会基于公司真实数据回答，但可能偶尔出错，请核查关键数据',
      loading: 'AI 正在分析数据...',
      cacheBadge: '已调取 {module} 数据',
      cacheBadgeDefault: '业务',
    },
    // 快捷问题
    quickQuestions: [
      { icon: 'chart', text: '课后服务开展情况如何？', module: 'afterSchool' },
      { icon: 'wallet', text: '采购申请有多少待处理？', module: 'procurement' },
      { icon: 'people', text: '物品领用数据概况？', module: 'inventory' },
      { icon: 'rocket', text: '用车申请有多少？', module: 'vehicle' },
    ],
    // 模块名称映射（用于 cache badge）
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

  // ==================== 用户菜单 ====================
  user: {
    logout: '退出登录',
    roleAdmin: '管理员',
    deptManagement: '管理层',
  },

  // ==================== 错误提示 ====================
  errors: {
    loginFailed: '登录失败',
    identityFetchFailed: '身份获取失败',
    sendFailed: '发送失败',
  },
};

/**
 * 获取 i18n 字符串，支持模板变量替换
 * @param {string} path - 点分隔的路径，如 'app.home.greeting'
 * @param {object} vars - 模板变量，如 { userName: '张总' }
 * @returns {string}
 */
export function t(path, vars = {}) {
  const keys = path.split('.');
  let value = I18N;

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
