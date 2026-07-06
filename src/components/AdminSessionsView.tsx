import { LogOut, RefreshCw, Wifi } from 'lucide-react';
import type { UserSessionInfo } from '../lib/api';
import { api } from '../lib/api';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function shortAgent(ua: string | null) {
  if (!ua) return '—';
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'Mac';
  return ua.slice(0, 40) + (ua.length > 40 ? '…' : '');
}

interface AdminSessionsViewProps {
  loading: boolean;
  sessions: UserSessionInfo[];
  onRefresh: () => void;
}

export function AdminSessionsView({ loading, sessions, onRefresh }: AdminSessionsViewProps) {
  async function kick(sessionId: string, name: string) {
    if (!confirm(`Ukončit relaci uživatele „${name}"?`)) return;
    try {
      await api.revokeAdminSession(sessionId);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    }
  }

  const active = sessions.filter((s) => s.is_active);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Aktivní relace</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Kdo je právě přihlášen ve firmě (online = aktivita za posledních 5 minut)
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-xs font-bold uppercase text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Obnovit
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-850 bg-neutral-900 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Online nyní</p>
          <p className="mt-2 text-3xl font-black text-green-400">{active.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-850 bg-neutral-900 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Relací (7 dní)</p>
          <p className="mt-2 text-3xl font-black text-white">{sessions.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-850 bg-neutral-900 p-5">
          <Wifi className="h-5 w-5 text-yellow-500" />
          <p className="mt-2 text-xs text-neutral-400">Inspektoři v terénu + admini u PC</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-850 bg-neutral-900">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              <th className="px-4 py-3">Uživatel</th>
              <th className="px-4 py-3">Zařízení</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Poslední aktivita</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-neutral-850/80">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{s.user_name ?? '—'}</p>
                  <p className="text-xs text-neutral-500">{s.user_email}</p>
                </td>
                <td className="px-4 py-3 text-xs text-neutral-400">{shortAgent(s.user_agent)}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-400">{s.ip_address ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-neutral-400">{formatWhen(s.last_active)}</td>
                <td className="px-4 py-3">
                  {s.is_active ? (
                    <span className="text-xs font-bold text-green-400">● Online</span>
                  ) : (
                    <span className="text-xs text-neutral-500">Neaktivní</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.is_active && (
                    <button
                      onClick={() => kick(s.id, s.user_name ?? s.user_email ?? '?')}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase text-red-400 hover:text-red-300"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Ukončit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && sessions.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Žádné aktivní relace</p>
        )}
      </div>
    </div>
  );
}
