import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CornerDownRight,
  FileText,
  Grid2x2,
  ImageIcon,
  Layers,
  LayoutDashboard,
  LogOut,
  Pencil,
  PlusCircle,
  QrCode,
  ShieldCheck,
  Shield,
  Smartphone,
  Trash2,
  TrendingUp,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { AuthScreen } from "./components/AuthScreen";
import { AdminRolesView } from "./components/AdminRolesView";
import { AdminSessionsView } from "./components/AdminSessionsView";
import { AdminUsersView } from "./components/AdminUsersView";
import { InspectorTerminal } from "./components/InspectorTerminal";
import { InspectionPlanView } from "./components/InspectionPlanView";
import { DepartmentStatsModal } from "./components/DepartmentStatsModal";
import { ReportsView } from "./components/ReportsView";
import {
  api,
  checkBackend,
  getStoredUser,
  getToken,
  saveSession,
  type AdminUser,
  type Answer,
  type Audit,
  type AuthUser,
  type Criterion,
  type CriterionCategory,
  type Department,
  type Manager,
  type AuditFrequency,
  type Permission,
  type UserSessionInfo,
} from "./lib/api";

/* ─────────────────────────────────────────────── */
/* CONSTANTS                                       */
/* ─────────────────────────────────────────────── */

type AppMode = "gatekeeper" | "auth" | "admin" | "inspector";
type TabId = "live" | "hierarchy" | "criteria" | "reports" | "schedule" | "users" | "sessions" | "roles";

const TAB_PERMISSIONS: Record<TabId, Permission> = {
  live: "stats",
  hierarchy: "structure",
  criteria: "criteria",
  reports: "reports",
  schedule: "schedule",
  users: "users",
  sessions: "sessions",
  roles: "roles",
};

const CATEGORIES: CriterionCategory[] = [
  "5S",
  "Safety",
  "Quality",
  "Process Control",
];
const FREQUENCIES: AuditFrequency[] = ["Shiftly", "Daily", "Weekly", "Monthly"];

const TABS: { id: TabId; label: string; icon: typeof BarChart3; hint: string }[] = [
  { id: "live", label: "Statistika", icon: BarChart3, hint: "KPI a audity" },
  {
    id: "hierarchy",
    label: "Struktura firmy",
    icon: Building2,
    hint: "Oddělení a personál",
  },
  {
    id: "criteria",
    label: "Kontrolní body",
    icon: ClipboardList,
    hint: "Co a jak kontrolovat",
  },
  {
    id: "reports",
    label: "Zprávy inspektorů",
    icon: FileText,
    hint: "PDF pro oddělení kvality",
  },
  {
    id: "schedule",
    label: "Plán kontrol",
    icon: CalendarDays,
    hint: "Týdenní plán inspekcí",
  },
  {
    id: "users",
    label: "Účty",
    icon: UserPlus,
    hint: "Správa uživatelů a hesel",
  },
  {
    id: "sessions",
    label: "Relace",
    icon: Activity,
    hint: "Kdo je právě online",
  },
  {
    id: "roles",
    label: "Role",
    icon: Shield,
    hint: "Nové role a oprávnění",
  },
];

function hasPermission(user: AuthUser | null | undefined, perm: Permission): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  return user.permissions?.includes(perm) ?? false;
}

function isAdminUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  const adminPerms: Permission[] = ["stats", "reports", "criteria", "structure", "schedule", "users", "sessions", "roles"];
  return adminPerms.some((p) => user.permissions?.includes(p));
}

function tabsForUser(user: AuthUser | null | undefined) {
  if (!user) return [];
  return TABS.filter((t) => hasPermission(user, TAB_PERMISSIONS[t.id]));
}

/* ─────────────────────────────────────────────── */
/* UTILITIES                                       */
/* ─────────────────────────────────────────────── */

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("cs-CZ", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "-- --- ----";
  }
}

/* ─────────────────────────────────────────────── */
/* SHARED UI ATOMS                                 */
/* ─────────────────────────────────────────────── */

function StatusBadge({ status }: { status: Audit["status"] }) {
  const map: Record<Audit["status"], { label: string; cls: string }> = {
    passed: {
      label: "SCHVÁLENO",
      cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    },
    failed: {
      label: "NEVYHOVUJE",
      cls: "bg-red-500/15 text-red-400 border-red-500/40",
    },
    pending: {
      label: "ČEKÁ",
      cls: "bg-neutral-700/40 text-neutral-400 border-neutral-600",
    },
  };
  const s = map[status] ?? map.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-neutral-400 text-center px-4">
      <Icon className="h-10 w-10 opacity-40" />
      <p className="text-sm uppercase tracking-widest">{label}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {[1, 2, 3].map((id) => (
        <div
          key={`skel-${id}`}
          className="h-32 animate-pulse rounded-lg border border-neutral-800 bg-neutral-900"
        />
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-1">
      <h2 className="text-base font-black uppercase tracking-[0.15em] text-white">
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs uppercase tracking-wider text-neutral-400">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* GATEKEEPER SCREEN                               */
/* ─────────────────────────────────────────────── */

function GatekeeperScreen({
  onSelect,
}: {
  onSelect: (role: "admin" | "inspector") => void;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-neutral-950 px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,199,0,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,199,0,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="pointer-events-none absolute left-8 top-8 h-12 w-12 border-l-2 border-t-2 border-yellow-500/30" />
      <div className="pointer-events-none absolute right-8 top-8 h-12 w-12 border-r-2 border-t-2 border-yellow-500/30" />
      <div className="pointer-events-none absolute bottom-8 left-8 h-12 w-12 border-b-2 border-l-2 border-yellow-500/30" />
      <div className="pointer-events-none absolute bottom-8 right-8 h-12 w-12 border-b-2 border-r-2 border-yellow-500/30" />

      <div className="mb-12 flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10">
          <Zap className="h-8 w-8 text-yellow-500" fill="currentColor" />
        </div>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-neutral-400">
            QRM Quality Report Manager
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-[0.12em] text-white">
            Systém <span className="text-yellow-500">kontroly</span> kvality
          </h1>
          <p className="mt-2 text-xs uppercase tracking-widest text-neutral-400/60">
            Vyberte režim práce
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-4 sm:flex-row">
        <button
          onClick={() => onSelect("admin")}
          className="group relative flex flex-1 flex-col items-start gap-4 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-left transition-all duration-300 hover:border-yellow-500 hover:shadow-[0_0_30px_rgba(255,199,0,0.08)]"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-neutral-800 bg-black transition-colors group-hover:border-yellow-500/40 group-hover:bg-yellow-500/10">
            <LayoutDashboard className="h-6 w-6 text-neutral-400 transition-colors group-hover:text-yellow-500" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-neutral-400">
              Režim A
            </p>
            <h2 className="mt-1 text-xl font-black uppercase tracking-wider text-white">
              Administrace kvality
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400/70">
              Statistika, struktura firmy, kontrolní body a PDF zprávy od
              inspektorů pro analýzu a zlepšování.
            </p>
          </div>
          <div className="mt-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-yellow-500 opacity-0 transition-opacity group-hover:opacity-100">
            <span>Přihlásit se / Registrace</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </button>

        <button
          onClick={() => onSelect("inspector")}
          className="group relative flex flex-1 flex-col items-start gap-4 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-left transition-all duration-300 hover:border-yellow-500 hover:shadow-[0_0_30px_rgba(255,199,0,0.08)]"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-neutral-800 bg-black transition-colors group-hover:border-yellow-500/40 group-hover:bg-yellow-500/10">
            <Smartphone className="h-6 w-6 text-neutral-400 transition-colors group-hover:text-yellow-500" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-neutral-400">
              Režim B
            </p>
            <h2 className="mt-1 text-xl font-black uppercase tracking-wider text-white">
              Terminál inspektora
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400/70">
              QR kódy pracovišť, kontrolní list, závěr, fotografie a automatické
              odeslání PDF oddělení kvality.
            </p>
          </div>
          <div className="mt-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-yellow-500 opacity-0 transition-opacity group-hover:opacity-100">
            <span>Přihlásit se / Registrace</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* ADMIN: TOP NAVIGATION                           */
/* ─────────────────────────────────────────────── */

function AdminTopNav({
  active,
  onChange,
  onHome,
  user,
  onLogout,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  onHome: () => void;
  user: AuthUser;
  onLogout: () => void;
}) {
  const visibleTabs = tabsForUser(user);
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-black/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 md:gap-4 md:px-8">
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-yellow-500 text-black">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-white">
              QRM
            </p>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">
              Quality Report Manager
            </p>
            <p className="text-[10px] uppercase tracking-wider text-neutral-600">
              {user.full_name}
              {user.role === "superadmin" && (
                <span className="ml-2 text-yellow-500">· Superadmin</span>
              )}
              {user.role === "admin" && (
                <span className="ml-2 text-blue-400">· Kvalita</span>
              )}
            </p>
          </div>
        </div>

        <nav className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {visibleTabs.map((t) => {
            const isActive = active === t.id;
            const Icon = t.icon;
            return (
              <button
                key={`tab-${t.id}`}
                onClick={() => onChange(t.id)}
                title={t.hint}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors sm:px-4 sm:text-[13px]",
                  isActive
                    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-500 shadow-[0_0_20px_rgba(255,199,0,0.08)]"
                    : "border-transparent text-neutral-400 hover:border-neutral-800 hover:bg-neutral-900 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onHome}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 transition-colors hover:border-yellow-500 hover:text-yellow-500"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Na hlavní</span>
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 transition-colors hover:border-red-500 hover:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Odhlásit</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────── */
/* ADMIN: LIVE OPERATIONS                          */
/* ─────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: any;
  accent?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-850 bg-neutral-900 p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-800 to-transparent" />
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400">
          {label}
        </span>
        <Icon
          className={cn(
            "h-4 w-4",
            accent ? "text-yellow-500" : "text-neutral-400/60",
          )}
        />
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span
          className={cn(
            "font-mono text-4xl font-black tracking-tight",
            accent ? "text-yellow-500" : "text-white",
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-lg font-bold text-neutral-400">{unit}</span>
        )}
      </div>
    </div>
  );
}

function LiveOperations({
  departments = [],
  audits = [],
  loading,
}: {
  departments: Department[];
  audits: Audit[];
  managers: Manager[];
  loading: boolean;
}) {
  const [statsDept, setStatsDept] = useState<Department | null>(null);

  const recentAudits = useMemo(() => {
    if (!audits) return [];
    return [...audits]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 12);
  }, [audits]);

  if (loading)
    return (
      <div className="space-y-6">
        <SkeletonGrid />
      </div>
    );

  return (
    <div className="space-y-7">
      <section>
        <SectionHeader
          title="Pracoviště"
          subtitle="Klikněte na oddělení — statistika denní, týdenní a měsíční kontroly"
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(departments || []).map((d) => (
            <button
              key={`dept-node-${d.id}`}
              type="button"
              onClick={() => setStatsDept(d)}
              className="relative rounded-lg border border-neutral-850 bg-neutral-900 p-5 text-left transition-colors hover:border-yellow-500/40 hover:bg-neutral-900/80"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-black text-neutral-400">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                      {d.name}
                    </h3>
                    <p className="font-mono text-[11px] text-neutral-400">
                      {d.qr_id ?? "—"}
                    </p>
                  </div>
                </div>
                <BarChart3 className="h-4 w-4 text-yellow-500" />
              </div>
              <p className="mt-4 border-t border-neutral-800 pt-3 text-[10px] uppercase tracking-widest text-neutral-500">
                Denní · Týdenní · Měsíční kontrola
              </p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Historie aktivit"
          subtitle="Přehled posledních kontrol"
        />
        <div className="rounded-lg border border-neutral-850 bg-neutral-900">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
            <Activity className="h-4 w-4 text-yellow-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
              Operační log
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {recentAudits.length === 0 ? (
              <EmptyState icon={Activity} label="Žádné záznamy k dispozici" />
            ) : (
              <ul className="divide-y divide-neutral-950">
                {recentAudits.map((a) => {
                  const dept = departments.find(
                    (d) => d.id === a.department_id,
                  );
                  return (
                    <li
                      key={`audit-log-${a.id}`}
                      className="flex flex-wrap items-center gap-2 px-4 py-3"
                    >
                      <span className="font-mono text-xs text-neutral-400">
                        {formatTime(a.created_at)}
                      </span>
                      <span className="text-xs text-neutral-400/50">
                        {formatDate(a.created_at)}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {dept?.name ?? "Neznámé oddělení"}
                      </span>
                      <span className="text-xs text-neutral-400">
                        insp. {a.inspector_name}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <StatusBadge status={a.status} />
                        <span className="font-mono text-sm font-bold text-yellow-500">
                          {a.score}%
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {statsDept && (
        <DepartmentStatsModal department={statsDept} onClose={() => setStatsDept(null)} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* ADMIN: HIERARCHY BUILDER                        */
/* ─────────────────────────────────────────────── */

function HierarchyView({
  departments = [],
  managers = [],
  loading,
  onAddDept,
  onDeleteDept,
  onAddManager,
  onRemoveManager,
}: {
  departments: Department[];
  managers: Manager[];
  loading: boolean;
  onAddDept: (name: string, parentId: string | null) => void;
  onDeleteDept: (id: string) => void;
  onAddManager: (deptId: string, fullName: string, position: string) => void;
  onRemoveManager: (id: string) => void;
}) {
  const [rootDeptName, setRootDeptName] = useState("");
  const [childAddFor, setChildAddFor] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [mgrAddFor, setMgrAddFor] = useState<string | null>(null);
  const [mgrName, setMgrName] = useState("");
  const [mgrPosition, setMgrPosition] = useState("");
  const [statsDept, setStatsDept] = useState<Department | null>(null);

  const roots = (departments || []).filter((d) => !d.parent_id);
  const childrenOf = (id: string) =>
    (departments || []).filter((d) => d.parent_id === id);
  const managersOf = (id: string) =>
    (managers || []).filter((m) => m.department_id === id);

  function submitRoot() {
    if (!rootDeptName.trim()) return;
    onAddDept(rootDeptName.trim(), null);
    setRootDeptName("");
  }

  function submitChild(parentId: string) {
    if (!childName.trim()) return;
    onAddDept(childName.trim(), parentId);
    setChildName("");
    setChildAddFor(null);
  }

  function submitManager(deptId: string) {
    if (!mgrName.trim() || !mgrPosition.trim()) return;
    onAddManager(deptId, mgrName.trim(), mgrPosition.trim());
    setMgrName("");
    setMgrPosition("");
    setMgrAddFor(null);
  }

  function renderNode(dept: Department, depth: number): React.ReactNode {
    const kids = childrenOf(dept.id);
    const mgrs = managersOf(dept.id);
    return (
      <div key={`node-wrapper-${dept.id}`} className="mt-2">
        <div
          className="rounded-lg border border-neutral-850 bg-neutral-900"
          style={{ marginLeft: depth > 0 ? Math.min(depth * 16, 48) : 0 }}
        >
          <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
            {depth > 0 && (
              <CornerDownRight className="h-4 w-4 text-neutral-400/50" />
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-neutral-400">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold uppercase tracking-wider text-white">
                {dept.name}
              </h3>
              <div className="mt-0.5 flex items-center gap-2">
                <QrCode className="h-3 w-3 text-neutral-400/60" />
                <span className="font-mono text-[11px] text-neutral-400" title="Trvalý QR kód — nelze změnit">
                  {dept.qr_id ?? "BEZ QR"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatsDept(dept)}
                title="Statistika kontrol"
                className="rounded-md border border-neutral-700 p-1.5 text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() =>
                  setChildAddFor(childAddFor === dept.id ? null : dept.id)
                }
                title="Přidat podřízenou strukturu"
                className="rounded-md border border-neutral-700 p-1.5 text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
              >
                <PlusCircle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDeleteDept(dept.id)}
                title="Smazat uzel"
                className="rounded-md border border-neutral-700 p-1.5 text-neutral-400 hover:border-red-500 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {childAddFor === dept.id && (
            <div className="flex flex-col gap-2 border-b border-neutral-800 bg-yellow-500/5 px-4 py-3 sm:flex-row sm:items-center">
              <input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitChild(dept.id)}
                placeholder={`Pododdělení uvnitř ${dept.name}`}
                className="flex-1 rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => submitChild(dept.id)}
                  className="rounded-md bg-yellow-500 px-3 py-2 text-xs font-bold uppercase text-black"
                >
                  Přidat
                </button>
                <button
                  onClick={() => setChildAddFor(null)}
                  className="rounded-md border border-neutral-700 px-3 py-2 text-xs font-bold uppercase text-neutral-400"
                >
                  Zrušit
                </button>
              </div>
            </div>
          )}

          <div className="px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                Odpovědné osoby ({mgrs.length})
              </span>
              <button
                onClick={() =>
                  setMgrAddFor(mgrAddFor === dept.id ? null : dept.id)
                }
                className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] font-bold uppercase text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
              >
                <UserPlus className="h-3.5 w-3.5" /> Přiřadit
              </button>
            </div>
            {mgrs.length === 0 && mgrAddFor !== dept.id && (
              <p className="text-xs text-neutral-400/60">
                Nejsou přiřazeni žádní supervizoři.
              </p>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {mgrs.map((m) => (
                <div
                  key={`mgr-${m.id}`}
                  className="group relative flex items-start gap-3 rounded-md border border-neutral-800 bg-black/40 p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-yellow-500/15 text-yellow-500">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {m.full_name}
                    </p>
                    <p className="truncate text-[11px] uppercase tracking-wider text-neutral-400">
                      {m.position}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemoveManager(m.id)}
                    className="rounded-md p-1 text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {mgrAddFor === dept.id && (
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 sm:flex-row sm:items-center">
                <input
                  value={mgrName}
                  onChange={(e) => setMgrName(e.target.value)}
                  placeholder="Jméno a příjmení"
                  className="flex-1 rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
                />
                <input
                  value={mgrPosition}
                  onChange={(e) => setMgrPosition(e.target.value)}
                  placeholder="Pozice (např. Mistr směny)"
                  className="flex-1 rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => submitManager(dept.id)}
                    className="rounded-md bg-yellow-500 px-3 py-2 text-xs font-bold uppercase text-black"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setMgrAddFor(null)}
                    className="rounded-md border border-neutral-700 px-3 py-2 text-xs font-bold uppercase text-neutral-400"
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {kids.length > 0 && (
          <div className="space-y-1">
            {kids.map((k) => renderNode(k, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Struktura firmy"
        subtitle="Oddělení, pododdělení a odpovědné osoby"
      />
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-850 bg-neutral-900 p-4 sm:flex-row sm:items-center">
        <PlusCircle className="h-5 w-5 text-yellow-500" />
        <input
          value={rootDeptName}
          onChange={(e) => setRootDeptName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitRoot()}
          placeholder="Název hlavního oddělení / haly"
          className="flex-1 rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
        />
        <button
          onClick={submitRoot}
          className="rounded-md bg-yellow-500 px-4 py-2 text-xs font-bold uppercase text-black"
        >
          Vytvořit hlavní uzel
        </button>
      </div>
      {loading ? (
        <SkeletonGrid />
      ) : roots.length === 0 ? (
        <EmptyState
          icon={Layers}
          label="Struktura je prázdná. Vytvořte kořenový uzel."
        />
      ) : (
        <div className="space-y-3">{roots.map((r) => renderNode(r, 0))}</div>
      )}

      {statsDept && (
        <DepartmentStatsModal department={statsDept} onClose={() => setStatsDept(null)} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* ADMIN: CRITERIA DATABASE                        */
/* ─────────────────────────────────────────────── */

function CriteriaView({
  criteria = [],
  departments = [],
  loading,
  onAdd,
  onUpdate,
  onDelete,
}: {
  criteria: Criterion[];
  departments: Department[];
  loading: boolean;
  onAdd: (
    code: string,
    title: string,
    category: CriterionCategory,
    departmentId: string,
    frequency: AuditFrequency,
    description: string,
    file: File | null,
  ) => Promise<void>;
  onUpdate: (
    id: string,
    code: string,
    title: string,
    category: CriterionCategory,
    departmentId: string,
    frequency: AuditFrequency,
    description: string,
    file: File | null,
  ) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [filterCat, setFilterCat] = useState<string>("All");
  const [filterDept, setFilterDept] = useState<string>("All");
  const [filterFreq, setFilterFreq] = useState<string>("All");

  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState<CriterionCategory>("5S");
  const [newDeptId, setNewDeptId] = useState("");
  const [newFreq, setNewFreq] = useState<AuditFrequency>("Daily");
  const [newDescription, setNewDescription] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Criterion | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCat, setEditCat] = useState<CriterionCategory>("5S");
  const [editDeptId, setEditDeptId] = useState("");
  const [editFreq, setEditFreq] = useState<AuditFrequency>("Daily");
  const [editDescription, setEditDescription] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (departments.length > 0 && !newDeptId) {
      setNewDeptId(departments[0].id);
    }
  }, [departments, newDeptId]);

  useEffect(() => {
    if (!newFile) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(newFile);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newFile]);

  useEffect(() => {
    if (!editFile) {
      if (editing?.image_url) {
        setEditPreview(api.fileUrl(editing.image_url));
      } else if (!editing) {
        setEditPreview(null);
      }
      return;
    }
    const url = URL.createObjectURL(editFile);
    setEditPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editFile, editing]);

  const filtered = (criteria || []).filter((c) => {
    const matchCat = filterCat === "All" || c.category === filterCat;
    const matchDept = filterDept === "All" || c.department_id === filterDept;
    const matchFreq = filterFreq === "All" || c.frequency === filterFreq;
    return matchCat && matchDept && matchFreq;
  });

  function resetForm() {
    setNewCode("");
    setNewTitle("");
    setNewDescription("");
    setNewFile(null);
    setFilePreview(null);
  }

  async function submit() {
    if (!newCode.trim() || !newTitle.trim() || !newDeptId || saving) return;
    setSaving(true);
    try {
      await onAdd(
        newCode.trim(),
        newTitle.trim(),
        newCat,
        newDeptId,
        newFreq,
        newDescription.trim(),
        newFile,
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  function openEdit(c: Criterion) {
    setEditing(c);
    setEditCode(c.code);
    setEditTitle(c.title);
    setEditCat(c.category as CriterionCategory);
    setEditDeptId(c.department_id);
    setEditFreq(c.frequency as AuditFrequency);
    setEditDescription(c.description ?? "");
    setEditFile(null);
    setEditPreview(c.image_url ? api.fileUrl(c.image_url) : null);
  }

  function closeEdit() {
    setEditing(null);
    setEditFile(null);
    setEditPreview(null);
  }

  async function saveEdit() {
    if (!editing || !editCode.trim() || !editTitle.trim() || !editDeptId || editSaving) return;
    setEditSaving(true);
    try {
      await onUpdate(
        editing.id,
        editCode.trim(),
        editTitle.trim(),
        editCat,
        editDeptId,
        editFreq,
        editDescription.trim(),
        editFile,
      );
      closeEdit();
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Databáze kontrolních bodů"
        subtitle="Požadavky a instrukce pro inspektory"
      />

      <div className="grid gap-3 rounded-lg border border-neutral-850 bg-neutral-900 p-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Typ kontroly
          </label>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-black px-2.5 py-1.5 text-xs text-white focus:border-yellow-500 focus:outline-none"
          >
            <option value="All">Všechny typy</option>
            {CATEGORIES.map((cat) => (
              <option key={`f-cat-${cat}`} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Oddělení / Úsek
          </label>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-black px-2.5 py-1.5 text-xs text-white focus:border-yellow-500 focus:outline-none"
          >
            <option value="All">Všechna pracoviště</option>
            {departments.map((d) => (
              <option key={`f-dept-${d.id}`} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Periodicita
          </label>
          <select
            value={filterFreq}
            onChange={(e) => setFilterFreq(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-black px-2.5 py-1.5 text-xs text-white focus:border-yellow-500 focus:outline-none"
          >
            <option value="All">Jakákoliv periodicita</option>
            {FREQUENCIES.map((freq) => (
              <option key={`f-freq-${freq}`} value={freq}>
                {freq}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-850 bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b border-neutral-800 bg-black/40">
                <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">
                  Kód
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">
                  Kritérium
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">
                  Popis
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">
                  Foto
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">
                  Oddělení
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">
                  Typ
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">
                  Frekvence
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase text-neutral-400">
                  Akce
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-950">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    Načítání databáze kritérií…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10">
                    <EmptyState
                      icon={ClipboardList}
                      label="Podle zadaných filtrů nebyla nalezena žádná kritéria"
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const dept = departments.find((d) => d.id === c.department_id);
                  return (
                    <tr
                      key={`crit-row-${c.id}`}
                      className="text-xs transition-colors hover:bg-neutral-950/40 md:text-sm"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-yellow-500">
                        {c.code}
                      </td>
                      <td
                        className="max-w-[180px] truncate px-4 py-3 text-white"
                        title={c.title}
                      >
                        {c.title}
                      </td>
                      <td
                        className="max-w-[200px] truncate px-4 py-3 text-neutral-400"
                        title={c.description ?? ""}
                      >
                        {c.description || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {c.image_url ? (
                          <img
                            src={api.fileUrl(c.image_url) ?? undefined}
                            alt={c.title}
                            className="h-10 w-10 rounded border border-neutral-700 object-cover"
                          />
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] uppercase tracking-wider text-neutral-400">
                        {dept?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-500">
                          {c.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-neutral-400">
                        {c.frequency}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="rounded-md p-1.5 text-neutral-400 hover:text-yellow-500"
                            title="Zobrazit / upravit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(c.id)}
                            className="rounded-md p-1.5 text-neutral-400 hover:text-red-400"
                            title="Smazat"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 border-t border-neutral-850 bg-black/20 p-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            Přidat nový kontrolní bod
          </span>

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">
                Kód
              </label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="5S-09"
                className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">
                Co se kontroluje
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Popis požadavku..."
                className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">
                Pracoviště
              </label>
              <select
                value={newDeptId}
                onChange={(e) => setNewDeptId(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-black px-2 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
              >
                {departments.length === 0 && (
                  <option value="">Nejdříve vytvořte oddělení</option>
                )}
                {departments.map((d) => (
                  <option key={`add-opt-dept-${d.id}`} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">
                Typ
              </label>
              <select
                value={newCat}
                onChange={(e) =>
                  setNewCat(e.target.value as CriterionCategory)
                }
                className="w-full rounded-md border border-neutral-700 bg-black px-2 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={`add-opt-cat-${cat}`} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">
                Popis pro inspektora (jak kontrolovat)
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Detailní instrukce pro provádění kontroly..."
                rows={2}
                className="w-full resize-none rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">
                Periodicita
              </label>
              <select
                value={newFreq}
                onChange={(e) =>
                  setNewFreq(e.target.value as AuditFrequency)
                }
                className="w-full rounded-md border border-neutral-700 bg-black px-2 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
              >
                {FREQUENCIES.map((f) => (
                  <option key={`add-opt-freq-${f}`} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">
                Fotografie / SOP
              </label>
              <input
                type="file"
                id="criterion-file-upload"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setNewFile(file);
                }}
              />
              <label
                htmlFor="criterion-file-upload"
                className="flex w-full cursor-pointer items-center justify-between rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
              >
                <span className="truncate">
                  {newFile ? newFile.name : "Vybrat soubor..."}
                </span>
                <Camera className="ml-1 h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
              </label>
            </div>
            <div>
              <button
                type="button"
                disabled={
                  saving ||
                  departments.length === 0 ||
                  !newCode.trim() ||
                  !newTitle.trim()
                }
                onClick={submit}
                className="w-full rounded-md bg-yellow-500 px-6 py-2 text-xs font-bold uppercase text-black transition-colors hover:bg-yellow-400 disabled:opacity-40"
              >
                {saving ? "Ukládám…" : "Uložit kontrolní bod"}
              </button>
            </div>
          </div>

          {filePreview && newFile?.type.startsWith("image/") && (
            <div className="flex items-center gap-3 rounded-md border border-neutral-800 bg-black/40 p-3">
              <ImageIcon className="h-4 w-4 shrink-0 text-yellow-500" />
              <img
                src={filePreview}
                alt="Náhled"
                className="h-16 w-16 rounded border border-neutral-700 object-cover"
              />
              <span className="truncate text-xs text-neutral-400">
                Náhled: {newFile.name}
              </span>
              <button
                type="button"
                onClick={() => setNewFile(null)}
                className="ml-auto rounded p-1 text-neutral-400 hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={closeEdit}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500">
                  Kontrolní bod
                </p>
                <h3 className="text-lg font-bold text-white">Zobrazit / upravit</h3>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-md border border-neutral-700 p-2 text-neutral-400 hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Kód</label>
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Pracoviště</label>
                <select
                  value={editDeptId}
                  onChange={(e) => setEditDeptId(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-black px-2 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
                >
                  {departments.map((d) => (
                    <option key={`edit-dept-${d.id}`} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Co se kontroluje</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Typ</label>
                <select
                  value={editCat}
                  onChange={(e) => setEditCat(e.target.value as CriterionCategory)}
                  className="w-full rounded-md border border-neutral-700 bg-black px-2 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={`edit-cat-${cat}`} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Periodicita</label>
                <select
                  value={editFreq}
                  onChange={(e) => setEditFreq(e.target.value as AuditFrequency)}
                  className="w-full rounded-md border border-neutral-700 bg-black px-2 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={`edit-freq-${f}`} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Popis pro inspektora</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-white focus:border-yellow-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Fotografie / SOP</label>
                <input
                  type="file"
                  id="criterion-edit-file"
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                />
                <label
                  htmlFor="criterion-edit-file"
                  className="flex w-full cursor-pointer items-center justify-between rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs text-neutral-400 hover:border-neutral-600"
                >
                  <span className="truncate">{editFile ? editFile.name : "Změnit soubor…"}</span>
                  <Camera className="h-3.5 w-3.5" />
                </label>
                {editPreview && (
                  <img
                    src={editPreview}
                    alt=""
                    className="mt-2 h-24 rounded border border-neutral-700 object-contain"
                  />
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeEdit}
                className="flex-1 rounded-md border border-neutral-700 py-2.5 text-xs font-bold uppercase text-neutral-400"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={editSaving || !editCode.trim() || !editTitle.trim()}
                onClick={() => void saveEdit()}
                className="flex-1 rounded-md bg-yellow-500 py-2.5 text-xs font-bold uppercase text-black disabled:opacity-40"
              >
                {editSaving ? "Ukládám…" : "Uložit změny"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* MAIN APP SYSTEM                                 */
/* ─────────────────────────────────────────────── */

export default function App() {
  const [mode, setMode] = useState<AppMode>("gatekeeper");
  const [authRole, setAuthRole] = useState<"admin" | "inspector">("admin");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getStoredUser());
  const [tab, setTab] = useState<TabId>("live");
  const [backendOnline, setBackendOnline] = useState(true);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminSessions, setAdminSessions] = useState<UserSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const online = await checkBackend();
    setBackendOnline(online);
    if (!online) {
      setLoading(false);
      return;
    }
    try {
      const [d, m, c, a] = await Promise.all([
        api.getDepartments(),
        api.getManagers(),
        api.getCriteria(),
        api.getAudits(),
      ]);
      setDepartments(d);
      setManagers(m);
      setCriteria(c);
      setAudits(a);
      const stored = getStoredUser();
      if (stored && hasPermission(stored, "users")) {
        setAdminUsers(await api.getAdminUsers());
      } else {
        setAdminUsers([]);
      }
      if (stored && hasPermission(stored, "sessions")) {
        setAdminSessions(await api.getAdminSessions());
      } else {
        setAdminSessions([]);
      }
    } catch (e) {
      console.error("Chyba načítání dat:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "admin" || mode === "inspector") fetchData();
  }, [mode]);

  useEffect(() => {
    if (mode !== "admin" && mode !== "inspector") return;
    const token = getToken();
    if (!token) return;
    api
      .me()
      .then((user) => {
        saveSession(token, user);
        setCurrentUser(user);
      })
      .catch(() => {});
  }, [mode]);

  const handleAddDept = async (name: string, parent_id: string | null) => {
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
    const newDept: Department = {
      id,
      name,
      qr_id: '',
      parent_id,
      audit_completed_today: false,
      last_score: null,
    };
    await api.createDepartment(newDept);
    fetchData();
  };

  const handleDeleteDept = async (id: string) => {
    await api.deleteDepartment(id);
    fetchData();
  };

  const handleAddManager = async (
    department_id: string,
    full_name: string,
    position: string,
  ) => {
    await api.createManager({
      id: Math.random().toString(36).slice(2, 11),
      full_name,
      position,
      department_id,
    });
    fetchData();
  };

  const handleRemoveManager = async (id: string) => {
    await api.deleteManager(id);
    fetchData();
  };

  const handleAddCriterion = async (
    code: string,
    title: string,
    category: CriterionCategory,
    department_id: string,
    frequency: AuditFrequency,
    description: string,
    file: File | null,
  ) => {
    if (file) {
      const form = new FormData();
      form.append("code", code);
      form.append("title", title);
      form.append("department_id", department_id);
      form.append("category", category);
      form.append("frequency", frequency);
      form.append("description", description);
      form.append("file", file);
      await api.createCriterionWithFile(form);
    } else {
      await api.createCriterionJson({
        id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11),
        code,
        title,
        category,
        department_id,
        frequency,
        active: true,
        description: description || undefined,
      });
    }
    fetchData();
  };

  const handleDeleteCriterion = async (id: string) => {
    if (!confirm("Opravdu smazat tento kontrolní bod?")) return;
    await api.deleteCriterion(id);
    fetchData();
  };

  const handleUpdateCriterion = async (
    id: string,
    code: string,
    title: string,
    category: CriterionCategory,
    department_id: string,
    frequency: AuditFrequency,
    description: string,
    file: File | null,
  ) => {
    await api.updateCriterion(id, {
      code,
      title,
      category,
      department_id,
      frequency,
      description: description || undefined,
    });
    if (file) {
      await api.updateCriterionImage(id, file);
    }
    fetchData();
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
    const passed = payload.answers.filter((a) => a.value === "pass").length;
    const evaluated = payload.answers.filter((a) => a.value !== "na").length;
    const score = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 100;
    const status = score >= 85 ? "passed" : "failed";

    const audit = await api.submitAudit({
      ...payload,
      score,
      status,
    });
    await fetchData();
    return { score: audit.score, status: audit.status, auditId: audit.id };
  };

  const logout = async () => {
    await api.logout();
    setCurrentUser(null);
    setMode("gatekeeper");
    setTab("live");
    setAdminUsers([]);
    setAdminSessions([]);
  };

  const goHome = () => {
    void logout();
  };

  const onAuthSuccess = () => {
    const user = getStoredUser();
    setCurrentUser(user);
    if (isAdminUser(user)) setMode("admin");
    else if (hasPermission(user, "inspector")) setMode("inspector");
  };

  useEffect(() => {
    if ((mode === "admin" || mode === "inspector") && !currentUser) {
      setMode("auth");
    }
  }, [mode, currentUser]);

  if (mode === "gatekeeper") {
    return (
      <GatekeeperScreen
        onSelect={(role) => {
          setAuthRole(role);
          const stored = getStoredUser();
          if (role === "admin" && stored && isAdminUser(stored)) {
            setCurrentUser(stored);
            setMode("admin");
          } else if (role === "inspector" && stored && hasPermission(stored, "inspector")) {
            setCurrentUser(stored);
            setMode("inspector");
          } else if (stored?.role === role) {
            setCurrentUser(stored);
            setMode(role === "admin" ? "admin" : "inspector");
          } else {
            setMode("auth");
          }
        }}
      />
    );
  }

  if (mode === "auth") {
    return (
      <AuthScreen
        role={authRole}
        onSuccess={onAuthSuccess}
        onBack={() => setMode("gatekeeper")}
      />
    );
  }

  if ((mode === "admin" || mode === "inspector") && !currentUser) {
    return null;
  }

  if (mode === "admin" && isAdminUser(currentUser)) {
    return (
      <div className="min-h-screen bg-neutral-950 font-sans text-neutral-100 selection:bg-yellow-500 selection:text-black">
        {!backendOnline && (
          <div className="bg-red-500/20 px-4 py-2 text-center text-xs text-red-300">
            Backend není dostupný — spusťte server: cd backend && uvicorn main:app --reload
          </div>
        )}
        <AdminTopNav
          active={tab}
          onChange={setTab}
          onHome={goHome}
          user={currentUser!}
          onLogout={() => void logout()}
        />
        <main className="mx-auto w-full max-w-7xl overflow-x-hidden p-4 md:p-8">
          {tab === "live" && (
            <LiveOperations
              departments={departments}
              audits={audits}
              managers={managers}
              loading={loading}
            />
          )}
          {tab === "hierarchy" && hasPermission(currentUser, "structure") && (
            <HierarchyView
              departments={departments}
              managers={managers}
              loading={loading}
              onAddDept={handleAddDept}
              onDeleteDept={handleDeleteDept}
              onAddManager={handleAddManager}
              onRemoveManager={handleRemoveManager}
            />
          )}
          {tab === "criteria" && hasPermission(currentUser, "criteria") && (
            <CriteriaView
              criteria={criteria}
              departments={departments}
              loading={loading}
              onAdd={handleAddCriterion}
              onUpdate={handleUpdateCriterion}
              onDelete={handleDeleteCriterion}
            />
          )}
          {tab === "reports" && (
            <ReportsView audits={audits} loading={loading} onRefresh={fetchData} />
          )}
          {tab === "schedule" && hasPermission(currentUser, "schedule") && (
            <InspectionPlanView
              departments={departments}
              loading={loading}
              onRefresh={fetchData}
            />
          )}
          {tab === "users" && hasPermission(currentUser, "users") && (
            <AdminUsersView
              users={adminUsers}
              loading={loading}
              onRefresh={fetchData}
            />
          )}
          {tab === "sessions" && hasPermission(currentUser, "sessions") && (
            <AdminSessionsView
              sessions={adminSessions}
              loading={loading}
              onRefresh={fetchData}
            />
          )}
          {tab === "roles" && hasPermission(currentUser, "roles") && (
            <AdminRolesView loading={loading} onRefresh={fetchData} />
          )}
        </main>
      </div>
    );
  }

  if (mode === "inspector" && hasPermission(currentUser, "inspector")) {
    return (
      <div className="min-h-screen bg-neutral-950 font-sans text-neutral-100">
        {!backendOnline && (
          <div className="bg-red-500/20 px-4 py-2 text-center text-xs text-red-300">
            Backend není dostupný — audity nelze odeslat
          </div>
        )}
        <InspectorTerminal
          departments={departments}
          criteria={criteria}
          user={currentUser!}
          onAuditSubmit={handleAuditSubmit}
          onHome={goHome}
          onLogout={logout}
        />
      </div>
    );
  }

  return null;
}
