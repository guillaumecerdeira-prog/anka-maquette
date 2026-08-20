import { supabase } from './supabase-client.js';
import { initApp } from './app.js';
import { fetchMyProfile, createProfile, touchLastSeen } from './profile.js';
import { resetOnboardingForm, onOnboardingSubmit } from './onboarding.js';
import { initSupervisor } from './supervisor.js';
import { hasStashedSession, clearStashedSession, restoreStashedSession } from './session-switch.js';

const authGate = document.getElementById('auth-gate');
const onboardingGate = document.getElementById('onboarding-gate');
const bannedGate = document.getElementById('banned-gate');
const bannedTitle = document.getElementById('banned-title');
const bannedMessage = document.getElementById('banned-message');
const bannedLogoutBtn = document.getElementById('banned-logout');
const appStage = document.getElementById('app-stage');
const supervisorStage = document.getElementById('supervisor-stage');
const modeSwitchBtn = document.getElementById('mode-switch');
const returnSupervisorBtn = document.getElementById('return-supervisor-btn');

const form = document.getElementById('auth-form');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const errorEl = document.getElementById('auth-error');
const submitBtn = document.getElementById('auth-submit');
const titleEl = document.getElementById('auth-title');
const switchText = document.getElementById('auth-switch-text');
const switchBtn = document.getElementById('auth-switch-btn');

const AUTH_ERROR_MESSAGES = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'User already registered': 'Un compte existe déjà avec cet email.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.'
};

let mode = 'signin'; // 'signin' | 'signup'
let currentSession = null;
let currentProfile = null;
let viewMode = 'user'; // 'user' | 'supervisor'

// Persisted so a page reload keeps a supervisor on the supervisor screen
// instead of silently dropping them back to the user app.
const VIEW_MODE_KEY = 'anka_view_mode';

function setMode(next){
  mode = next;
  errorEl.hidden = true;
  if (mode === 'signin') {
    titleEl.textContent = 'Connexion';
    submitBtn.textContent = 'Se connecter';
    switchText.textContent = 'Pas encore de compte ?';
    switchBtn.textContent = 'Créer un compte';
    passwordInput.autocomplete = 'current-password';
  } else {
    titleEl.textContent = 'Créer un compte';
    submitBtn.textContent = 'Créer mon compte';
    switchText.textContent = 'Déjà un compte ?';
    switchBtn.textContent = 'Se connecter';
    passwordInput.autocomplete = 'new-password';
  }
}

function translateError(message){
  return AUTH_ERROR_MESSAGES[message] || message;
}

function showAuthMessage(text, { success = false } = {}){
  errorEl.textContent = text;
  errorEl.classList.toggle('success', success);
  errorEl.hidden = false;
}

switchBtn.addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const { data, error } = mode === 'signin'
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email, password });

  submitBtn.disabled = false;

  if (error) {
    showAuthMessage(translateError(error.message));
    return;
  }

  if (mode === 'signup') {
    // Supabase returns a fake "success" (no error) when the email is already
    // registered, to avoid leaking which emails exist. The one reliable
    // client-side signal for that case: `identities` comes back empty.
    const alreadyRegistered = data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
    setMode('signin');
    if (alreadyRegistered) {
      showAuthMessage('Un compte existe déjà avec cet email — connecte-toi plutôt ci-dessous.');
    } else {
      showAuthMessage('Merci, vous avez reçu un mail de validation. Cliquez sur le lien qu\'il contient, puis revenez vous connecter ici.', { success: true });
    }
  }
});

export async function signOut(){
  await supabase.auth.signOut();
}

bannedLogoutBtn.addEventListener('click', signOut);

function hideAllGates(){
  authGate.classList.add('hidden');
  onboardingGate.classList.add('hidden');
  bannedGate.classList.add('hidden');
  appStage.classList.add('hidden');
  supervisorStage.classList.add('hidden');
}

function applyViewMode(profile){
  sessionStorage.setItem(VIEW_MODE_KEY, viewMode);
  const isSupervisorMode = viewMode === 'supervisor';
  appStage.classList.toggle('hidden', isSupervisorMode);
  supervisorStage.classList.toggle('hidden', !isSupervisorMode);
  modeSwitchBtn.classList.toggle('active', isSupervisorMode);
  modeSwitchBtn.querySelector('.icon-user').hidden = isSupervisorMode;
  modeSwitchBtn.querySelector('.icon-supervisor').hidden = !isSupervisorMode;
  modeSwitchBtn.title = isSupervisorMode ? 'Revenir au mode utilisateur' : 'Basculer vers le mode Superviseur';

  if (isSupervisorMode) {
    initSupervisor(profile.id);
  }
}

modeSwitchBtn.addEventListener('click', () => {
  if (!currentProfile) return;
  viewMode = viewMode === 'user' ? 'supervisor' : 'user';
  applyViewMode(currentProfile);
});

// Shown whenever a supervisor session is stashed (from the "log in as a
// test account" shortcut) — visible regardless of which gate/account is
// currently active, including the login screen itself. Cleared once we're
// actually back on the supervisor's own account.
function updateReturnButton(profile){
  if (profile?.is_supervisor) clearStashedSession();
  returnSupervisorBtn.classList.toggle('hidden', !hasStashedSession());
}

returnSupervisorBtn.addEventListener('click', async () => {
  returnSupervisorBtn.disabled = true;
  const { error } = await restoreStashedSession(supabase);
  returnSupervisorBtn.disabled = false;
  if (error) {
    alert(`Erreur : ${error.message}`);
    updateReturnButton(null);
  }
});

async function enterApp(session){
  let profile;
  try {
    profile = await fetchMyProfile(session.user.id);
  } catch (err) {
    console.error('Impossible de charger le profil', err);
    return;
  }

  updateReturnButton(profile);

  if (!profile) {
    hideAllGates();
    onboardingGate.classList.remove('hidden');
    await resetOnboardingForm();
    return;
  }

  const isSuspended = profile.suspended_until && new Date(profile.suspended_until) > new Date();
  if (profile.is_banned || isSuspended) {
    hideAllGates();
    bannedGate.classList.remove('hidden');
    bannedTitle.textContent = profile.is_banned ? 'Compte banni' : 'Compte suspendu';
    bannedMessage.textContent = profile.is_banned
      ? "Ton compte a été banni par un superviseur."
      : `Ton compte est suspendu jusqu'au ${new Date(profile.suspended_until).toLocaleString('fr-FR')}.`;
    return;
  }

  touchLastSeen(session.user.id);
  currentProfile = profile;

  hideAllGates();
  modeSwitchBtn.classList.toggle('hidden', !profile.is_supervisor);
  viewMode = (profile.is_supervisor && sessionStorage.getItem(VIEW_MODE_KEY) === 'supervisor') ? 'supervisor' : 'user';
  applyViewMode(profile);
  initApp({ signOut, profile });
}

onOnboardingSubmit(async (formData) => {
  await createProfile(currentSession.user.id, formData);
  await enterApp(currentSession);
});

function handleSession(session){
  currentSession = session;
  if (session) {
    enterApp(session);
  } else {
    viewMode = 'user';
    sessionStorage.removeItem(VIEW_MODE_KEY);
    updateReturnButton(null);
    hideAllGates();
    authGate.classList.remove('hidden');
    form.reset();
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

supabase.auth.getSession().then(({ data: { session } }) => {
  handleSession(session);
});
