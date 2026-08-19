const STORAGE_KEY = 'anka_return_session';

// Used by the supervisor's "log in as a test account" shortcut: stashes the
// current (supervisor's) session tokens so a "Revenir à mon compte" button
// can restore them later without re-entering a password. Only ever stashes
// tokens already sitting in this same browser's own active session.
export async function stashCurrentSession(supabase){
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  }));
}

export function hasStashedSession(){
  return !!sessionStorage.getItem(STORAGE_KEY);
}

export function clearStashedSession(){
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function restoreStashedSession(supabase){
  const raw = sessionStorage.getItem(STORAGE_KEY);
  clearStashedSession();
  if (!raw) return { error: new Error('Aucune session à restaurer — reconnecte-toi normalement.') };
  const { access_token, refresh_token } = JSON.parse(raw);
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  return { error };
}
