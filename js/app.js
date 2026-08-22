import { renderAccueil } from './accueil.js';
import { renderForum } from './forum.js';
import { renderDefis } from './defis.js';
import { renderProfil } from './profil.js';
import { renderMessages } from './messages-tab.js';
import { teardownActiveConversation } from './conversation-thread.js';
import { fetchUnreadMessageCount } from './messaging.js';
import { fetchPendingDmRequestCount } from './dm-requests.js';
import { initNotificationCenter } from './notification-center.js';

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

// DMs and notifications are deliberately kept separate (spec §6): this
// badge only ever reflects unread messages + pending DM requests. The
// notification center has its own independent badge on the bell icon,
// refreshed by initNotificationCenter().
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

async function render(tabName, options = {}){
  teardownActiveConversation();

  const headerTextEl = document.getElementById('header-text');
  const contentEl = document.getElementById('content');
  const tabs = document.querySelectorAll('.tab');
  const h = headers[tabName];
  headerTextEl.innerHTML = `<p class="eyebrow">${h.eyebrow}</p><h1>${h.title}</h1>`;
  contentEl.scrollTop = 0;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));

  refreshMessagesBadge();
  initNotificationCenter(currentProfile);

  if (tabName === 'accueil') return renderAccueil(contentEl, currentProfile);
  if (tabName === 'forum') return renderForum(contentEl, currentProfile, options);
  if (tabName === 'defis') return renderDefis(contentEl, currentProfile);
  if (tabName === 'messages') return renderMessages(contentEl, currentProfile);
  return renderProfil(contentEl, currentProfile, { signOut: currentSignOut });
}

// Lets other modules (e.g. the notification center) jump straight to a
// given tab/screen, the same way clicking a tab button would.
export function navigateTo(tabName, options = {}){
  activeTab = tabName;
  render(tabName, options);
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
