# DingPass - 钉钉业务技能包 🐾

## 概述

DingPass 是一套**真正可运行**的钉钉业务技能，提供组织架构管理和考勤管理的完整 CRUD 操作接口。任何 Agent 都可以通过标准化的调用方式快速学习并使用这些功能喵～

## ✨ 核心特性

- ✅ **基于钉钉真实 API**: 所有功能都对接钉钉开放平台服务端 API，不是 Mock 数据
- ✅ **标准化接口**: 统一的 skill.call() 调用格式
- ✅ **自动认证**: 内置 access_token 获取和自动刷新机制
- ✅ **完整实现**: 所有功能都有实际代码实现，不是空壳子
- ✅ **易于集成**: 任何 Agent 都能快速学习和调用
- ✅ **错误处理**: 完善的错误码和异常处理机制
- ✅ **类型安全**: 完整的输入输出 schema 定义

## 📦 模块列表

### 1. 组织架构 (organization)
- **功能**: 部门管理、员工查询、角色管理
- **核心能力**:
  - `list_departments` - 列出部门
  - `get_employee` - 获取员工信息
  - `search_employee` - 搜索员工
  - `create_department` - 创建部门
  - `update_department` - 更新部门
  - `delete_department` - 删除部门

### 2. 考勤管理 (attendance)
- **功能**: 打卡记录、请假、加班管理
- **核心能力**:
  - `get_checkin_records` - 查询打卡记录
  - `submit_leave` - 提交请假申请
  - `cancel_leave` - 撤销请假
  - `submit_overtime` - 提交加班申请
  - `get_attendance_stats` - 获取考勤统计

## 🚀 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/dingpass/dingpass.git

# 安装依赖
npm install
```

### ⚙️ 环境配置

在使用之前，需要设置钉钉应用凭证（从钉钉开放平台获取）：

```bash
# 在项目根目录创建或编辑 .env 文件
DINGTALK_CLIENT_ID=your_app_key
DINGTALK_CLIENT_SECRET=your_app_secret
DINGTALK_AGENT_ID=your_agent_id
```

**获取凭证步骤：**
1. 登录 [钉钉开放平台](https://open-dev.dingtalk.com/)
2. 进入「应用开发」→「企业内部开发」→ 创建应用
3. 在「应用信息」页面获取 AppKey（CLIENT_ID）和 AppSecret（CLIENT_SECRET）
4. 在「版本管理与发布」页面获取 AgentId
5. 在「权限管理」页面开通以下接口权限：
   - 部门管理相关接口
   - 成员管理相关接口
   - 考勤管理相关接口
   - OA 审批相关接口

### 基础调用

```javascript
import { call } from './src/dingpass/index.js';

// 调用组织架构模块
const depts = await call({
  module: 'organization',
  action: 'list_departments',
  params: { parent_id: 1 }
});

// 调用考勤模块
const records = await call({
  module: 'attendance',
  action: 'get_checkin_records',
  params: {
    userid_list: ['user123'],
    check_date_from: '2026-07-20',
    check_date_to: '2026-07-22'
  }
});
```

### 使用示例

#### 组织架构操作

```javascript
// 列出部门
const depts = await call({
  module: 'organization',
  action: 'list_departments',
  params: { parent_id: 1, fetch_child: false }
});

// 获取员工信息
const employee = await call({
  module: 'organization',
  action: 'get_employee',
  params: { userid: 'user123' }
});

// 搜索员工
const found = await call({
  module: 'organization',
  action: 'search_employee',
  params: { name: '张三', dept_id: 123 }
});

// 创建部门
const newDept = await call({
  module: 'organization',
  action: 'create_department',
  params: {
    name: '技术部',
    parent_id: 1,
    order: 1
  }
});

// 更新部门
await call({
  module: 'organization',
  action: 'update_department',
  params: {
    dept_id: 123,
    name: '技术研发部',
    order: 2
  }
});

// 删除部门
await call({
  module: 'organization',
  action: 'delete_department',
  params: { dept_id: 123 }
});
```

#### 考勤操作

```javascript
// 查询打卡记录
const records = await call({
  module: 'attendance',
  action: 'get_checkin_records',
  params: {
    userid_list: ['user123', 'user456'],
    check_date_from: '2026-07-20',
    check_date_to: '2026-07-22'
  }
});

// 提交请假申请
const leave = await call({
  module: 'attendance',
  action: 'submit_leave',
  params: {
    userid: 'user123',
    leave_type: 'annual',
    start_time: '2026-07-25 09:00:00',
    end_time: '2026-07-26 18:00:00',
    reason: '年假休息'
  }
});

// 撤销请假
await call({
  module: 'attendance',
  action: 'cancel_leave',
  params: {
    leave_id: 'leave_123',
    userid: 'user123'
  }
});

// 提交加班申请
const overtime = await call({
  module: 'attendance',
  action: 'submit_overtime',
  params: {
    userid: 'user123',
    date: '2026-07-22',
    hours: 3,
    reason: '项目紧急'
  }
});

// 获取考勤统计
const stats = await call({
  module: 'attendance',
  action: 'get_attendance_stats',
  params: {
    userid: 'user123',
    month: '2026-07'
  }
});
```

## 📁 项目结构

```
dingpass/
├── SKILL.md                    # Skill 定义文档
├── README.md                   # 项目说明
├── src/
│   └── dingpass/
│       ├── index.js            # 主入口
│       ├── organization.js     # 组织架构模块实现
│       └── attendance.js       # 考勤模块实现
└── docs/
    └── dingpass/
        └── SKILL.md            # Skill 规范文档
```

## 🔧 API 参考

### 调用格式

```javascript
call({
  module: string,      // 模块名称: 'organization' | 'attendance'
  action: string,      // 动作名称
  params: object       // 具体参数
})
```

### 错误处理

所有调用都会返回标准格式的错误：

```json
{
  "error": {
    "code": 400,
    "message": "参数错误描述",
    "details": {
      "field": "参数名",
      "rule": "验证规则"
    }
  }
}
```

### 常见错误码

| 错误码 | 说明 | 解决方案 |
|-------|------|---------|
| 400 | 请求参数错误 | 检查必填参数和格式 |
| 401 | 认证失败 | 检查钉钉授权状态 |
| 403 | 权限不足 | 确认操作权限 |
| 404 | 资源不存在 | 检查部门ID或员工userid |
| 429 | 请求过于频繁 | 等待后重试 |
| 500 | 服务器内部错误 | 联系管理员 |

## 📝 注意事项

### 最佳实践

1. **批量操作**: 查询多个员工时，建议使用批量接口减少请求次数
2. **缓存策略**: 部门信息等不常变数据建议缓存 5-10 分钟
3. **错误重试**: 遇到网络错误时，建议指数退避重试 3 次
4. **分页处理**: 列表返回数据可能较多，注意处理分页逻辑

### 性能限制

- 单次查询最多 50 个员工的打卡记录
- 部门列表默认每页 20 条，最大 100 条
- API 调用频率限制：每秒 10 次

### 安全要求

- 所有操作需要有效的钉钉身份认证
- 敏感操作（删除、修改）会记录审计日志
- 不得在代码中硬编码任何密钥或 token
