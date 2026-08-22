import { supabase } from './supabase-client.js';
import { fetchMyNotifications, fetchUnreadNotificationCount, markNotificationsRead, markAllNotificationsRead } from './notifications.js';
import { navigateTo } from './app.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(iso){
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

let currentProfile = null;
let listenersAttached = false;
let notifications = [];

async function refreshBadge(){
  const badge = document.getElementById('notif-badge');
  if (!badge || !currentProfile) return;
  try {
    const count = await fetchUnreadNotificationCount(currentProfile.id);
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('hidden', count === 0);
  } catch (err) {
    console.error('Impossible de rafraîchir le badge notifications', err);
  }
}

// Where clicking a notification should lead. Most types point straight at
// the forum (the only screen with real content to jump to so far); a like
// notification stores the like's own id (needed to delete it precisely on
// unlike, see the DB trigger), so it takes one or two extra lookups to
// resolve the actual thread it belongs to.
async function resolveDestination(n){
  if (n.type === 'forum_reply_posted') return { tab: 'forum', options: { threadId: n.related_id } };
  if (n.type === 'match_created') return { tab: 'messages', options: {} };
  if (n.type === 'forum_thread_deleted' || n.type.startsWith('category_proposal_')) return { tab: 'forum', options: {} };

  if (n.type === 'forum_like_received') {
    const { data: like } = await supabase.from('forum_likes').select('target_type, target_id').eq('id', n.related_id).maybeSingle();
    if (!like) return { tab: 'forum', options: {} };
    if (like.target_type === 'forum_thread') return { tab: 'forum', options: { threadId: like.target_id } };
    const { data: post } = await supabase.from('forum_posts').select('thread_id').eq('id', like.target_id).maybeSingle();
    return post ? { tab: 'forum', options: { threadId: post.thread_id } } : { tab: 'forum', options: {} };
  }

  return null;
}

function closePanel(){
  document.getElementById('notif-panel').classList.add('hidden');
}

async function renderList(){
  const listEl = document.getElementById('notif-panel-list');
  listEl.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  notifications = await fetchMyNotifications(currentProfile.id);

  // Chronological only, no grouping by type. Marking read happens either one
  // at a time (clicking a specific notification) or all at once (button
  // above) — never automatically just from viewing the list.
  listEl.innerHTML = notifications.length ? notifications.map(n => `
    <div class="admin-row${n.read_at ? '' : ' is-unread'}" data-notif-id="${n.id}" style="cursor:pointer">
      <div class="admin-row-main">
        <p class="admin-row-title">${escapeHtml(n.title)}${!n.read_at ? ' <span class="badge pending">nouveau</span>' : ''}</p>
        <p class="admin-row-sub">${escapeHtml(n.body)}</p>
        <p class="admin-row-sub">${fmtDate(n.created_at)}</p>
      </div>
    </div>
  `).join('') : `<p class="empty-hint">Aucune notification pour l'instant.</p>`;

  listEl.querySelectorAll('[data-notif-id]').forEach(row => {
    row.addEventListener('click', async () => {
      if (row.classList.contains('is-unread')) {
        row.classList.remove('is-unread');
        row.querySelector('.badge')?.remove();
        markNotificationsRead([row.dataset.notifId]).then(refreshBadge).catch(err => console.error('Impossible de marquer la notification comme lue', err));
      }

      const notif = notifications.find(x => x.id === row.dataset.notifId);
      const destination = notif ? await resolveDestination(notif) : null;
      if (destination) {
        closePanel();
        navigateTo(destination.tab, destination.options);
      }
    });
  });
}

// Safe to call every time the app is (re-)entered: listeners attach only
// once, but the badge count always refreshes for whoever is currently
// signed in.
export function initNotificationCenter(myProfile){
  currentProfile = myProfile;
  refreshBadge();

  if (listenersAttached) return;
  listenersAttached = true;

  const bellBtn = document.getElementById('notif-bell-btn');
  const panel = document.getElementById('notif-panel');
  const backBtn = document.getElementById('notif-panel-back');
  const markAllBtn = document.getElementById('notif-mark-all');

  bellBtn.addEventListener('click', () => {
    panel.classList.remove('hidden');
    history.pushState({ notifPanel: true }, '');
    renderList();
  });

  // The back button reuses the pushed history entry (so a device's physical
  // back gesture and this button behave identically) rather than closing
  // the panel directly — otherwise a stray history entry would linger and
  // the next real back-press would silently no-op instead of leaving.
  backBtn.addEventListener('click', () => {
    if (history.state && history.state.notifPanel) {
      history.back();
    } else {
      closePanel();
    }
  });

  window.addEventListener('popstate', () => {
    if (!panel.classList.contains('hidden')) closePanel();
  });

  markAllBtn.addEventListener('click', async () => {
    markAllBtn.disabled = true;
    try {
      await markAllNotificationsRead(currentProfile.id);
      await renderList();
      await refreshBadge();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
    markAllBtn.disabled = false;
  });
}
