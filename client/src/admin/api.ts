const KEY = 'aotan.admin.token';

export class AuthError extends Error {}

export const getToken = (): string | null => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const setToken = (t: string | null) => {
  try {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the session simply will not survive a reload */
  }
};

export async function login(password: string): Promise<boolean> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  setToken(((await res.json()) as { token: string }).token);
  return true;
}

export const logout = () => setToken(null);

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`/api/admin/${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${getToken() ?? ''}` },
  });
  if (res.status === 401) {
    setToken(null);
    throw new AuthError('login required');
  }
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res;
}

export const api = async <T>(path: string, init?: RequestInit): Promise<T> => (await request(path, init)).json() as Promise<T>;

/** Downloads a file: a plain link cannot carry the Authorization header. */
export async function download(path: string, filename: string) {
  const blob = await (await request(path)).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
