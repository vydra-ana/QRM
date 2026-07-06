import { useCallback, useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { InspectorTerminal } from './components/InspectorTerminal';
import {
  api,
  checkBackend,
  getStoredUser,
  type Answer,
  type Audit,
  type AuthUser,
  type Criterion,
  type Department,
  type InspectionPlan,
} from './lib/api';

export function InspectorApp() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [showAuth, setShowAuth] = useState(!getStoredUser());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [todayPlans, setTodayPlans] = useState<InspectionPlan[]>([]);
  const [myAudits, setMyAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const [serverUrl] = useState(api.baseUrl);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const online = await checkBackend();
    setBackendOnline(online);
    if (!online) {
      setLoading(false);
      return;
    }
    try {
      const [d, c, plans, audits] = await Promise.all([
        api.getDepartments(),
        api.getCriteria(),
        api.getTodayPlans(),
        api.getMyAudits(),
      ]);
      setDepartments(d);
      setCriteria(c);
      setTodayPlans(plans);
      setMyAudits(audits);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const hasInspector = user?.permissions?.includes('inspector') || user?.role === 'inspector';
    if (hasInspector && !showAuth) fetchData();
  }, [user, showAuth, fetchData]);

  const onAuthSuccess = async () => {
    let u = getStoredUser();
    try {
      u = await api.me();
      if (u) {
        localStorage.setItem('mj_user', JSON.stringify(u));
      }
    } catch {
      /* use stored */
    }
    const hasInspector = u?.permissions?.includes('inspector') || u?.role === 'inspector';
    if (!hasInspector) {
      void api.logout();
      alert('Tento účet není inspektorský.');
      return;
    }
    setUser(u);
    setShowAuth(false);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setShowAuth(true);
    setDepartments([]);
    setCriteria([]);
    setTodayPlans([]);
    setMyAudits([]);
  };

  const handleAuditSubmit = async (payload: {
    department_id: string;
    shift: string;
    check_frequency?: string;
    answers: Answer[];
    notes: string;
    conclusion: string;
    photos: File[];
  }) => {
    const passed = payload.answers.filter((a) => a.value === 'pass').length;
    const evaluated = payload.answers.filter((a) => a.value !== 'na').length;
    const score = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 100;
    const status = score >= 85 ? 'passed' : 'failed';
    const audit = await api.submitAudit({ ...payload, score, status });
    await fetchData();
    return { score: audit.score, status: audit.status, auditId: audit.id };
  };

  if (showAuth || !user) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <div className="flex flex-col items-center pt-[max(2rem,env(safe-area-inset-top))]">
          <Zap className="mb-2 h-10 w-10 text-yellow-500" fill="currentColor" />
          <p className="text-xs uppercase tracking-widest text-neutral-500">QRM · Mobilní inspektor</p>
        </div>
        <AuthScreen
          role="inspector"
          onSuccess={onAuthSuccess}
          onBack={() => {}}
          hideBack
        />
        <p className="pb-8 text-center text-[10px] text-neutral-600">Server: {serverUrl}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      {!backendOnline && (
        <div className="bg-red-500/20 px-4 py-2 text-center text-xs text-red-300">
          Server nedostupný ({serverUrl}) — zkontrolujte připojení k Wi‑Fi
        </div>
      )}
      {loading && departments.length === 0 && (
        <div className="px-4 py-2 text-center text-xs text-neutral-500">Načítám data…</div>
      )}
      <InspectorTerminal
        standalone
        departments={departments}
        criteria={criteria}
        todayPlans={todayPlans}
        myAudits={myAudits}
        user={user}
        onAuditSubmit={handleAuditSubmit}
        onHome={logout}
        onLogout={logout}
        onRefresh={fetchData}
      />
    </div>
  );
}
