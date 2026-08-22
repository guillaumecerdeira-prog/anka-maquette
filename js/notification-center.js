import { fetchMyNotifications, fetchUnreadNotificationCount, markNotificationsRead, markAllNotificationsRead } from './notifications.js';

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

async function renderList(){
  const listEl = document.getElementById('notif-panel-list');
  listEl.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const notifications = await fetchMyNotifications(currentProfile.id);

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
      if (!row.classList.contains('is-unread')) return;
      row.classList.remove('is-unread');
      row.querySelector('.badge')?.remove();
      try {
        await markNotificationsRead([row.dataset.notifId]);
        refreshBadge();
      } catch (err) {
        console.error('Impossible de marquer la notification comme lue', err);
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
  const closeBtn = document.getElementById('notif-panel-close');
  const markAllBtn = document.getElementById('notif-mark-all');

  bellBtn.addEventListener('click', () => {
    panel.classList.remove('hidden');
    renderList();
  });
  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
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
