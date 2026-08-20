import { fetchProfileById } from './profile.js';
import { fetchWall } from './posts.js';
import { fetchFriendshipStatus, sendFriendRequest, respondToFriendRequest, removeFriendship } from './friends.js';
import { reportButtonHtml, attachReportHandlers } from './reports.js';

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

export async function renderProfileDetail(container, myProfile, theirId, onBack){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [theirProfile, friendship, wall] = await Promise.all([
    fetchProfileById(theirId),
    fetchFriendshipStatus(myProfile.id, theirId),
    fetchWall(theirId)
  ]);

  if (!theirProfile) { container.innerHTML = `<p class="empty-hint">Profil introuvable.</p>`; return; }

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
        ${reportButtonHtml('post', p.id)}
      </div>
    </div>
  `).join('') : `<p class="empty-hint">Rien sur ce mur pour l'instant.</p>`;

  container.innerHTML = `
    <button class="btn-sm" id="back-btn" style="margin-bottom:14px">← Retour</button>
    <div class="profile-hero">
      <div class="profile-avatar-wrap">
        <div class="veil-ring r1"></div><div class="veil-ring r2"></div>
        <div class="profile-avatar ${escapeHtml(theirProfile.avatar_style)}"><div class="avatar-shape"></div></div>
      </div>
      <p class="profile-name">${escapeHtml(theirProfile.display_name)}, ${computeAge(theirProfile.birth_date)} ans</p>
    </div>
    <div class="card-actions">${friendActionHtml(friendship, myProfile.id)}</div>
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
}
