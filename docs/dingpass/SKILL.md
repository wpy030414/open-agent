---
name: dingpass
description: 钉钉组织架构与考勤管理技能包 - 提供标准化的部门、员工、打卡、请假操作接口
version: 1.0.0
author: DingPass Team
tags: [dingtalk, organization, attendance]
category: business
capabilities:
  - list_departments
  - get_employee
  - search_employee
  - create_department
  - update_department
  - delete_department
  - get_checkin_records
  - submit_leave
  - cancel_leave
  - submit_overtime
  - get_attendance_stats
---

# DingPass - 钉钉业务技能包

## 概述

DingPass 是一套**真正可运行**的钉钉业务技能，基于**钉钉开放平台真实 API** 实现，提供组织架构管理和考勤管理的完整 CRUD 操作接口。任何 Agent 都可以通过标准化的调用方式快速学习并使用这些功能喵～🐾

### 技术特点

- ✅ **基于钉钉真实 API**: 所有功能都对接钉钉开放平台服务端 API，不是 Mock 数据
- ✅ **标准化接口**: 统一的 skill.call() 调用格式
- ✅ **自动认证**: 内置 access_token 获取和自动刷新机制
- ✅ **完整实现**: 所有功能都有实际代码实现
- ✅ **易于集成**: 任何 Agent 都能快速学习和调用
- ✅ **错误处理**: 完善的错误码和异常处理机制
- ✅ **类型安全**: 完整的输入输出 schema 定义

## 模块列表

### 1. 组织架构 (organization)
- **功能**: 部门管理、员工查询、角色管理
- **核心能力**: 部门增删改查、员工信息查询、部门层级管理

### 2. 考勤管理 (attendance)
- **功能**: 打卡记录、请假、加班管理
- **核心能力**: 打卡记录查询、请假申请撤销、加班提交、考勤统计

## 快速开始

### 基础调用格式

```javascript
// 调用组织架构模块
const result = await skill.call('dingpass', {
  module: 'organization',
  action: 'list_departments',
  params: { parent_id: 1 }
});

// 调用考勤模块
const records = await skill.call('dingpass', {
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
const depts = await skill.call('dingpass', {
  module: 'organization',
  action: 'list_departments',
  params: { parent_id: 1, fetch_child: false }
});

// 获取员工信息
const employee = await skill.call('dingpass', {
  module: 'organization',
  action: 'get_employee',
  params: { userid: 'user123' }
});

// 搜索员工
const found = await skill.call('dingpass', {
  module: 'organization',
  action: 'search_employee',
  params: { name: '张三', dept_id: 123 }
});

// 创建部门
const newDept = await skill.call('dingpass', {
  module: 'organization',
  action: 'create_department',
  params: {
    name: '技术部',
    parent_id: 1,
    order: 1
  }
});

// 更新部门
await skill.call('dingpass', {
  module: 'organization',
  action: 'update_department',
  params: {
    dept_id: 123,
    name: '技术研发部',
    order: 2
  }
});

// 删除部门
await skill.call('dingpass', {
  module: 'organization',
  action: 'delete_department',
  params: { dept_id: 123 }
});
```

#### 考勤操作

```javascript
// 查询打卡记录
const records = await skill.call('dingpass', {
  module: 'attendance',
  action: 'get_checkin_records',
  params: {
    userid_list: ['user123', 'user456'],
    check_date_from: '2026-07-20',
    check_date_to: '2026-07-22'
  }
});

// 提交请假申请
const leave = await skill.call('dingpass', {
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
await skill.call('dingpass', {
  module: 'attendance',
  action: 'cancel_leave',
  params: {
    leave_id: 'leave_123',
    userid: 'user123'
  }
});

// 提交加班申请
const overtime = await skill.call('dingpass', {
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
const stats = await skill.call('dingpass', {
  module: 'attendance',
  action: 'get_attendance_stats',
  params: {
    userid: 'user123',
    month: '2026-07'
  }
});
```

## 能力定义

### 组织架构模块 (organization)

#### list_departments
列出指定父部门下的所有子部门

**输入参数:**
```json
{
  "parent_id": {"type": "number", "required": true, "description": "父部门ID，根部门为1"},
  "fetch_child": {"type": "boolean", "default": false, "description": "是否递归获取子部门"}
}
```

**输出格式:**
```json
{
  "departments": [
    {
      "dept_id": 123,
      "name": "技术部",
      "parent_id": 1,
      "order": 1,
      "create_time": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

#### get_employee
获取员工详细信息

**输入参数:**
```json
{
  "userid": {"type": "string", "required": true, "description": "员工userid"}
}
```

**输出格式:**
```json
{
  "employee": {
    "userid": "user123",
    "name": "张三",
    "dept_id": 123,
    "position": "工程师",
    "mobile": "13800138000",
    "email": "zhangsan@example.com",
    "status": "active",
    "hire_date": "2026-01-01"
  }
}
```

#### search_employee
搜索员工

**输入参数:**
```json
{
  "name": {"type": "string", "required": true, "description": "员工姓名（支持模糊匹配）"},
  "dept_id": {"type": "number", "description": "限定部门ID"}
}
```

**输出格式:**
```json
{
  "employees": [...],
  "total": 1
}
```

#### create_department
创建部门

**输入参数:**
```json
{
  "name": {"type": "string", "required": true},
  "parent_id": {"type": "number", "required": true},
  "order": {"type": "number", "default": 1}
}
```

**输出格式:**
```json
{
  "dept_id": 456,
  "name": "新部门",
  "parent_id": 1,
  "create_time": "2026-07-22T10:00:00Z"
}
```

#### update_department
更新部门

**输入参数:**
```json
{
  "dept_id": {"type": "number", "required": true},
  "name": {"type": "string"},
  "order": {"type": "number"}
}
```

#### delete_department
删除部门

**输入参数:**
```json
{
  "dept_id": {"type": "number", "required": true}
}
```

### 考勤管理模块 (attendance)

#### get_checkin_records
获取员工打卡记录

**输入参数:**
```json
{
  "userid_list": {
    "type": "array",
    "items": {"type": "string"},
    "required": true,
    "description": "用户ID列表（最多50个）"
  },
  "check_date_from": {"type": "string", "required": true, "description": "开始日期 YYYY-MM-DD"},
  "check_date_to": {"type": "string", "required": true, "description": "结束日期 YYYY-MM-DD"}
}
```

**输出格式:**
```json
{
  "records": [
    {
      "userid": "user123",
      "date": "2026-07-22",
      "check_in": "09:00:00",
      "check_out": "18:00:00",
      "status": "normal"
    }
  ],
  "total": 1
}
```

#### submit_leave
提交请假申请

**输入参数:**
```json
{
  "userid": {"type": "string", "required": true},
  "leave_type": {
    "type": "string",
    "enum": ["annual", "sick", "personal", "other"],
    "required": true
  },
  "start_time": {"type": "string", "required": true, "description": "YYYY-MM-DD HH:mm:ss"},
  "end_time": {"type": "string", "required": true, "description": "YYYY-MM-DD HH:mm:ss"},
  "reason": {"type": "string", "required": true}
}
```

**输出格式:**
```json
{
  "leave_id": "leave_123",
  "status": "pending",
  "submit_time": "2026-07-22T10:00:00Z"
}
```

#### cancel_leave
撤销请假

**输入参数:**
```json
{
  "leave_id": {"type": "string", "required": true},
  "userid": {"type": "string", "required": true}
}
```

#### submit_overtime
提交加班申请

**输入参数:**
```json
{
  "userid": {"type": "string", "required": true},
  "date": {"type": "string", "required": true, "description": "YYYY-MM-DD"},
  "hours": {"type": "number", "required": true, "minimum": 1},
  "reason": {"type": "string", "required": true}
}
```

**输出格式:**
```json
{
  "overtime_id": "ot_123",
  "status": "pending",
  "submit_time": "2026-07-22T10:00:00Z"
}
```

#### get_attendance_stats
获取考勤统计

**输入参数:**
```json
{
  "userid": {"type": "string", "required": true},
  "month": {"type": "string", "required": true, "description": "YYYY-MM"}
}
```

**输出格式:**
```json
{
  "stats": {
    "work_days": 22,
    "actual_days": 21,
    "late_count": 2,
    "early_leave_count": 1,
    "overtime_hours": 10,
    "leave_days": 1
  }
}
```

## 错误处理

### 标准错误格式

```json
{
  "error": {
    "code": 400,
    "message": "参数错误: userid 不能为空",
    "details": {
      "field": "userid",
      "rule": "required"
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

## 注意事项

### 最佳实践

1. **批量操作**: 查询多个员工时，建议使用批量接口减少请求次数
2. **分页处理**: 列表返回数据可能较多，注意处理分页逻辑
3. **缓存策略**: 部门信息等不常变数据建议缓存 5-10 分钟
4. **错误重试**: 遇到网络错误时，建议指数退避重试 3 次

### 性能限制

- 单次查询最多 50 个员工的打卡记录
- 部门列表默认每页 20 条，最大 100 条
- API 调用频率限制：每秒 10 次

### 安全要求

- 所有操作需要有效的钉钉身份认证
- 敏感操作（删除、修改）会记录审计日志
- 不得在代码中硬编码任何密钥或 token
