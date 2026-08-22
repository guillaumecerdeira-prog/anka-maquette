import { fetchMyConversations } from './messaging.js';
import { fetchIncomingDmRequests, respondDmAccessRequest } from './dm-requests.js';
import { renderConversationThread } from './conversation-thread.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(iso){
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

const CONTEXT_LABELS = { post: 'un post du mur', challenge_response: 'une réponse à un défi' };

export async function renderMessages(container, myProfile){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [conversations, incomingRequests] = await Promise.all([
    fetchMyConversations(myProfile.id),
    fetchIncomingDmRequests(myProfile.id)
  ]);

  const rerender = () => renderMessages(container, myProfile);

  const requestsHtml = incomingRequests.length ? `
    <p class="section-label">Demandes de message</p>
    ${incomingRequests.map(r => `
      <div class="admin-row" data-request-id="${r.id}">
        <div class="avatar ${escapeHtml(r.profiles.avatar_style)}" style="width:36px;height:36px;flex-shrink:0"><div class="avatar-shape"></div></div>
        <div class="admin-row-main" style="margin-left:10px">
          <p class="admin-row-title">${escapeHtml(r.profiles.display_name)}</p>
          <p class="admin-row-sub">À propos d'${CONTEXT_LABELS[r.context_type] || 'un de tes contenus'}</p>
        </div>
        <div class="admin-row-actions">
          <button class="btn-sm" data-action="decline-dm-request" data-id="${r.id}">Refuser</button>
          <button class="btn-sm positive" data-action="accept-dm-request" data-id="${r.id}">Accepter</button>
        </div>
      </div>
    `).join('')}
  ` : '';

  const conversationsHtml = conversations.length ? conversations.map(c => `
    <div class="admin-row" data-action="open-conversation" data-id="${c.id}" style="cursor:pointer">
      <div class="avatar ${escapeHtml(c.otherProfile.avatar_style)}" style="width:44px;height:44px;flex-shrink:0"><div class="avatar-shape"></div></div>
      <div class="admin-row-main" style="margin-left:10px;min-width:0">
        <p class="admin-row-title">${escapeHtml(c.otherProfile.display_name)}${c.status === 'blocked' ? ' <span class="badge">Bloqué</span>' : ''}</p>
        <p class="admin-row-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.lastMessage ? escapeHtml(c.lastMessage.body) : 'Dites bonjour !'}</p>
      </div>
      ${c.unreadCount ? `<span class="unread-badge">${c.unreadCount}</span>` : ''}
    </div>
  `).join('') : `<p class="empty-hint">Pas encore de conversation. Un match, une amitié ou des messages privés ouverts en créent une automatiquement.</p>`;

  container.innerHTML = `
    ${requestsHtml}
    <p class="section-label">Messages</p>
    <div id="conversation-list">${conversationsHtml}</div>
  `;

  container.querySelectorAll('[data-action="accept-dm-request"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await respondDmAccessRequest(btn.dataset.id, true);
        rerender();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
        btn.disabled = false;
      }
    });
  });
  container.querySelectorAll('[data-action="decline-dm-request"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await respondDmAccessRequest(btn.dataset.id, false);
        rerender();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
        btn.disabled = false;
      }
    });
  });
  container.querySelectorAll('[data-action="open-conversation"]').forEach(row => {
    row.addEventListener('click', () => {
      const conversation = conversations.find(c => c.id === row.dataset.id);
      if (conversation) renderConversationThread(container, myProfile, conversation, rerender);
    });
  });
}
