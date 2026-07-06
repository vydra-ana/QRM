import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import type { Department, InspectionPlan, InspectionPlanType } from '../lib/api';
import { api } from '../lib/api';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const FREQ_LABELS: Record<string, string> = {
  Daily: 'Denní',
  Weekly: 'Týdenní',
  Monthly: 'Měsíční',
};

const TYPE_LABELS: Record<InspectionPlanType, string> = {
  regular: 'Pravidelná',
  extra: 'Mimořádná',
  followup: 'Opakovaná',
};

const TYPE_CLS: Record<InspectionPlanType, string> = {
  regular: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  extra: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  followup: 'border-red-500/30 bg-red-500/10 text-red-400',
};

export function InspectionPlanView({
  departments,
  loading: parentLoading,
  onRefresh,
}: {
  departments: Department[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  });
  const [plans, setPlans] = useState<InspectionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [deptId, setDeptId] = useState('');
  const [planType, setPlanType] = useState<InspectionPlanType>('regular');
  const [checkFrequency, setCheckFrequency] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [planDescription, setPlanDescription] = useState('');

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const from = toIso(days[0]);
  const to = toIso(days[6]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getInspectionPlans(from, to);
      setPlans(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const plansByDay = useMemo(() => {
    const map: Record<string, InspectionPlan[]> = {};
    for (const d of days) map[toIso(d)] = [];
    for (const p of plans) {
      if (!map[p.planned_date]) map[p.planned_date] = [];
      map[p.planned_date].push(p);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [plans, days]);

  async function addPlan(dateIso: string) {
    if (!deptId) return;
    try {
      await api.createInspectionPlan({
        department_id: deptId,
        planned_date: dateIso,
        plan_type: planType,
        check_frequency: planType === 'regular' ? checkFrequency : undefined,
        sort_order: (plansByDay[dateIso]?.length ?? 0) + 1,
        description: planDescription.trim() || undefined,
      });
      setAddingFor(null);
      setDeptId('');
      setPlanType('regular');
      setCheckFrequency('Daily');
      setPlanDescription('');
      await loadPlans();
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    }
  }

  async function removePlan(id: string) {
    if (!confirm('Odebrat z plánu?')) return;
    try {
      await api.deleteInspectionPlan(id);
      await loadPlans();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    }
  }

  const todayIso = toIso(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-black uppercase tracking-[0.15em] text-white">
            Plán kontrol
          </h2>
          <p className="text-xs uppercase tracking-wider text-neutral-400">
            Denní = každý den · Týdenní = 1× týdně · Měsíční = 1× měsíčně
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-bold uppercase text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
          >
            ← Předchozí
          </button>
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-yellow-500">
            <CalendarDays className="h-4 w-4" />
            {days[0].toLocaleDateString('cs-CZ')} – {days[6].toLocaleDateString('cs-CZ')}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-bold uppercase text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
          >
            Další →
          </button>
        </div>
      </div>

      {(loading || parentLoading) && plans.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">Načítání plánu…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-7">
          {days.map((day) => {
            const iso = toIso(day);
            const dayPlans = plansByDay[iso] ?? [];
            const isToday = iso === todayIso;
            return (
              <div
                key={iso}
                className={cn(
                  'flex min-h-[220px] flex-col rounded-xl border bg-neutral-950 p-3',
                  isToday ? 'border-yellow-500/50 ring-1 ring-yellow-500/20' : 'border-neutral-800',
                )}
              >
                <div className="mb-3 border-b border-neutral-800 pb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    {day.toLocaleDateString('cs-CZ', { weekday: 'short' })}
                  </p>
                  <p className={cn('text-sm font-bold', isToday ? 'text-yellow-500' : 'text-white')}>
                    {day.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
                  </p>
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {dayPlans.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        'group flex items-start justify-between gap-1 rounded-lg border px-2 py-1.5 text-xs',
                        p.status === 'done'
                          ? 'border-green-500/30 bg-green-500/5 opacity-70'
                          : TYPE_CLS[p.plan_type],
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{p.department_name}</p>
                        <p className="text-[9px] uppercase opacity-70">
                          {p.check_frequency
                            ? FREQ_LABELS[p.check_frequency] ?? p.check_frequency
                            : TYPE_LABELS[p.plan_type]}
                          {p.status === 'done' && ' · hotovo'}
                        </p>
                        {p.description && (
                          <p className="mt-1 line-clamp-2 text-[10px] normal-case leading-snug text-neutral-400">
                            {p.description}
                          </p>
                        )}
                      </div>
                      {p.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => void removePlan(p.id)}
                          className="shrink-0 opacity-0 transition group-hover:opacity-100"
                          aria-label="Odebrat"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}

                  {addingFor === iso ? (
                    <div className="mt-auto space-y-2 rounded-lg border border-neutral-700 bg-black p-2">
                      <select
                        value={deptId}
                        onChange={(e) => setDeptId(e.target.value)}
                        className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-white"
                      >
                        <option value="">Oddělení…</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={planType}
                        onChange={(e) => setPlanType(e.target.value as InspectionPlanType)}
                        className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-white"
                      >
                        <option value="regular">Pravidelná</option>
                        <option value="extra">Mimořádná</option>
                      </select>
                      {planType === 'regular' && (
                        <select
                          value={checkFrequency}
                          onChange={(e) =>
                            setCheckFrequency(e.target.value as 'Daily' | 'Weekly' | 'Monthly')
                          }
                          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-white"
                        >
                          <option value="Daily">Denní kontrola</option>
                          <option value="Weekly">Týdenní kontrola</option>
                          <option value="Monthly">Měsíční kontrola</option>
                        </select>
                      )}
                      <textarea
                        value={planDescription}
                        onChange={(e) => setPlanDescription(e.target.value)}
                        placeholder="Popis kontroly pro inspektora…"
                        rows={2}
                        className="w-full resize-none rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[10px] text-white placeholder:text-neutral-600"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void addPlan(iso)}
                          disabled={!deptId}
                          className="flex-1 rounded bg-yellow-500 py-1.5 text-[10px] font-bold uppercase text-black disabled:opacity-40"
                        >
                          Přidat
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingFor(null);
                            setDeptId('');
                            setPlanDescription('');
                          }}
                          className="rounded border border-neutral-700 px-2 text-[10px] text-neutral-400"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingFor(iso)}
                      className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-700 py-2 text-[10px] font-bold uppercase text-neutral-500 hover:border-yellow-500/50 hover:text-yellow-500"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Přidat
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
