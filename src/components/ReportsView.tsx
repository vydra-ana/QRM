import { useEffect, useState } from 'react';
import { Download, Eye, FileText, MessageSquare, Save, X } from 'lucide-react';
import type { Audit } from '../lib/api';
import { api } from '../lib/api';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

function StatusBadge({ status }: { status: Audit['status'] }) {
  const map = {
    passed: { label: 'SCHVÁLENO', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40' },
    failed: { label: 'NEVYHOVUJE', cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
    pending: { label: 'ČEKÁ', cls: 'bg-neutral-700/40 text-neutral-400 border-neutral-600' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase', s.cls)}>
      {s.label}
    </span>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('cs-CZ');
  } catch {
    return iso;
  }
}

function answerLabel(value: string) {
  if (value === 'pass') return { text: 'Vyhovuje', cls: 'text-green-400' };
  if (value === 'fail') return { text: 'Nevyhovuje', cls: 'text-red-400' };
  return { text: 'N/A', cls: 'text-neutral-500' };
}

function ReportDetailModal({
  audit,
  onClose,
  onSaved,
  canScheduleFollowup = false,
}: {
  audit: Audit;
  onClose: () => void;
  onSaved: () => void;
  canScheduleFollowup?: boolean;
}) {
  const [detail, setDetail] = useState<Audit>(audit);
  const [reaction, setReaction] = useState(audit.quality_response ?? '');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followupDays, setFollowupDays] = useState('7');
  const [followupBusy, setFollowupBusy] = useState(false);
  const [followupScheduled, setFollowupScheduled] = useState(false);

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

  useEffect(() => {
    setLoading(true);
    api
      .getAudit(audit.id)
      .then((full) => {
        setDetail(full);
        setReaction(full.quality_response ?? '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [audit.id]);

  async function saveReaction() {
    if (!reaction.trim()) return;
    setBusy(true);
    try {
      const updated = await api.saveQualityResponse(audit.id, reaction.trim());
      setDetail(updated);
      setReaction(updated.quality_response ?? '');
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba uložení');
    } finally {
      setBusy(false);
    }
  }

  async function scheduleFollowup() {
    const days = parseInt(followupDays, 10);
    if (!days || days < 1) return;
    setFollowupBusy(true);
    try {
      await api.scheduleFollowup(audit.id, days);
      setFollowupScheduled(true);
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setFollowupBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 md:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 bg-black/60 px-4 py-4 md:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500">
              Zpráva inspektora
            </p>
            <h3 className="text-lg font-bold text-white">{detail.department_name ?? 'Oddělení'}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span>{detail.inspector_name}</span>
              <span>·</span>
              <span>{formatDate(detail.created_at)}</span>
              <span>·</span>
              <span>Směna: {detail.shift}</span>
              <span className="font-mono font-bold text-yellow-500">{detail.score}%</span>
              <StatusBadge status={detail.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-700 p-2 text-neutral-400 hover:border-red-500 hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {loading ? (
            <p className="py-12 text-center text-neutral-500">Načítání zprávy…</p>
          ) : (
            <div className="space-y-6">
              {detail.conclusion && (
                <section>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-yellow-500">
                    Závěr inspektora
                  </h4>
                  <p className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-200">
                    {detail.conclusion}
                  </p>
                </section>
              )}

              {detail.notes && (
                <section>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Poznámky
                  </h4>
                  <p className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-300">
                    {detail.notes}
                  </p>
                </section>
              )}

              {(detail.answers?.length ?? 0) > 0 && (
                <section>
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Kontrolní body
                  </h4>
                  <div className="space-y-2">
                    {detail.answers!.map((ans) => {
                      const lbl = answerLabel(ans.value);
                      return (
                        <div
                          key={ans.criterion_id}
                          className="rounded-lg border border-neutral-850 bg-neutral-900 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <span className="font-mono text-[10px] text-yellow-500/80">{ans.code}</span>
                              <p className="text-sm text-white">{ans.title}</p>
                            </div>
                            <span className={cn('text-xs font-bold uppercase', lbl.cls)}>{lbl.text}</span>
                          </div>
                          {ans.notes && (
                            <p className="mt-2 text-xs text-neutral-500">{ans.notes}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {(detail.photos?.length ?? 0) > 0 && (
                <section>
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Fotodokumentace
                  </h4>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {detail.photos!.map((photo) => (
                      <a
                        key={photo.id}
                        href={api.fileUrl(photo.url) ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="group overflow-hidden rounded-lg border border-neutral-800 bg-black"
                      >
                        <img
                          src={api.fileUrl(photo.url) ?? ''}
                          alt={photo.name}
                          className="aspect-square w-full object-cover transition group-hover:opacity-90"
                        />
                        <p className="truncate px-2 py-1 text-[10px] text-neutral-500">{photo.name}</p>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-yellow-500" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-yellow-500">
                    Reakce oddělení kvality
                  </h4>
                </div>
                {detail.quality_response && detail.quality_responder_name && (
                  <p className="mb-2 text-[10px] text-neutral-500">
                    Naposledy: {detail.quality_responder_name}
                    {detail.quality_response_at && ` · ${formatDate(detail.quality_response_at)}`}
                  </p>
                )}
                <textarea
                  value={reaction}
                  onChange={(e) => setReaction(e.target.value)}
                  rows={4}
                  placeholder="Napište reakci, doporučení nebo plán nápravných opatření…"
                  className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void saveReaction()}
                    disabled={busy || !reaction.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-yellow-500 px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Uložit reakci
                  </button>
                  {detail.pdf_url && (
                    <a
                      href={api.pdfUrl(detail.id, true)}
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-neutral-500 hover:text-yellow-500"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Stáhnout PDF
                    </a>
                  )}
                </div>
              </section>

              {canScheduleFollowup && detail.status === 'failed' && (
                <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-red-400">
                    Opakovaná kontrola
                  </h4>
                  <p className="mb-3 text-xs text-neutral-400">
                    Audit nevyhověl — naplánujte opakovanou kontrolu v tomto oddělení.
                  </p>
                  {followupScheduled ? (
                    <p className="text-xs font-bold text-green-400">Opakovaná kontrola byla naplánována.</p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-500">
                          Za kolik dní
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={followupDays}
                          onChange={(e) => setFollowupDays(e.target.value)}
                          className="w-24 rounded-lg border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void scheduleFollowup()}
                        disabled={followupBusy}
                        className="rounded-md bg-red-500/20 px-4 py-2 text-xs font-bold uppercase text-red-300 ring-1 ring-red-500/40 disabled:opacity-50"
                      >
                        Naplánovat opakovanou kontrolu
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReportsView({
  audits,
  loading,
  onRefresh,
}: {
  audits: Audit[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [preview, setPreview] = useState<Audit | null>(null);
  const reports = audits.filter((a) => a.pdf_url || a.conclusion);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-black uppercase tracking-[0.15em] text-white">
          Zprávy inspektorů
        </h2>
        <p className="text-xs uppercase tracking-wider text-neutral-400">
          Prohlížejte zprávy online a pište reakci oddělení kvality
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-850 bg-neutral-900">
        {loading ? (
          <p className="px-4 py-10 text-center text-neutral-400">Načítání zpráv…</p>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-neutral-400">
            <FileText className="h-10 w-10 opacity-40" />
            <p className="text-sm uppercase tracking-widest">Zatím žádné zprávy</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-black/40">
                  <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">Datum</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">Inspektor</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">Oddělení</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">Skóre</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">Stav</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase text-neutral-400">Reakce</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase text-neutral-400">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-950">
                {reports.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer hover:bg-neutral-950/40"
                    onClick={() => setPreview(a)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                      {formatDate(a.created_at)}
                    </td>
                    <td className="px-4 py-3 text-white">{a.inspector_name}</td>
                    <td className="px-4 py-3 text-neutral-400">{a.department_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-yellow-500">{a.score}%</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3">
                      {a.quality_response ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Ano
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreview(a);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-[10px] font-bold uppercase text-yellow-500 hover:bg-yellow-500/20"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Otevřít
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <ReportDetailModal
          audit={preview}
          onClose={() => setPreview(null)}
          onSaved={onRefresh}
          canScheduleFollowup
        />
      )}
    </div>
  );
}
