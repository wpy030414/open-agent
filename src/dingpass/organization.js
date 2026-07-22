/**
 * 组织架构模块 - organization
 *
 * 基于钉钉开放平台真实 API 实现部门管理、员工查询等功能喵～🐾
 *
 * 参考文档: https://open.dingtalk.com/document/orgapp/server-api-directory
 */

import { callTopApi, fetchAllPages } from './dingtalk-client.js';

/**
 * 列出指定父部门下的所有子部门
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/department-listsub}
 *
 * @param {Object} params
 * @param {number} params.parent_id - 父部门ID，根部门为1
 * @param {boolean} [params.fetch_child=false] - 是否递归获取子部门
 * @returns {Promise<{departments: Array, total: number}>}
 */
export async function listDepartments(params) {
  const { parent_id, fetch_child = false } = params;

  if (!parent_id && parent_id !== 0) {
    throw new Error('缺少必需参数: parent_id');
  }

  // 调用钉钉 API: topapi/v2/department/listsub
  const response = await callTopApi('v2.department.listsub', {
    dept_id: parent_id
  });

  let departments = response.result || [];

  // 如果需要递归获取所有子部门
  if (fetch_child) {
    const allDepts = [...departments];
    for (const dept of departments) {
      const children = await listDepartments({
        parent_id: dept.dept_id,
        fetch_child: true
      });
      allDepts.push(...children.departments);
    }
    departments = allDepts;
  }

  return {
    departments: departments.map(dept => ({
      dept_id: dept.dept_id,
      name: dept.name,
      parent_id: dept.parent_id,
      order: dept.order,
      create_time: dept.create_time
    })),
    total: departments.length
  };
}

/**
 * 获取员工详细信息
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/user-v2-get}
 *
 * @param {Object} params
 * @param {string} params.userid - 员工userid
 * @returns {Promise<{employee: Object}>}
 */
export async function getEmployee(params) {
  const { userid } = params;

  if (!userid) {
    throw new Error('缺少必需参数: userid');
  }

  // 调用钉钉 API: topapi/v2/user/get
  const response = await callTopApi('v2.user.get', {
    userid
  });

  if (!response.result) {
    throw new Error(`员工不存在: ${userid}`);
  }

  const emp = response.result;

  return {
    employee: {
      userid: emp.userid,
      name: emp.name,
      dept_id: emp.dept_id_list?.[0],
      position: emp.title,
      mobile: emp.mobile,
      email: emp.email,
      status: emp.active ? 'active' : 'inactive',
      hire_date: emp.hire_date,
      avatar: emp.avatar,
      job_number: emp.job_number,
      org_email: emp.org_email,
      remark: emp.remark
    }
  };
}

/**
 * 搜索员工
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/user-search}
 *
 * @param {Object} params
 * @param {string} params.name - 员工姓名（支持模糊匹配）
 * @param {number} [params.dept_id] - 限定部门ID
 * @returns {Promise<{employees: Array, total: number}>}
 */
export async function searchEmployee(params) {
  const { name, dept_id } = params;

  if (!name) {
    throw new Error('缺少必需参数: name');
  }

  // 调用钉钉 API: topapi/v2/user/search
  const response = await callTopApi('v2.user.search', {
    query_name: name,
    offset: 0,
    size: 100,
    ...(dept_id ? { dept_id } : {})
  });

  const employees = (response.result?.list || []).map(emp => ({
    userid: emp.userid,
    name: emp.name,
    dept_id: emp.dept_id_list?.[0],
    position: emp.title,
    mobile: emp.mobile,
    email: emp.email,
    status: emp.active ? 'active' : 'inactive'
  }));

  return {
    employees,
    total: employees.length
  };
}

/**
 * 创建部门
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/department-create}
 *
 * @param {Object} params
 * @param {string} params.name - 部门名称
 * @param {number} params.parent_id - 父部门ID
 * @param {number} [params.order=1] - 排序
 * @returns {Promise<{dept_id: number, name: string, parent_id: number, create_time: string}>}
 */
export async function createDepartment(params) {
  const { name, parent_id, order = 1 } = params;

  if (!name || !parent_id) {
    throw new Error('缺少必需参数: name, parent_id');
  }

  // 调用钉钉 API: topapi/v2/department/create
  const response = await callTopApi('v2.department.create', {
    name,
    parent_id,
    order,
    create_dept_group: true
  });

  return {
    dept_id: response.result?.dept_id,
    name,
    parent_id,
    order,
    create_time: new Date().toISOString()
  };
}

/**
 * 更新部门
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/department-update}
 *
 * @param {Object} params
 * @param {number} params.dept_id - 部门ID
 * @param {string} [params.name] - 新部门名称
 * @param {number} [params.order] - 新排序
 * @returns {Promise<{dept_id: number, name: string, parent_id: number, order: number}>}
 */
export async function updateDepartment(params) {
  const { dept_id, name, order } = params;

  if (!dept_id) {
    throw new Error('缺少必需参数: dept_id');
  }

  // 先获取现有部门信息
  const existing = await listDepartments({ parent_id: 0, fetch_child: true });
  const dept = existing.departments.find(d => d.dept_id === dept_id);

  if (!dept) {
    throw new Error(`部门不存在: ${dept_id}`);
  }

  // 调用钉钉 API: topapi/v2/department/update
  await callTopApi('v2.department.update', {
    dept_id,
    ...(name ? { name } : {}),
    ...(order ? { order } : {})
  });

  return {
    dept_id,
    name: name || dept.name,
    parent_id: dept.parent_id,
    order: order || dept.order
  };
}

/**
 * 删除部门
 *
 * @see {@link https://open.dingtalk.com/document/orgapp/department-delete}
 *
 * @param {Object} params
 * @param {number} params.dept_id - 部门ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function deleteDepartment(params) {
  const { dept_id } = params;

  if (!dept_id) {
    throw new Error('缺少必需参数: dept_id');
  }

  // 检查是否有子部门
  const subDepts = await listDepartments({ parent_id: dept_id });
  if (subDepts.departments.length > 0) {
    throw new Error(`不能删除有子部门的部门: ${dept_id}`);
  }

  // 调用钉钉 API: topapi/v2/department/delete
  await callTopApi('v2.department.delete', {
    dept_id
  });

  return {
    success: true,
    message: `部门 ${dept_id} 已删除`
  };
}
