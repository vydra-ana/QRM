/** V dev režimu bez VITE_API_URL jde traffic přes Vite proxy (telefon → PC:5173). */
export function getApiBase(): string {
  const env = import.meta.env.VITE_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (import.meta.env.DEV && typeof window !== 'undefined') return window.location.origin;
  return 'http://127.0.0.1:8000';
}

export type Permission =
  | 'stats'
  | 'reports'
  | 'criteria'
  | 'structure'
  | 'users'
  | 'sessions'
  | 'roles'
  | 'schedule'
  | 'inspector';

export type UserRole = string;

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  permissions?: Permission[];
}

export interface AppRole {
  id: string;
  code: string;
  label: string;
  permissions: Permission[];
  is_system: boolean;
  created_at: string;
}

export interface PermissionInfo {
  code: Permission;
  label: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  password_note: string | null;
  created_at: string;
  is_online: boolean;
}

export interface UserSessionInfo {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  user_role: UserRole | null;
  ip_address: string | null;
  user_agent: string | null;
  last_active: string;
  created_at: string;
  is_active: boolean;
}

export interface Department {
  id: string;
  name: string;
  qr_id: string;
  parent_id: string | null;
  audit_completed_today: boolean;
  last_score: number | null;
}

export interface Manager {
  id: string;
  full_name: string;
  position: string;
  department_id: string;
}

export type CriterionCategory = '5S' | 'Safety' | 'Quality' | 'Process Control';
export type AuditFrequency = 'Shiftly' | 'Daily' | 'Weekly' | 'Monthly';

export interface Criterion {
  id: string;
  code: string;
  title: string;
  category: CriterionCategory | string;
  department_id: string;
  frequency: AuditFrequency | string;
  active: boolean;
  description?: string;
  image_url?: string;
}

export interface AuditPhoto {
  id: string;
  url: string;
  name: string;
}

export interface AuditAnswerDetail {
  criterion_id: string;
  code: string;
  title: string;
  value: 'pass' | 'fail' | 'na';
  notes?: string | null;
}

export interface Audit {
  id: string;
  department_id: string;
  department_name?: string | null;
  inspector_name: string;
  inspector_user_id?: string | null;
  shift: string;
  score: number;
  status: 'passed' | 'failed' | 'pending';
  notes: string | null;
  conclusion?: string | null;
  quality_response?: string | null;
  quality_responder_name?: string | null;
  quality_response_at?: string | null;
  answers?: AuditAnswerDetail[];
  pdf_url?: string | null;
  photos?: AuditPhoto[];
  check_frequency?: string | null;
  created_at: string;
}

export type InspectionPlanType = 'regular' | 'extra' | 'followup';
export type InspectionPlanStatus = 'pending' | 'done' | 'cancelled';

export interface InspectionPlan {
  id: string;
  department_id: string;
  department_name?: string | null;
  planned_date: string;
  sort_order: number;
  plan_type: InspectionPlanType;
  status: InspectionPlanStatus;
  notes?: string | null;
  description?: string | null;
  source_audit_id?: string | null;
  followup_days?: number | null;
  completed_audit_id?: string | null;
  check_frequency?: string | null;
  is_due?: boolean;
  last_check_at?: string | null;
  last_score?: number | null;
  period_label?: string | null;
  created_at: string;
}

export interface DepartmentCheckItem {
  frequency: string;
  label: string;
  criteria_count: number;
  last_check_at: string | null;
  last_score: number | null;
  last_status: string | null;
  is_due: boolean;
  period_label: string | null;
}

export interface DepartmentCheckOverview {
  department_id: string;
  department_name: string;
  checks: DepartmentCheckItem[];
}

export type StatsPeriod = 'day' | 'week' | 'month';

export interface DepartmentStats {
  department_id: string;
  department_name: string;
  period: StatsPeriod;
  from_date: string;
  to_date: string;
  frequencies: {
    frequency: string;
    label: string;
    checks_count: number;
    avg_score: number | null;
    last_check_at: string | null;
    last_score: number | null;
    last_status: string | null;
    history: {
      id: string;
      score: number;
      status: string;
      inspector_name: string;
      created_at: string;
    }[];
  }[];
}

export interface Answer {
  criterion_id: string;
  value: 'pass' | 'fail' | 'na';
  notes?: string;
}

const TOKEN_KEY = 'mj_token';
const USER_KEY = 'mj_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail ?? err.message ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get baseUrl() {
    return getApiBase();
  },

  fileUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    return `${getApiBase()}${path}`;
  },

  async register(email: string, password: string, fullName: string, role: 'admin' | 'inspector') {
    const data = await request<{ access_token: string; user: AuthUser }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name: fullName, role }),
      },
      false,
    );
    saveSession(data.access_token, data.user);
    return data.user;
  },

  async login(email: string, password: string) {
    const data = await request<{ access_token: string; user: AuthUser }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false,
    );
    saveSession(data.access_token, data.user);
    return data.user;
  },

  async me() {
    return request<AuthUser>('/auth/me');
  },

  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearSession();
  },

  getAdminUsers: () => request<AdminUser[]>('/admin/users'),
  createAdminUser: (payload: {
    email: string;
    password: string;
    full_name: string;
    role: string;
  }) =>
    request<AdminUser>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdminUser: (
    id: string,
    payload: { full_name?: string; role?: string; password?: string },
  ) =>
    request<AdminUser>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteAdminUser: (id: string) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  resetAdminUserPassword: (id: string, password: string) =>
    request<{ ok: boolean; password_note: string }>(`/admin/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),
  getAdminRoles: () => request<AppRole[]>('/admin/roles'),
  getAdminPermissions: () => request<PermissionInfo[]>('/admin/permissions'),
  createAdminRole: (payload: { code: string; label: string; permissions: Permission[] }) =>
    request<AppRole>('/admin/roles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdminRole: (
    id: string,
    payload: { label?: string; permissions?: Permission[] },
  ) =>
    request<AppRole>(`/admin/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteAdminRole: (id: string) => request(`/admin/roles/${id}`, { method: 'DELETE' }),
  getAdminSessions: () => request<UserSessionInfo[]>('/admin/sessions'),
  revokeAdminSession: (id: string) =>
    request(`/admin/sessions/${id}`, { method: 'DELETE' }),

  getDepartments: () => request<Department[]>('/departments', {}, false),
  getDepartmentStats: (deptId: string, period: StatsPeriod = 'week') =>
    request<DepartmentStats>(`/departments/${deptId}/stats?period=${period}`),
  getDepartmentCheckOverview: (deptId: string) =>
    request<DepartmentCheckOverview>(`/departments/${deptId}/check-overview`),
  createDepartment: (d: Department) =>
    request<Department>('/departments', { method: 'POST', body: JSON.stringify(d) }),
  updateDepartment: (id: string, d: Partial<Department>) =>
    request<Department>(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteDepartment: (id: string) =>
    request(`/departments/${id}`, { method: 'DELETE' }),

  getManagers: () => request<Manager[]>('/managers', {}, false),
  createManager: (m: Manager) =>
    request<Manager>('/managers', { method: 'POST', body: JSON.stringify(m) }),
  deleteManager: (id: string) => request(`/managers/${id}`, { method: 'DELETE' }),

  getCriteria: () => request<Criterion[]>('/criteria', {}, false),
  createCriterionJson: (c: Criterion) =>
    request<Criterion>('/criteria/json', { method: 'POST', body: JSON.stringify(c) }),
  createCriterionWithFile: (form: FormData) =>
    request<Criterion>('/criteria', { method: 'POST', body: form }),
  updateCriterion: (
    id: string,
    payload: Partial<Pick<Criterion, 'code' | 'title' | 'category' | 'department_id' | 'frequency' | 'active' | 'description'>>,
  ) =>
    request<Criterion>(`/criteria/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateCriterionImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Criterion>(`/criteria/${id}/image`, { method: 'PUT', body: form });
  },
  deleteCriterion: (id: string) => request(`/criteria/${id}`, { method: 'DELETE' }),

  getAudits: () => request<Audit[]>('/audits', {}, false),
  getAudit: (id: string) => request<Audit>(`/audits/${id}`, {}, false),
  saveQualityResponse: (auditId: string, quality_response: string) =>
    request<Audit>(`/audits/${auditId}/quality-response`, {
      method: 'PUT',
      body: JSON.stringify({ quality_response }),
    }),
  scheduleFollowup: (auditId: string, days: number) =>
    request<InspectionPlan>(`/audits/${auditId}/followup`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),
  getMyAudits: () => request<Audit[]>('/audits/mine'),
  getTodayPlans: () => request<InspectionPlan[]>('/inspection-plans/today'),
  getInspectionPlans: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from_date', from);
    if (to) params.set('to_date', to);
    const q = params.toString();
    return request<InspectionPlan[]>(`/inspection-plans${q ? `?${q}` : ''}`);
  },
  createInspectionPlan: (payload: {
    department_id: string;
    planned_date: string;
    plan_type: InspectionPlanType;
    check_frequency?: 'Daily' | 'Weekly' | 'Monthly';
    sort_order?: number;
    notes?: string;
    description?: string;
  }) =>
    request<InspectionPlan>('/inspection-plans', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteInspectionPlan: (id: string) =>
    request(`/inspection-plans/${id}`, { method: 'DELETE' }),

  async submitAudit(params: {
    department_id: string;
    shift: string;
    score: number;
    status: string;
    notes: string;
    conclusion: string;
    check_frequency?: string;
    answers: Answer[];
    photos: File[];
  }) {
    const form = new FormData();
    form.append('department_id', params.department_id);
    form.append('shift', params.shift);
    form.append('score', String(params.score));
    form.append('status', params.status);
    form.append('notes', params.notes);
    form.append('conclusion', params.conclusion);
    if (params.check_frequency) {
      form.append('check_frequency', params.check_frequency);
    }
    form.append('answers_json', JSON.stringify(params.answers));
    for (const photo of params.photos) {
      form.append('photos', photo);
    }
    return request<Audit>('/audits/submit', { method: 'POST', body: form });
  },

  pdfUrl(auditId: string, download = false) {
    const base = `${getApiBase()}/reports/${auditId}/pdf`;
    return download ? `${base}?download=1` : base;
  },
};

export async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
