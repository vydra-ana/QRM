import { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, RefreshCw, Save, Trash2, UserPlus } from 'lucide-react';
import type { AdminUser, AppRole } from '../lib/api';
import { api } from '../lib/api';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface AdminUsersViewProps {
  loading: boolean;
  users: AdminUser[];
  onRefresh: () => void;
}

export function AdminUsersView({ loading, users, onRefresh }: AdminUsersViewProps) {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('inspector');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [draftPasswords, setDraftPasswords] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .getAdminRoles()
      .then((r) => setRoles(r.filter((x) => x.code !== 'superadmin')))
      .catch(console.error);
  }, []);

  function roleLabel(code: string) {
    return roles.find((r) => r.code === code)?.label ?? code;
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.createAdminUser({ email, password, full_name: fullName, role });
      setEmail('');
      setPassword('');
      setFullName('');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(id: string, name: string) {
    if (!confirm(`Smazat účet „${name}"?`)) return;
    setBusy(true);
    try {
      await api.deleteAdminUser(id);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(
    id: string,
    payload: { full_name?: string; role?: string; password?: string },
  ) {
    setBusy(true);
    try {
      await api.updateAdminUser(id, payload);
      setDraftPasswords((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  function togglePassword(id: string) {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Účty uživatelů</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Upravujte hesla, role a vytvářejte nové účty pro firmu
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading || busy}
          className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-xs font-bold uppercase text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Obnovit
        </button>
      </div>

      <form
        onSubmit={createUser}
        className="grid gap-4 rounded-xl border border-neutral-850 bg-neutral-900 p-5 md:grid-cols-2"
      >
        <div className="md:col-span-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yellow-500">
          <UserPlus className="h-4 w-4" />
          Nový účet
        </div>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Celé jméno"
          required
          className="rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
          className="rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
        />
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Heslo (min. 6 znaků)"
          required
          minLength={6}
          className="rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-md bg-yellow-500 px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Vytvořit
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-850 bg-neutral-900">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              <th className="px-4 py-3">Uživatel</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Heslo</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const draft = draftPasswords[u.id] ?? u.password_note ?? '';
              const isSuper = u.role === 'superadmin';
              return (
                <tr key={u.id} className="border-b border-neutral-850/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{u.full_name}</p>
                    <p className="text-xs text-neutral-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {isSuper ? (
                      <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-500">
                        Superadmin
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => saveUser(u.id, { role: e.target.value })}
                        disabled={busy}
                        className="rounded border border-neutral-700 bg-black px-2 py-1 text-xs text-white"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {!isSuper && (
                      <p className="mt-1 text-[10px] text-neutral-600">{roleLabel(u.role)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isSuper ? (
                        <code className="text-xs text-neutral-500">—</code>
                      ) : (
                        <>
                          <input
                            type={visiblePasswords.has(u.id) ? 'text' : 'password'}
                            value={draft}
                            onChange={(e) =>
                              setDraftPasswords((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                            placeholder="Nové heslo"
                            minLength={6}
                            className="w-28 rounded border border-neutral-700 bg-black px-2 py-1 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() => togglePassword(u.id)}
                            className="text-neutral-500 hover:text-yellow-500"
                          >
                            {visiblePasswords.has(u.id) ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_online ? (
                      <span className="text-xs font-bold text-green-400">● Online</span>
                    ) : (
                      <span className="text-xs text-neutral-500">Offline</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!isSuper && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const pwd = draftPasswords[u.id] ?? u.password_note ?? '';
                            if (pwd.length < 6) {
                              alert('Heslo musí mít alespoň 6 znaků');
                              return;
                            }
                            void saveUser(u.id, { password: pwd });
                          }}
                          disabled={busy}
                          className="flex items-center gap-1 text-[10px] font-bold uppercase text-yellow-500 hover:text-yellow-400"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Uložit heslo
                        </button>
                        <button
                          onClick={() => removeUser(u.id, u.full_name)}
                          className="text-neutral-500 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Žádní uživatelé</p>
        )}
      </div>
    </div>
  );
}
