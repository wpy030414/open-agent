/**
 * DingPass - 钉钉业务技能包
 *
 * 提供组织架构管理和考勤管理的完整 CRUD 操作接口
 * 任何 Agent 都可以通过标准化的调用方式快速学习并使用这些功能喵～🐾
 *
 * @version 1.0.0
 * @author DingPass Team
 */

// 组织架构模块
import {
  listDepartments,
  getEmployee,
  searchEmployee,
  createDepartment,
  updateDepartment,
  deleteDepartment
} from './organization.js';

// 考勤管理模块
import {
  getCheckinRecords,
  submitLeave,
  cancelLeave,
  submitOvertime,
  getAttendanceStats
} from './attendance.js';

/**
 * Skill 调用入口
 * @param {Object} params - 调用参数
 * @param {string} params.module - 模块名称: 'organization' | 'attendance'
 * @param {string} params.action - 动作名称
 * @param {Object} params.params - 具体参数
 * @returns {Promise<Object>} 操作结果
 */
export async function call(params) {
  const { module, action, params: args } = params;

  if (!module || !action) {
    throw new Error('缺少必需参数: module 和 action 不能为空');
  }

  // 路由到对应模块
  const modules = {
    organization: {
      list_departments: listDepartments,
      get_employee: getEmployee,
      search_employee: searchEmployee,
      create_department: createDepartment,
      update_department: updateDepartment,
      delete_department: deleteDepartment
    },
    attendance: {
      get_checkin_records: getCheckinRecords,
      submit_leave: submitLeave,
      cancel_leave: cancelLeave,
      submit_overtime: submitOvertime,
      get_attendance_stats: getAttendanceStats
    }
  };

  const targetModule = modules[module];
  if (!targetModule) {
    throw new Error(`不支持的模块: ${module}，支持的模块: ${Object.keys(modules).join(', ')}`);
  }

  const targetAction = targetModule[action];
  if (!targetAction) {
    throw new Error(`模块 ${module} 不支持的动作: ${action}，支持的动作: ${Object.keys(targetModule).join(', ')}`);
  }

  // 执行具体动作
  try {
    return await targetAction(args);
  } catch (error) {
    throw new Error(`调用失败 [${module}.${action}]: ${error.message}`);
  }
}

// 导出模块常量
export const MODULES = {
  ORGANIZATION: 'organization',
  ATTENDANCE: 'attendance'
};

export const ACTIONS = {
  organization: Object.keys(modules.organization),
  attendance: Object.keys(modules.attendance)
};

// 默认导出
export default { call, MODULES, ACTIONS };
