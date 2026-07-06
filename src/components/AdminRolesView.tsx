import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Shield, Trash2 } from 'lucide-react';
import type { AppRole, Permission, PermissionInfo } from '../lib/api';
import { api } from '../lib/api';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface AdminRolesViewProps {
  loading: boolean;
  onRefresh: () => void;
}

export function AdminRolesView({ loading, onRefresh }: AdminRolesViewProps) {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionInfo[]>([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [r, p] = await Promise.all([api.getAdminRoles(), api.getAdminPermissions()]);
    setRoles(r.filter((role) => role.code !== 'superadmin'));
    setCatalog(p.filter((item) => !['users', 'sessions', 'roles'].includes(item.code)));
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function togglePerm(perm: Permission) {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  }

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.createAdminRole({ code, label, permissions: selectedPerms });
      setCode('');
      setLabel('');
      setSelectedPerms([]);
      await load();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function saveRole(role: AppRole, nextLabel: string, perms: Permission[]) {
    setBusy(true);
    try {
      await api.updateAdminRole(role.id, { label: nextLabel, permissions: perms });
      await load();
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(role: AppRole) {
    if (!confirm(`Smazat roli „${role.label}"?`)) return;
    setBusy(true);
    try {
      await api.deleteAdminRole(role.id);
      await load();
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Role a oprávnění</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Vytvářejte nové role pro budoucí oddělení — určete, co smí vidět a upravovat
          </p>
        </div>
        <button
          onClick={() => load().then(onRefresh)}
          disabled={loading || busy}
          className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-xs font-bold uppercase text-neutral-400 hover:border-yellow-500 hover:text-yellow-500"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Obnovit
        </button>
      </div>

      <form
        onSubmit={createRole}
        className="space-y-4 rounded-xl border border-neutral-850 bg-neutral-900 p-5"
      >
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yellow-500">
          <Plus className="h-4 w-4" />
          Nová role
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="kód role (např. sklad)"
            required
            minLength={2}
            className="rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Název (např. Sklad)"
            required
            className="rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {catalog.map((item) => (
            <label
              key={item.code}
              className={cn(
                'cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold uppercase',
                selectedPerms.includes(item.code)
                  ? 'border-yellow-500 bg-yellow-500/10 text-yellow-500'
                  : 'border-neutral-700 text-neutral-400',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selectedPerms.includes(item.code)}
                onChange={() => togglePerm(item.code)}
              />
              {item.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-yellow-500 px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-50"
          >
            Vytvořit roli
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </form>

      <div className="space-y-4">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            catalog={catalog}
            busy={busy}
            onSave={saveRole}
            onDelete={removeRole}
          />
        ))}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  catalog,
  busy,
  onSave,
  onDelete,
}: {
  role: AppRole;
  catalog: PermissionInfo[];
  busy: boolean;
  onSave: (role: AppRole, label: string, perms: Permission[]) => void;
  onDelete: (role: AppRole) => void;
}) {
  const [label, setLabel] = useState(role.label);
  const [perms, setPerms] = useState<Permission[]>(role.permissions);

  useEffect(() => {
    setLabel(role.label);
    setPerms(role.permissions);
  }, [role]);

  return (
    <div className="rounded-xl border border-neutral-850 bg-neutral-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-yellow-500" />
          <code className="text-xs text-neutral-500">{role.code}</code>
          {role.is_system && (
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-400">
              Systém
            </span>
          )}
        </div>
        {!role.is_system && (
          <button
            onClick={() => onDelete(role)}
            disabled={busy}
            className="text-neutral-500 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={role.code === 'superadmin'}
        className="mb-4 w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {catalog.map((item) => (
          <label
            key={item.code}
            className={cn(
              'cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold uppercase',
              perms.includes(item.code)
                ? 'border-yellow-500 bg-yellow-500/10 text-yellow-500'
                : 'border-neutral-700 text-neutral-400',
              role.code === 'superadmin' && 'pointer-events-none opacity-60',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={perms.includes(item.code)}
              onChange={() =>
                setPerms((prev) =>
                  prev.includes(item.code)
                    ? prev.filter((p) => p !== item.code)
                    : [...prev, item.code],
                )
              }
            />
            {item.label}
          </label>
        ))}
      </div>
      {role.code !== 'superadmin' && (
        <button
          onClick={() => onSave(role, label, perms)}
          disabled={busy}
          className="rounded-md border border-yellow-500/40 px-4 py-2 text-xs font-bold uppercase text-yellow-500 hover:bg-yellow-500/10 disabled:opacity-50"
        >
          Uložit změny
        </button>
      )}
    </div>
  );
}
