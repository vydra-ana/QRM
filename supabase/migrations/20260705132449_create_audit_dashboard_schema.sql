/*
# Create audit dashboard schema (single-tenant, no auth)

1. New Tables
- `departments`
  - id (uuid, primary key)
  - name (text, not null) — department name
  - qr_id (text, unique) — unique QR code identifier used by the inspector app
  - parent_id (uuid, nullable, self-reference) — optional parent for tree hierarchy
  - audit_completed_today (boolean, default false) — whether today's audit is done
  - last_score (numeric, nullable) — last audit score percentage (0-100)
  - created_at (timestamptz)
- `managers`
  - id (uuid, primary key)
  - department_id (uuid, references departments, cascade delete)
  - full_name (text, not null) — manager's full name
  - position (text, not null) — official corporate position (e.g. "Shift Master")
  - created_at (timestamptz)
- `criteria`
  - id (uuid, primary key)
  - code (text, not null) — short code (e.g. "5S-01")
  - title (text, not null) — validation step description
  - category (text, not null) — one of: '5S', 'Safety', 'Quality'
  - active (boolean, default true)
  - created_at (timestamptz)
- `audits`
  - id (uuid, primary key)
  - department_id (uuid, references departments, cascade delete)
  - inspector_name (text, not null)
  - score (numeric, default 0) — aggregate score percentage
  - status (text, default 'pending') — 'pending' | 'passed' | 'failed'
  - created_at (timestamptz)
- `audit_answers`
  - id (uuid, primary key)
  - audit_id (uuid, references audits, cascade delete)
  - criterion_id (uuid, references criteria, cascade delete)
  - answer (text, not null) — 'pass' | 'fail' | 'na'
  - note (text, nullable)
  - created_at (timestamptz)

2. Security
- Enable RLS on all tables.
- Allow anon + authenticated full CRUD on every table (intentionally shared single-tenant app, no sign-in).

3. Notes
- No user_id columns — single-tenant dashboard with no auth flow.
- Self-referencing parent_id on departments supports the tree hierarchy view.
*/

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  qr_id text UNIQUE,
  parent_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  audit_completed_today boolean NOT NULL DEFAULT false,
  last_score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_departments" ON departments;
CREATE POLICY "anon_select_departments" ON departments FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_departments" ON departments;
CREATE POLICY "anon_insert_departments" ON departments FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_departments" ON departments;
CREATE POLICY "anon_update_departments" ON departments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_departments" ON departments;
CREATE POLICY "anon_delete_departments" ON departments FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  position text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_managers" ON managers;
CREATE POLICY "anon_select_managers" ON managers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_managers" ON managers;
CREATE POLICY "anon_insert_managers" ON managers FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_managers" ON managers;
CREATE POLICY "anon_update_managers" ON managers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_managers" ON managers;
CREATE POLICY "anon_delete_managers" ON managers FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT '5S',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE criteria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_criteria" ON criteria;
CREATE POLICY "anon_select_criteria" ON criteria FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_criteria" ON criteria;
CREATE POLICY "anon_insert_criteria" ON criteria FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_criteria" ON criteria;
CREATE POLICY "anon_update_criteria" ON criteria FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_criteria" ON criteria;
CREATE POLICY "anon_delete_criteria" ON criteria FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  inspector_name text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_audits" ON audits;
CREATE POLICY "anon_select_audits" ON audits FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audits" ON audits;
CREATE POLICY "anon_insert_audits" ON audits FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audits" ON audits;
CREATE POLICY "anon_update_audits" ON audits FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audits" ON audits;
CREATE POLICY "anon_delete_audits" ON audits FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS audit_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  answer text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_audit_answers" ON audit_answers;
CREATE POLICY "anon_select_audit_answers" ON audit_answers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_answers" ON audit_answers;
CREATE POLICY "anon_insert_audit_answers" ON audit_answers FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audit_answers" ON audit_answers;
CREATE POLICY "anon_update_audit_answers" ON audit_answers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audit_answers" ON audit_answers;
CREATE POLICY "anon_delete_audit_answers" ON audit_answers FOR DELETE
  TO anon, authenticated USING (true);

-- Seed starter data so the dashboard is not empty on first load
INSERT INTO departments (name, qr_id, audit_completed_today, last_score) VALUES
  ('Assembly Hall', 'QR-ASM-01', true, 96),
  ('Paint Shop', 'QR-PNT-02', true, 91),
  ('Welding Bay', 'QR-WLD-03', false, 0),
  ('Quality Lab', 'QR-QLB-04', false, 0),
  ('Logistics Dock', 'QR-LOG-05', true, 94)
ON CONFLICT (qr_id) DO NOTHING;

INSERT INTO managers (department_id, full_name, position) VALUES
  ((SELECT id FROM departments WHERE qr_id='QR-ASM-01'), 'Jan Doe', 'Shift Master'),
  ((SELECT id FROM departments WHERE qr_id='QR-ASM-01'), 'Eva Novak', 'Lead Engineer'),
  ((SELECT id FROM departments WHERE qr_id='QR-PNT-02'), 'Pavel Hora', 'Paint Supervisor'),
  ((SELECT id FROM departments WHERE qr_id='QR-WLD-03'), 'Marek Cerny', 'Welding Lead'),
  ((SELECT id FROM departments WHERE qr_id='QR-QLB-04'), 'Karel Svec', 'Quality Manager'),
  ((SELECT id FROM departments WHERE qr_id='QR-LOG-05'), 'Lena Burianova', 'Dock Coordinator')
ON CONFLICT DO NOTHING;

INSERT INTO criteria (code, title, category) VALUES
  ('5S-01', 'Sort: Remove unnecessary items from workspace', '5S'),
  ('5S-02', 'Set in order: Tools labeled and stored correctly', '5S'),
  ('5S-03', 'Shine: Workstation cleaned to standard', '5S'),
  ('5S-04', 'Standardize: Visual controls in place', '5S'),
  ('SAF-01', 'PPE worn by all personnel', 'Safety'),
  ('SAF-02', 'Emergency exits unobstructed', 'Safety'),
  ('SAF-03', 'Fire extinguisher inspection current', 'Safety'),
  ('QLT-01', 'First-off part inspection completed', 'Quality'),
  ('QLT-02', 'Calibration of measurement tools valid', 'Quality'),
  ('QLT-03', 'Non-conformance log updated', 'Quality')
ON CONFLICT DO NOTHING;

INSERT INTO audits (department_id, inspector_name, score, status) VALUES
  ((SELECT id FROM departments WHERE qr_id='QR-ASM-01'), 'J. Doe', 96, 'passed'),
  ((SELECT id FROM departments WHERE qr_id='QR-PNT-02'), 'A. Smith', 91, 'passed'),
  ((SELECT id FROM departments WHERE qr_id='QR-LOG-05'), 'R. Klein', 94, 'passed')
ON CONFLICT DO NOTHING;
