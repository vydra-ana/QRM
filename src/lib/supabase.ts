import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env vars missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Department = {
  id: string;
  name: string;
  qr_id: string | null;
  parent_id: string | null;
  audit_completed_today: boolean;
  last_score: number;
  created_at: string;
};

export type Manager = {
  id: string;
  department_id: string;
  full_name: string;
  position: string;
  created_at: string;
};

export type CriterionCategory = '5S' | 'Safety' | 'Quality';

export type Criterion = {
  id: string;
  code: string;
  title: string;
  category: CriterionCategory | string;
  active: boolean;
  created_at: string;
};

export type AuditStatus = 'pending' | 'passed' | 'failed';

export type Audit = {
  id: string;
  department_id: string;
  inspector_name: string;
  score: number;
  status: AuditStatus;
  created_at: string;
};

export type AnswerValue = 'pass' | 'fail' | 'na';

export type Answer = {
  criterionId: string;
  answer: AnswerValue;
  note: string;
};

export type AuditAnswerRow = {
  id: string;
  audit_id: string;
  criterion_id: string;
  answer: AnswerValue;
  note: string | null;
  created_at: string;
};
