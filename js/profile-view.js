import { fetchProfileById } from './profile.js';
import { fetchWall } from './posts.js';
import { fetchFriendshipStatus, sendFriendRequest, respondToFriendRequest, removeFriendship } from './friends.js';
import { fetchIncomingConnectionRequest, respondToConnectionRequest } from './connections.js';
import { fetchFacePhotoUrl } from './face-photo.js';
import { reportButtonHtml, attachReportHandlers } from './reports.js';
import { fetchConversationBetween, startOpenDmConversation } from './messaging.js';
import { sendDmAccessRequest, fetchOutgoingDmRequestStatus } from './dm-requests.js';
import { fetchBlockedIds, blockProfile, unblockProfile } from './blocks.js';
import { renderConversationThread } from './conversation-thread.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function computeAge(birthDate){
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function friendActionHtml(friendship, myId){
  if (!friendship || friendship.status === 'declined') {
    return `<button class="btn btn-primary" id="friend-action">Ajouter en ami</button>`;
  }
  if (friendship.status === 'pending' && friendship.requester_id === myId) {
    return `<button class="btn btn-ghost" disabled>Demande envoyée</button>`;
  }
  if (friendship.status === 'pending') {
    return `
      <button class="btn btn-ghost" id="friend-decline" data-id="${friendship.id}">Refuser</button>
      <button class="btn btn-primary" id="friend-accept" data-id="${friendship.id}">Accepter</button>
    `;
  }
  return `<button class="btn btn-ghost" id="friend-remove" data-id="${friendship.id}">Amis · retirer</button>`;
}

function messageActionHtml(conversation, theirProfile, outgoingRequest, isBlocked){
  if (isBlocked) return '';
  if (conversation) {
    return `<button class="btn btn-ghost" id="open-conversation-btn">${conversation.status === 'blocked' ? 'Voir la conversation (bloquée)' : 'Voir la conversation'}</button>`;
  }
  if (theirProfile.dm_open) {
    return `<button class="btn btn-ghost" id="start-dm-btn">Envoyer un message</button>`;
  }
  if (outgoingRequest?.status === 'pending') {
    return `<button class="btn btn-ghost" disabled>Demande de message envoyée</button>`;
  }
  return '';
}

export async function renderProfileDetail(container, myProfile, theirId, onBack){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [theirProfile, friendship, wall, incomingConnection, facePhotoUrl, conversation, outgoingRequest, blockedIds] = await Promise.all([
    fetchProfileById(theirId),
    fetchFriendshipStatus(myProfile.id, theirId),
    fetchWall(theirId),
    fetchIncomingConnectionRequest(myProfile.id, theirId),
    fetchFacePhotoUrl(theirId),
    fetchConversationBetween(myProfile.id, theirId),
    fetchOutgoingDmRequestStatus(myProfile.id, theirId),
    fetchBlockedIds(myProfile.id)
  ]);

  if (!theirProfile) { container.innerHTML = `<p class="empty-hint">Profil introuvable.</p>`; return; }

  const iBlockedThem = blockedIds.includes(theirId);
  // No direct message action, and no per-post "message privé" offer either,
  // once a conversation already exists or DMs are open — that top-level
  // action already covers it; the per-content request path exists
  // specifically for the "DM closed, no relationship yet" case.
  const canMessageDirectly = !!conversation || theirProfile.dm_open;

  const chips = theirProfile.interests.map(i => `<span class="chip">${escapeHtml(i.name)}</span>`).join('')
    || `<span class="empty-hint">Aucun centre d'intérêt renseigné.</span>`;

  const prompts = theirProfile.prompts.length
    ? theirProfile.prompts.map(p => `
        <div class="prompt-card">
          <p class="prompt-q">${escapeHtml(p.question)}</p>
          <p class="prompt-a">${escapeHtml(p.answer)}</p>
        </div>
      `).join('')
    : `<p class="empty-hint">Pas encore de réponse ajoutée.</p>`;

  const wallHtml = wall.length ? wall.map(p => `
    <div class="prompt-card">
      <p class="prompt-a">${escapeHtml(p.body)}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <p class="empty-hint" style="margin:0">${p.visibility === 'friends' ? 'Amis uniquement' : 'Public'} · ${new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
        <div style="display:flex;gap:8px">
          ${!canMessageDirectly && !iBlockedThem ? `<button class="btn-sm" data-action="dm-request" data-context-type="post" data-context-id="${p.id}">Message privé</button>` : ''}
          ${reportButtonHtml('post', p.id)}
        </div>
      </div>
    </div>
  `).join('') : `<p class="empty-hint">Rien sur ce mur pour l'instant.</p>`;

  container.innerHTML = `
    <button class="btn-sm" id="back-btn" style="margin-bottom:14px">← Retour</button>
    <div class="profile-hero">
      <div class="profile-photos">
        <div class="profile-photo-slot">
          <div class="profile-avatar-wrap">
            <div class="veil-ring r1"></div><div class="veil-ring r2"></div>
            <div class="profile-avatar ${escapeHtml(theirProfile.avatar_style)}"><div class="avatar-shape"></div></div>
          </div>
          <p class="profile-photo-label">Avatar</p>
        </div>
        <div class="profile-photo-slot">
          <div class="profile-avatar-wrap">
            <div class="veil-ring r1"></div><div class="veil-ring r2"></div>
            <div class="profile-avatar ${facePhotoUrl ? 'profile-face-circle' : 'profile-face-locked'}">
              ${facePhotoUrl
                ? `<img src="${facePhotoUrl}" alt="Visage de ${escapeHtml(theirProfile.display_name)}">`
                : `<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`}
            </div>
          </div>
          <p class="profile-photo-label">${facePhotoUrl ? 'Visage' : 'Visage caché'}</p>
        </div>
      </div>
      <p class="profile-name" style="margin-top:14px">${escapeHtml(theirProfile.display_name)}, ${computeAge(theirProfile.birth_date)} ans</p>
    </div>
    <div class="card-actions">${friendActionHtml(friendship, myProfile.id)}</div>
    ${incomingConnection ? `
      <div class="card-actions" style="margin-top:10px">
        <button class="btn btn-ghost" id="connection-decline" data-id="${incomingConnection.id}">Refuser le bonjour</button>
        <button class="btn btn-primary" id="connection-accept" data-id="${incomingConnection.id}">Accepter le bonjour</button>
      </div>
    ` : ''}
    <div class="card-actions" style="margin-top:10px">
      ${messageActionHtml(conversation, theirProfile, outgoingRequest, iBlockedThem)}
      <button type="button" class="btn btn-ghost" id="block-toggle-btn">${iBlockedThem ? 'Débloquer' : 'Bloquer'}</button>
    </div>
    <div class="chips" style="margin:16px 0">${chips}</div>
    <p class="section-label">Quelques mots</p>
    ${prompts}
    <p class="section-label">Mur</p>
    ${wallHtml}
  `;

  const rerender = () => renderProfileDetail(container, myProfile, theirId, onBack);

  attachReportHandlers(container, myProfile);

  document.getElementById('back-btn').addEventListener('click', onBack);
  document.getElementById('friend-action')?.addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      await sendFriendRequest(myProfile.id, theirId);
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      event.target.disabled = false;
    }
  });
  document.getElementById('friend-accept')?.addEventListener('click', async (event) => {
    await respondToFriendRequest(event.target.dataset.id, 'accepted');
    rerender();
  });
  document.getElementById('friend-decline')?.addEventListener('click', async (event) => {
    await respondToFriendRequest(event.target.dataset.id, 'declined');
    rerender();
  });
  document.getElementById('friend-remove')?.addEventListener('click', async (event) => {
    if (!confirm('Retirer cet ami ?')) return;
    await removeFriendship(event.target.dataset.id);
    rerender();
  });
  document.getElementById('connection-accept')?.addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      await respondToConnectionRequest(event.target.dataset.id, 'accepted');
      alert("C'est un match !");
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      event.target.disabled = false;
    }
  });
  document.getElementById('connection-decline')?.addEventListener('click', async (event) => {
    try {
      await respondToConnectionRequest(event.target.dataset.id, 'declined');
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  });

  document.getElementById('open-conversation-btn')?.addEventListener('click', () => {
    renderConversationThread(container, myProfile, { ...conversation, otherProfile: theirProfile }, rerender);
  });
  document.getElementById('start-dm-btn')?.addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      const conversationId = await startOpenDmConversation(theirId);
      renderConversationThread(container, myProfile, { id: conversationId, status: 'active', otherProfile: theirProfile }, rerender);
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      event.target.disabled = false;
    }
  });
  container.querySelectorAll('[data-action="dm-request"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Envoyer une demande de message à ${theirProfile.display_name} ?`)) return;
      btn.disabled = true;
      try {
        await sendDmAccessRequest(theirId, btn.dataset.contextType, btn.dataset.contextId);
        alert('Demande envoyée.');
        rerender();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
        btn.disabled = false;
      }
    });
  });
  document.getElementById('block-toggle-btn')?.addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      if (iBlockedThem) {
        await unblockProfile(theirId);
      } else {
        if (!confirm(`Bloquer ${theirProfile.display_name} ? Plus aucun nouveau message ne pourra être échangé tant que le blocage tient.`)) { event.target.disabled = false; return; }
        await blockProfile(theirId);
      }
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      event.target.disabled = false;
    }
  });
}
