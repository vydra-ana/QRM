import { useCallback, useEffect, useState } from 'react';
import { BarChart3, X } from 'lucide-react';
import type { Department } from '../lib/api';
import { api } from '../lib/api';

type Period = 'day' | 'week' | 'month';

export interface DepartmentStats {
  department_id: string;
  department_name: string;
  period: Period;
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

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('cs-CZ');
  } catch {
    return iso;
  }
}

const PERIOD_LABELS: Record<Period, string> = {
  day: 'Den',
  week: 'Týden',
  month: 'Měsíc',
};

const FREQ_SHORT: Record<string, string> = {
  Daily: 'Denní',
  Weekly: 'Týdenní',
  Monthly: 'Měsíční',
};

export function DepartmentStatsModal({
  department,
  onClose,
}: {
  department: Department;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const [stats, setStats] = useState<DepartmentStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDepartmentStats(department.id, period);
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [department.id, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 md:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-4 md:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500">
              Statistika oddělení
            </p>
            <h3 className="text-lg font-bold text-white">{department.name}</h3>
            <p className="font-mono text-[11px] text-neutral-500">{department.qr_id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-700 p-2 text-neutral-400 hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-neutral-800 px-4 py-3 md:px-6">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider',
                period === p
                  ? 'bg-yellow-500 text-black'
                  : 'border border-neutral-700 text-neutral-400 hover:border-yellow-500/50',
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {loading ? (
            <p className="py-12 text-center text-neutral-500">Načítání statistiky…</p>
          ) : !stats ? (
            <p className="py-12 text-center text-neutral-500">Data nejsou k dispozici</p>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-neutral-500">
                Období: {stats.from_date} — {stats.to_date}
              </p>

              {stats.frequencies.map((f) => (
                <section
                  key={f.frequency}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-yellow-500" />
                      <h4 className="text-sm font-bold uppercase text-white">
                        {FREQ_SHORT[f.frequency] ?? f.label}
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <span className="text-neutral-500">
                        Kontrol:{' '}
                        <span className="font-bold text-white">{f.checks_count}</span>
                      </span>
                      <span className="text-neutral-500">
                        Průměr:{' '}
                        <span className="font-mono font-bold text-yellow-500">
                          {f.avg_score != null ? `${f.avg_score}%` : '—'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-xs">
                    <span className="text-neutral-500">Poslední kontrola: </span>
                    <span className="text-neutral-300">{formatDateTime(f.last_check_at)}</span>
                    {f.last_score != null && (
                      <span
                        className={cn(
                          'ml-2 font-mono font-bold',
                          f.last_status === 'failed' ? 'text-red-400' : 'text-yellow-500',
                        )}
                      >
                        {f.last_score}%
                      </span>
                    )}
                    {!f.last_check_at && (
                      <span className="ml-2 text-neutral-600">Zatím neprovedeno</span>
                    )}
                  </div>

                  {f.history.length > 0 ? (
                    <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
                      {f.history.map((h) => (
                        <li
                          key={h.id}
                          className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
                        >
                          <span className="text-neutral-500">
                            {formatDateTime(h.created_at)}
                          </span>
                          <span className="text-neutral-400">{h.inspector_name}</span>
                          <span
                            className={cn(
                              'ml-auto font-mono font-bold',
                              h.status === 'failed' ? 'text-red-400' : 'text-yellow-500',
                            )}
                          >
                            {h.score}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-600">V tomto období žádné kontroly.</p>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
