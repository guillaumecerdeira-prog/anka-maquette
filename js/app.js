import { renderAccueil } from './accueil.js';
import { renderForum } from './forum.js';
import { renderDefis } from './defis.js';
import { renderProfil } from './profil.js';
import { renderMessages } from './messages-tab.js';
import { teardownActiveConversation } from './conversation-thread.js';
import { fetchUnreadMessageCount } from './messaging.js';
import { fetchPendingDmRequestCount } from './dm-requests.js';

const headers = {
  accueil: { eyebrow: "mercredi · à ton rythme", title: "Bonjour" },
  forum: { eyebrow: "des espaces calmes pour discuter", title: "Forum" },
  defis: { eyebrow: "cette semaine", title: "Défis" },
  messages: { eyebrow: "à ton rythme", title: "Messages" },
  profil: { eyebrow: "ton espace", title: "Ton profil" }
};

let currentProfile = null;
let currentSignOut = null;
let activeTab = 'accueil';
let listenersAttached = false;

async function refreshMessagesBadge(){
  const badge = document.getElementById('messages-tab-badge');
  if (!badge || !currentProfile) return;
  try {
    const [unreadMessages, pendingRequests] = await Promise.all([
      fetchUnreadMessageCount(currentProfile.id),
      fetchPendingDmRequestCount(currentProfile.id)
    ]);
    const total = unreadMessages + pendingRequests;
    badge.textContent = total > 9 ? '9+' : String(total);
    badge.classList.toggle('hidden', total === 0);
  } catch (err) {
    console.error('Impossible de rafraîchir le badge messages', err);
  }
}

async function render(tabName){
  teardownActiveConversation();

  const headerEl = document.getElementById('header');
  const contentEl = document.getElementById('content');
  const tabs = document.querySelectorAll('.tab');
  const h = headers[tabName];
  headerEl.innerHTML = `<p class="eyebrow">${h.eyebrow}</p><h1>${h.title}</h1>`;
  contentEl.scrollTop = 0;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));

  refreshMessagesBadge();

  if (tabName === 'accueil') return renderAccueil(contentEl, currentProfile);
  if (tabName === 'forum') return renderForum(contentEl, currentProfile);
  if (tabName === 'defis') return renderDefis(contentEl, currentProfile);
  if (tabName === 'messages') return renderMessages(contentEl, currentProfile);
  return renderProfil(contentEl, currentProfile, { signOut: currentSignOut });
}

// Called every time the app view is (re-)entered, including switching
// between accounts without a full page reload (e.g. the supervisor's
// "log in as a test account" shortcut) — so tab listeners are attached
// only once ever, but the active profile/tab always re-renders with
// fresh data for whoever is currently signed in.
export function initApp({ signOut, profile }){
  currentProfile = profile;
  currentSignOut = signOut;
  headers.accueil.title = `Bonjour, ${profile.display_name}`;

  if (!listenersAttached) {
    listenersAttached = true;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render(activeTab);
      });
    });
  }

  activeTab = 'accueil';
  render(activeTab);
}
