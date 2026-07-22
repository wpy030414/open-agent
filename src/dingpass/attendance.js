/**
 * 考勤管理模块 - attendance
 *
 * 基于钉钉开放平台真实 API 实现打卡记录查询、请假管理、加班提交、考勤统计等功能喵～🐾
 *
 * 参考文档: https://open.dingtalk.com/document/orgapp/server-api-directory
 */

import { callTopApi } from './dingtalk-client.js';

/**
 * 获取员工打卡记录
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/attendance-getusercheckin}
 *
 * @param {Object} params
 * @param {Array<string>} params.userid_list - 用户ID列表（最多50个）
 * @param {string} params.check_date_from - 开始日期 YYYY-MM-DD
 * @param {string} params.check_date_to - 结束日期 YYYY-MM-DD
 * @returns {Promise<{records: Array, total: number}>}
 */
export async function getCheckinRecords(params) {
  const { userid_list, check_date_from, check_date_to } = params;

  if (!userid_list || !check_date_from || !check_date_to) {
    throw new Error('缺少必需参数: userid_list, check_date_from, check_date_to');
  }

  if (!Array.isArray(userid_list)) {
    throw new Error('userid_list 必须是数组');
  }

  if (userid_list.length > 50) {
    throw new Error('userid_list 最多包含50个用户ID');
  }

  // 验证日期格式
  if (!isValidDate(check_date_from) || !isValidDate(check_date_to)) {
    throw new Error('日期格式错误，应为 YYYY-MM-DD');
  }

  if (check_date_from > check_date_to) {
    throw new Error('check_date_from 不能晚于 check_date_to');
  }

  // 调用钉钉 API: topapi/attendance/getusercheckin
  const response = await callTopApi('attendance.getusercheckin', {
    userid_list,
    check_date_from,
    check_date_to
  });

  const records = (response.result?.datas || []).map(record => ({
    userid: record.userid,
    date: record.user_check_time?.split(' ')[0],
    check_time: record.user_check_time,
    check_type: record.check_type,
    time_result: record.time_result,
    location_result: record.location_result,
    device_id: record.device_id,
    source_name: record.source_name
  }));

  return {
    records,
    total: records.length
  };
}

/**
 * 提交请假申请
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/approval-create}
 *
 * @param {Object} params
 * @param {string} params.userid - 用户ID
 * @param {string} params.leave_type - 请假类型: annual | sick | personal | other
 * @param {string} params.start_time - 开始时间 YYYY-MM-DD HH:mm:ss
 * @param {string} params.end_time - 结束时间 YYYY-MM-DD HH:mm:ss
 * @param {string} params.reason - 请假原因
 * @returns {Promise<{leave_id: string, status: string, submit_time: string}>}
 */
export async function submitLeave(params) {
  const { userid, leave_type, start_time, end_time, reason } = params;

  if (!userid || !leave_type || !start_time || !end_time || !reason) {
    throw new Error('缺少必需参数: userid, leave_type, start_time, end_time, reason');
  }

  // 验证请假类型
  const validTypes = ['annual', 'sick', 'personal', 'other'];
  if (!validTypes.includes(leave_type)) {
    throw new Error(`无效的请假类型: ${leave_type}，有效值: ${validTypes.join(', ')}`);
  }

  // 验证时间格式
  if (!isValidDateTime(start_time) || !isValidDateTime(end_time)) {
    throw new Error('时间格式错误，应为 YYYY-MM-DD HH:mm:ss');
  }

  if (start_time >= end_time) {
    throw new Error('start_time 不能晚于或等于 end_time');
  }

  // 映射请假类型到钉钉审批模板
  const leaveTypeMap = {
    annual: '请假',
    sick: '病假',
    personal: '事假',
    other: '其他'
  };

  // 调用钉钉审批 API: topapi/oa/approval/create
  const response = await callTopApi('oa.approval.create', {
    agentid: process.env.DINGTALK_AGENT_ID,
    form_component_values: [
      {
        name: '请假人',
        value: userid
      },
      {
        name: '请假类型',
        value: leaveTypeMap[leave_type]
      },
      {
        name: '开始时间',
        value: start_time
      },
      {
        name: '结束时间',
        value: end_time
      },
      {
        name: '请假事由',
        value: reason
      }
    ]
  });

  return {
    leave_id: response.request_id,
    status: 'pending',
    submit_time: new Date().toISOString()
  };
}

/**
 * 撤销请假
 *
 * @param {Object} params
 * @param {string} params.leave_id - 请假ID（审批实例ID）
 * @param {string} params.userid - 用户ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function cancelLeave(params) {
  const { leave_id, userid } = params;

  if (!leave_id || !userid) {
    throw new Error('缺少必需参数: leave_id, userid');
  }

  // 调用钉钉审批 API: topapi/oa/processinstance/cancel
  await callTopApi('oa.processinstance.cancel', {
    userid,
    process_instance_id: leave_id
  });

  return {
    success: true,
    message: `请假 ${leave_id} 已撤销`
  };
}

/**
 * 提交加班申请
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/attendance-overtime-create}
 *
 * @param {Object} params
 * @param {string} params.userid - 用户ID
 * @param {string} params.date - 加班日期 YYYY-MM-DD
 * @param {number} params.hours - 加班小时数
 * @param {string} params.reason - 加班原因
 * @returns {Promise<{overtime_id: string, status: string, submit_time: string}>}
 */
export async function submitOvertime(params) {
  const { userid, date, hours, reason } = params;

  if (!userid || !date || !hours || !reason) {
    throw new Error('缺少必需参数: userid, date, hours, reason');
  }

  // 验证日期格式
  if (!isValidDate(date)) {
    throw new Error('日期格式错误，应为 YYYY-MM-DD');
  }

  // 验证小时数
  if (typeof hours !== 'number' || hours < 1 || hours > 24) {
    throw new Error('加班小时数必须在 1-24 之间');
  }

  // 调用钉钉加班 API: topapi/attendance/overtime/create
  const response = await callTopApi('attendance.overtime.create', {
    userid,
    overtime_date: date,
    overtime_hours: hours,
    reason
  });

  return {
    overtime_id: response.request_id,
    status: 'pending',
    submit_time: new Date().toISOString()
  };
}

/**
 * 获取考勤统计
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/attendance-getusergroupstats}
 *
 * @param {Object} params
 * @param {string} params.userid - 用户ID
 * @param {string} params.month - 统计月份 YYYY-MM
 * @returns {Promise<{stats: Object}>}
 */
export async function getAttendanceStats(params) {
  const { userid, month } = params;

  if (!userid || !month) {
    throw new Error('缺少必需参数: userid, month');
  }

  // 验证月份格式
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('月份格式错误，应为 YYYY-MM');
  }

  // 解析月份
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const endDate = new Date(year, mon, 0).toISOString().split('T')[0];

  // 调用钉钉考勤统计 API: topapi/attendance/getusergroupstats
  const response = await callTopApi('attendance.getusergroupstats', {
    userid_list: [userid],
    start_date: startDate,
    end_date: endDate
  });

  const stats = response.result?.[0] || {};

  return {
    stats: {
      work_days: stats.should_work_days || 0,
      actual_days: stats.actual_work_days || 0,
      late_count: stats.late_count || 0,
      early_leave_count: stats.early_leave_count || 0,
      overtime_hours: stats.overtime_duration_hours || 0,
      leave_days: stats.leave_days || 0
    }
  };
}

// 辅助函数：验证日期格式 YYYY-MM-DD
function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

// 辅助函数：验证日期时间格式 YYYY-MM-DD HH:mm:ss
function isValidDateTime(dateTimeStr) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateTimeStr);
}
