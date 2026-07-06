import { useState } from 'react';
import { ChevronLeft, LogIn, UserPlus, Zap } from 'lucide-react';
import type { AuthUser, Permission } from '../lib/api';
import { api } from '../lib/api';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

type AuthPortal = 'admin' | 'inspector';

interface AuthScreenProps {
  role: AuthPortal;
  onSuccess: () => void;
  onBack: () => void;
  hideBack?: boolean;
}

const ADMIN_PERMS: Permission[] = [
  'stats',
  'reports',
  'criteria',
  'structure',
  'users',
  'sessions',
  'roles',
];

function canUseAdminPortal(user: AuthUser): boolean {
  if (user.role === 'superadmin') return true;
  return ADMIN_PERMS.some((p) => user.permissions?.includes(p));
}

function canUseInspectorPortal(user: AuthUser): boolean {
  return user.permissions?.includes('inspector') ?? user.role === 'inspector';
}

export function AuthScreen({ role, onSuccess, onBack, hideBack }: AuthScreenProps) {
  const [view, setView] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isAdmin = role === 'admin';
  const title = isAdmin ? 'Administrace kvality' : 'Terminál inspektora';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (view === 'login') {
        const user = await api.login(email, password);
        if (isAdmin ? !canUseAdminPortal(user) : !canUseInspectorPortal(user)) {
          await api.logout();
          throw new Error(
            isAdmin
              ? 'Tento účet nemá přístup do administrace.'
              : 'Tento účet nemá přístup k terminálu inspektora.',
          );
        }
      } else {
        if (!fullName.trim()) throw new Error('Vyplňte celé jméno');
        const user = await api.register(email, password, fullName.trim(), role);
        if (isAdmin ? !canUseAdminPortal(user) : !canUseInspectorPortal(user)) {
          await api.logout();
          throw new Error('Chyba registrace role');
        }
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba autorizace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6">
      <div className="w-full max-w-md">
        <button
          onClick={onBack}
          className={cn(
            'mb-6 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-yellow-500',
            hideBack && 'invisible pointer-events-none',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          Zpět na výběr režimu
        </button>

        <div className="mb-8 text-center">
          <Zap className="mx-auto mb-3 h-10 w-10 text-yellow-500" fill="currentColor" />
          <h1 className="text-2xl font-black uppercase tracking-wider text-white">{title}</h1>
          <p className="mt-2 text-xs text-neutral-400">
            {view === 'login' ? 'Přihlaste se ke svému účtu' : 'Vytvořte nový účet pro denní práci'}
          </p>
        </div>

        <div className="mb-4 flex rounded-lg border border-neutral-800 bg-black p-1">
          <button
            type="button"
            onClick={() => setView('login')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-bold uppercase tracking-wider',
              view === 'login' ? 'bg-yellow-500 text-black' : 'text-neutral-400',
            )}
          >
            <LogIn className="h-3.5 w-3.5" />
            Přihlášení
          </button>
          <button
            type="button"
            onClick={() => setView('register')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-bold uppercase tracking-wider',
              view === 'register' ? 'bg-yellow-500 text-black' : 'text-neutral-400',
            )}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Registrace
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-neutral-850 bg-neutral-900 p-6">
          {view === 'register' && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Celé jméno
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jan Novák"
                className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jan.novak@firma.cz"
              className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Heslo
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimálně 6 znaků"
              className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-yellow-500 py-3 text-sm font-bold uppercase text-black disabled:opacity-50"
          >
            {loading ? 'Načítání…' : view === 'login' ? 'Přihlásit se' : 'Zaregistrovat se'}
          </button>
        </form>
      </div>
    </div>
  );
}
