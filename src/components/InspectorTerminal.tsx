import { useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MessageSquare,
  QrCode,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import type { Answer, Audit, AuthUser, Criterion, Department, DepartmentCheckOverview, InspectionPlan } from "../lib/api";
import { api } from "../lib/api";
import { QrScanner } from "./QrScanner";

const SHIFT_OPTIONS = [
  "Ranní (06:00–14:00)",
  "Odpolední (14:00–22:00)",
  "Noční (22:00–06:00)",
];

export function InspectorTerminal({
  departments = [],
  criteria = [],
  user,
  todayPlans = [],
  myAudits = [],
  onAuditSubmit,
  onHome,
  onLogout,
  standalone = false,
  onRefresh,
}: {
  departments: Department[];
  criteria: Criterion[];
  user: AuthUser;
  todayPlans?: InspectionPlan[];
  myAudits?: Audit[];
  onAuditSubmit: (payload: {
    department_id: string;
    shift: string;
    check_frequency?: string;
    answers: Answer[];
    notes: string;
    conclusion: string;
    photos: File[];
  }) => Promise<{ score: number; status: string; auditId: string }>;
  onHome: () => void;
  onLogout: () => void;
  standalone?: boolean;
  onRefresh?: () => void;
}) {
  const [step, setStep] = useState<"home" | "scan" | "pick-check" | "wizard" | "summary" | "receipt" | "report">("home");
  const [viewAudit, setViewAudit] = useState<Audit | null>(null);
  const [shift, setShift] = useState(SHIFT_OPTIONS[0]);
  const [manualQr, setManualQr] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [activeDept, setActiveDept] = useState<Department | null>(null);
  const [activeCheckFrequency, setActiveCheckFrequency] = useState<string | null>(null);
  const [checkOverview, setCheckOverview] = useState<DepartmentCheckOverview | null>(null);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<
    Record<string, { value: "pass" | "fail" | "na"; notes: string }>
  >({});
  const [generalNotes, setGeneralNotes] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [auditPhotos, setAuditPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [receiptData, setReceiptData] = useState<{
    score: number;
    status: string;
    auditId: string;
  } | null>(null);

  const activeCriteria = useMemo(() => {
    if (!activeDept) return [];
    let list = criteria.filter((c) => c.department_id === activeDept.id);
    if (activeCheckFrequency) {
      list = list.filter((c) => c.frequency === activeCheckFrequency);
    }
    return list;
  }, [criteria, activeDept, activeCheckFrequency]);

  const FREQ_LABELS: Record<string, string> = {
    Daily: "Denní kontrola",
    Weekly: "Týdenní kontrola",
    Monthly: "Měsíční kontrola",
    Shiftly: "Kontrola směny",
  };

  const currentCriterion = activeCriteria[currentIdx];

  const pendingPlans = useMemo(
    () => todayPlans.filter((p) => p.status === "pending"),
    [todayPlans],
  );
  const donePlans = useMemo(
    () => todayPlans.filter((p) => p.status === "done"),
    [todayPlans],
  );

  function isRolledOver(plan: InspectionPlan) {
    return plan.notes?.includes("Přeneseno z") ?? false;
  }

  function formatDateShort(iso: string | null | undefined) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString("cs-CZ");
    } catch {
      return iso;
    }
  }

  function resetAuditForm() {
    setCurrentIdx(0);
    setAnswers({});
    setGeneralNotes("");
    setConclusion("");
    setAuditPhotos([]);
    setPhotoPreviews([]);
  }

  function beginWizard(frequency: string | null) {
    setActiveCheckFrequency(frequency);
    resetAuditForm();
    setStep("wizard");
  }

  async function handleScan(code?: string) {
    const qr = (code ?? manualQr).trim();
    if (!qr) return;
    const found = departments.find(
      (d) => d.qr_id?.toLowerCase() === qr.toLowerCase(),
    );
    if (!found) {
      alert("Pracoviště s tímto QR kódem není registrováno.");
      return;
    }
    setManualQr(found.qr_id);
    setShowCamera(false);
    setActiveDept(found);
    setActiveCheckFrequency(null);
    resetAuditForm();
    setLoadingChecks(true);
    setStep("pick-check");
    try {
      const overview = await api.getDepartmentCheckOverview(found.id);
      setCheckOverview(overview);
    } catch {
      setCheckOverview(null);
      alert("Nepodařilo se načíst přehled kontrol.");
      setStep("scan");
    } finally {
      setLoadingChecks(false);
    }
  }

  function handleAnswer(value: "pass" | "fail" | "na", notes = "") {
    if (!currentCriterion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentCriterion.id]: { value, notes },
    }));
    if (currentIdx < activeCriteria.length - 1) setCurrentIdx(currentIdx + 1);
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = [...auditPhotos, ...Array.from(files)];
    setAuditPhotos(next);
    setPhotoPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  async function finishAudit() {
    if (!activeDept || !conclusion.trim()) {
      alert("Vyplňte závěr inspektora — je povinný pro odeslání PDF oddělení kvality.");
      return;
    }
    setSubmitting(true);
    const answersList: Answer[] = activeCriteria.map((c) => ({
      criterion_id: c.id,
      value: answers[c.id]?.value ?? "na",
      notes: answers[c.id]?.notes ?? "",
    }));
    try {
      const result = await onAuditSubmit({
        department_id: activeDept.id,
        shift,
        check_frequency: activeCheckFrequency ?? undefined,
        answers: answersList,
        notes: generalNotes,
        conclusion: conclusion.trim(),
        photos: auditPhotos,
      });
      setReceiptData(result);
      setStep("receipt");
    } catch {
      alert("Chyba při ukládání auditu a generování PDF.");
    } finally {
      setSubmitting(false);
    }
  }

  function startFromPlan(plan: InspectionPlan) {
    const dept = departments.find((d) => d.id === plan.department_id);
    if (!dept) return;
    if (plan.is_due === false) {
      alert("Tato kontrola již byla v aktuálním období provedena.");
      return;
    }
    setActiveDept(dept);
    beginWizard(plan.check_frequency ?? null);
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString("cs-CZ");
    } catch {
      return iso;
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col bg-neutral-950 px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white">
      <div className="mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-yellow-500" />
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider">Terminál inspektora</span>
            <span className="text-[10px] text-neutral-500">{user.full_name}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {onRefresh && (
            <button type="button" onClick={onRefresh} className="rounded-md border border-neutral-800 p-2 text-neutral-400" aria-label="Obnovit">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          {!standalone && (
            <button onClick={onHome} className="rounded-md border border-neutral-800 px-2 py-1 text-[10px] font-bold uppercase text-neutral-400 hover:text-yellow-500">
              Na hlavní
            </button>
          )}
          <button onClick={onLogout} className="rounded-md border border-neutral-800 px-2 py-1 text-[10px] font-bold uppercase text-neutral-400 hover:text-red-400">
            Odhlásit
          </button>
        </div>
      </div>

      {showCamera && (
        <QrScanner
          onScan={(code) => handleScan(code)}
          onClose={() => setShowCamera(false)}
        />
      )}

      <div className="flex flex-1 flex-col">
        {step === "home" && (
          <div className="flex flex-1 flex-col gap-6 py-2">
            <div>
              <h2 className="text-lg font-bold uppercase">Dnešní plán</h2>
              <p className="text-xs text-neutral-400">
                {new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>

            {todayPlans.length === 0 ? (
              <p className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-6 text-center text-xs text-neutral-500">
                Dnes nejsou naplánované kontroly — můžete skenovat QR kód libovolného pracoviště.
              </p>
            ) : (
              <div className="space-y-4">
                {pendingPlans.length > 0 && (
                  <div className="space-y-2">
                    {pendingPlans.map((plan, idx) => {
                      const dept = departments.find((d) => d.id === plan.department_id);
                      const freqLabel = plan.check_frequency
                        ? FREQ_LABELS[plan.check_frequency] ?? plan.check_frequency
                        : plan.plan_type === "followup"
                          ? "Opakovaná kontrola"
                          : plan.plan_type === "extra"
                            ? "Mimořádná"
                            : "Pravidelná";
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          disabled={!dept}
                          onClick={() => startFromPlan(plan)}
                          className="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-left"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-yellow-500">{idx + 1}.</span>
                              <p className="text-sm font-bold">{plan.department_name ?? dept?.name}</p>
                            </div>
                            <p className="text-[10px] uppercase text-neutral-500">
                              {freqLabel}
                              {plan.period_label && plan.check_frequency && (
                                <span className="text-neutral-600"> · {plan.period_label}</span>
                              )}
                              {isRolledOver(plan) && " · přeneseno"}
                            </p>
                            {plan.last_check_at ? (
                              <p className="mt-0.5 text-[10px] text-neutral-500">
                                Poslední: {formatDateShort(plan.last_check_at)}
                                {plan.last_score != null && ` · ${plan.last_score}%`}
                              </p>
                            ) : plan.check_frequency ? (
                              <p className="mt-0.5 text-[10px] text-amber-500/80">
                                Zatím neprovedeno
                              </p>
                            ) : null}
                            {plan.description && (
                              <p className="mt-1 text-[10px] normal-case leading-snug text-neutral-400">
                                {plan.description}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-yellow-500" />
                        </button>
                      );
                    })}
                  </div>
                )}
                {donePlans.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                      Hotovo dnes ({donePlans.length})
                    </p>
                    <div className="space-y-1">
                      {donePlans.map((plan) => (
                        <div
                          key={plan.id}
                          className="rounded-lg border border-neutral-800/50 bg-neutral-900/30 px-4 py-2 text-xs text-neutral-500"
                        >
                          {plan.department_name} · hotovo
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep("scan")}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 py-4 text-sm font-bold uppercase text-black"
            >
              <QrCode className="h-5 w-5" />
              Skenovat QR / nová kontrola
            </button>

            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-neutral-400">
                Moje zprávy
              </h3>
              {myAudits.length === 0 ? (
                <p className="text-xs text-neutral-600">Zatím žádné odeslané audity.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {myAudits.slice(0, 20).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        void api.getAudit(a.id).then((full) => {
                          setViewAudit(full);
                          setStep("report");
                        }).catch(() => {
                          setViewAudit(a);
                          setStep("report");
                        });
                      }}
                      className="flex w-full flex-col rounded-lg border border-neutral-800 bg-black px-3 py-2.5 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold">{a.department_name}</span>
                        <span
                          className={`text-[10px] font-bold uppercase ${a.status === "failed" ? "text-red-400" : "text-yellow-500"}`}
                        >
                          {a.score}%
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-500">{formatDate(a.created_at)}</span>
                      {a.quality_response && (
                        <span className="mt-1 flex items-center gap-1 text-[10px] text-green-400">
                          <MessageSquare className="h-3 w-3" />
                          Reakce kvality
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "report" && viewAudit && (
          <div className="flex flex-1 flex-col gap-4 py-2">
            <button
              type="button"
              onClick={() => {
                setStep("home");
                setViewAudit(null);
              }}
              className="self-start text-xs text-neutral-400"
            >
              ← Zpět
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase text-yellow-500">Zpráva</p>
              <h2 className="text-lg font-bold">{viewAudit.department_name}</h2>
              <p className="text-xs text-neutral-500">
                {formatDate(viewAudit.created_at)} · {viewAudit.score}%
              </p>
            </div>
            {viewAudit.conclusion && (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase text-neutral-500">Závěr</p>
                <p className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
                  {viewAudit.conclusion}
                </p>
              </div>
            )}
            {viewAudit.quality_response ? (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-400" />
                  <p className="text-[10px] font-bold uppercase text-green-400">Reakce oddělení kvality</p>
                </div>
                {viewAudit.quality_responder_name && (
                  <p className="mb-2 text-[10px] text-neutral-500">
                    {viewAudit.quality_responder_name}
                    {viewAudit.quality_response_at && ` · ${formatDate(viewAudit.quality_response_at)}`}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm text-neutral-200">{viewAudit.quality_response}</p>
              </div>
            ) : (
              <p className="text-xs text-neutral-600">Oddělení kvality zatím nereagovalo.</p>
            )}
            {viewAudit.pdf_url && (
              <a
                href={api.pdfUrl(viewAudit.id)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold uppercase text-yellow-500 underline"
              >
                Otevřít PDF
              </a>
            )}
          </div>
        )}

        {step === "pick-check" && activeDept && (
          <div className="flex flex-1 flex-col gap-4 py-2">
            <button
              type="button"
              onClick={() => {
                setStep("scan");
                setCheckOverview(null);
              }}
              className="self-start text-xs text-neutral-400"
            >
              ← Zpět
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase text-yellow-500">Výběr kontroly</p>
              <h2 className="text-lg font-bold">{activeDept.name}</h2>
              <p className="text-xs text-neutral-500">
                Vyberte typ kontroly podle periodicity
              </p>
            </div>

            {loadingChecks ? (
              <p className="py-8 text-center text-xs text-neutral-500">Načítám…</p>
            ) : checkOverview && checkOverview.checks.length > 0 ? (
              <div className="space-y-2">
                {[...checkOverview.checks]
                  .sort((a, b) => {
                    const order = ["Daily", "Weekly", "Monthly", "Shiftly"];
                    return order.indexOf(a.frequency) - order.indexOf(b.frequency);
                  })
                  .map((chk) => (
                  <button
                    key={chk.frequency}
                    type="button"
                    disabled={!chk.is_due || chk.criteria_count === 0}
                    onClick={() => beginWizard(chk.frequency)}
                    className="flex w-full flex-col rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-left disabled:opacity-45"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">
                        {FREQ_LABELS[chk.frequency] ?? chk.label}
                      </span>
                      {chk.is_due ? (
                        <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-yellow-400">
                          K provedení
                        </span>
                      ) : (
                        <span className="rounded bg-green-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-green-400">
                          Splněno {chk.period_label ?? ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-500">
                      {chk.criteria_count} kontrolních bodů
                      {chk.period_label && ` · období: ${chk.period_label}`}
                    </p>
                    {chk.last_check_at ? (
                      <p className="mt-0.5 text-[10px] text-neutral-600">
                        Poslední: {formatDateShort(chk.last_check_at)}
                        {chk.last_score != null && ` · ${chk.last_score}%`}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-neutral-600">Zatím neprovedeno</p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-neutral-500">
                  Pro toto pracoviště nejsou nastaveny kontrolní body podle periodicity.
                </p>
                <button
                  type="button"
                  onClick={() => beginWizard(null)}
                  className="w-full rounded-lg bg-yellow-500 py-3 text-xs font-bold uppercase text-black"
                >
                  Pokračovat bez filtru
                </button>
              </div>
            )}
          </div>
        )}

        {step === "scan" && (
          <div className="my-auto flex flex-col gap-6 text-center">
            <button
              type="button"
              onClick={() => setStep("home")}
              className="self-start text-xs text-neutral-400"
            >
              ← Domů
            </button>
            <QrCode className="mx-auto h-20 w-20 animate-pulse text-yellow-500" />
            <div>
              <h2 className="text-lg font-bold uppercase">Skenování QR kódu</h2>
              <p className="text-xs text-neutral-400">Zadejte kód pracoviště a vyberte směnu</p>
            </div>
            <div className="text-left">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">Pracovní směna</label>
              <select value={shift} onChange={(e) => setShift(e.target.value)} className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2.5 text-sm text-white">
                {SHIFT_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 py-4 text-sm font-bold uppercase text-black"
            >
              <Camera className="h-5 w-5" />
              Otevřít kameru
            </button>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">nebo zadejte kód ručně</p>
            <div className="flex gap-2">
              <input value={manualQr} onChange={(e) => setManualQr(e.target.value)} placeholder="Např: QR-SBO-A1B2" className="flex-1 rounded-md border border-neutral-700 bg-black px-3 py-3 text-sm text-white" />
              <button type="button" onClick={() => handleScan()} className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs font-bold uppercase text-yellow-500">OK</button>
            </div>
          </div>
        )}

        {step === "wizard" && activeDept && (
          <div className="flex flex-1 flex-col">
            {activeCriteria.length === 0 ? (
              <div className="my-auto space-y-4 text-center">
                <ClipboardList className="mx-auto h-12 w-12 opacity-50 text-neutral-500" />
                <p className="text-sm text-neutral-400">Pro «{activeDept.name}» nejsou kontrolní body.</p>
                <button onClick={() => setStep("scan")} className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-bold uppercase">Zpět</button>
              </div>
            ) : currentCriterion ? (
              <>
                <div className="mb-4 border-b border-neutral-800 pb-3">
                  <span className="text-[10px] font-bold uppercase text-yellow-500">{activeDept.name}</span>
                  {activeCheckFrequency && (
                    <p className="mt-0.5 text-[10px] uppercase text-neutral-500">
                      {FREQ_LABELS[activeCheckFrequency] ?? activeCheckFrequency}
                    </p>
                  )}
                  <p className="mt-1 text-xs font-bold">Krok {currentIdx + 1} / {activeCriteria.length}</p>
                </div>
                <div className="my-auto py-4">
                  <h1 className="text-xl font-bold">{currentCriterion.title}</h1>
                  {currentCriterion.description && <p className="mt-2 text-sm text-neutral-400">{currentCriterion.description}</p>}
                  {currentCriterion.image_url && (
                    <img src={api.fileUrl(currentCriterion.image_url) ?? undefined} alt="" className="mt-4 max-h-48 w-full rounded border border-neutral-800 object-contain" />
                  )}
                  <textarea
                    value={answers[currentCriterion.id]?.notes ?? ""}
                    onChange={(e) => setAnswers((p) => ({ ...p, [currentCriterion.id]: { value: p[currentCriterion.id]?.value ?? "na", notes: e.target.value } }))}
                    placeholder="Poznámka k bodu..."
                    className="mt-4 w-full rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm"
                    rows={3}
                  />
                </div>
                <div className="mt-auto grid grid-cols-3 gap-2">
                  <button onClick={() => handleAnswer("fail", answers[currentCriterion.id]?.notes)} className="rounded-md border border-red-500/40 bg-red-500/10 py-3 text-xs font-bold uppercase text-red-400">CHYBA</button>
                  <button onClick={() => handleAnswer("na", answers[currentCriterion.id]?.notes)} className="rounded-md border border-neutral-700 py-3 text-xs font-bold uppercase text-neutral-400">N/A</button>
                  <button onClick={() => handleAnswer("pass", answers[currentCriterion.id]?.notes)} className="rounded-md border border-yellow-500/40 bg-yellow-500/20 py-3 text-xs font-bold uppercase text-yellow-400">OK</button>
                </div>
                <div className="mt-3 flex justify-between">
                  <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)} className="text-xs text-neutral-400 disabled:opacity-30"><ChevronLeft className="inline h-4 w-4" /> Zpět</button>
                  {currentIdx === activeCriteria.length - 1 ? (
                    <button onClick={() => setStep("summary")} className="rounded-md bg-yellow-500 px-4 py-2 text-xs font-bold uppercase text-black">Závěr a odeslání</button>
                  ) : (
                    <button onClick={() => setCurrentIdx(currentIdx + 1)} className="text-xs text-neutral-400">Další <ChevronRight className="inline h-4 w-4" /></button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}

        {step === "summary" && activeDept && (
          <div className="flex flex-1 flex-col gap-4 py-2">
            <h2 className="text-lg font-bold uppercase">Závěr auditu</h2>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-400">Závěr inspektora *</label>
              <textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} rows={4} placeholder="Shrnutí kontroly a doporučení..." className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-400">Obecné poznámky</label>
              <textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={2} className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-400">Fotodokumentace</label>
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" id="audit-photos" onChange={(e) => addPhotos(e.target.files)} />
              <label htmlFor="audit-photos" className="flex cursor-pointer items-center justify-between rounded-md border border-neutral-700 bg-black px-3 py-2 text-xs hover:border-yellow-500">
                <span>Přidat fotografie ({auditPhotos.length})</span>
                <Camera className="h-4 w-4" />
              </label>
              {photoPreviews.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {photoPreviews.map((src) => (
                    <img key={src} src={src} alt="" className="h-20 w-full rounded object-cover" />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-auto flex gap-2">
              <button onClick={() => setStep("wizard")} className="flex-1 rounded-md border border-neutral-700 py-3 text-xs font-bold uppercase">Zpět</button>
              <button onClick={finishAudit} disabled={submitting || !conclusion.trim()} className="flex-1 rounded-md bg-yellow-500 py-3 text-xs font-bold uppercase text-black disabled:opacity-40">
                {submitting ? "Odesílám PDF…" : "Odeslat oddělení kvality"}
              </button>
            </div>
          </div>
        )}

        {step === "receipt" && receiptData && (
          <div className="my-auto flex flex-col gap-6 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-yellow-500" />
            <h2 className="text-xl font-black uppercase">Audit odeslán</h2>
            <p className="text-xs text-neutral-400">PDF zpráva byla odeslána oddělení kvality</p>
            <p className="font-mono text-lg font-bold text-yellow-500">{receiptData.score}%</p>
            <a href={api.pdfUrl(receiptData.auditId)} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase text-yellow-500 underline">Stáhnout PDF kopii</a>
            <button onClick={() => { setStep("home"); setManualQr(""); setActiveDept(null); onRefresh?.(); }} className="rounded-md bg-yellow-500 py-3 text-xs font-bold uppercase text-black">Zpět na přehled</button>
          </div>
        )}
      </div>
    </div>
  );
}
