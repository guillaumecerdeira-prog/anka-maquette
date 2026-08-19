import { setDmOpen } from './profile.js';
import { fetchWall, createPost, deletePost } from './posts.js';
import { fetchIncomingFriendRequests, respondToFriendRequest, fetchMyFriends } from './friends.js';
import { renderProfileDetail } from './profile-view.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderPostRow(post){
  return `
    <div class="prompt-card" data-post-id="${post.id}">
      <p class="prompt-a">${escapeHtml(post.body)}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <p class="empty-hint" style="margin:0">${post.visibility === 'friends' ? 'Amis uniquement' : 'Public'} · ${new Date(post.created_at).toLocaleDateString('fr-FR')}</p>
        <button class="btn-sm danger" data-action="delete-post" data-id="${post.id}">Supprimer</button>
      </div>
    </div>
  `;
}

export async function renderProfil(container, myProfile, { signOut }){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [wall, incomingFriends, friends] = await Promise.all([
    fetchWall(myProfile.id),
    fetchIncomingFriendRequests(myProfile.id),
    fetchMyFriends(myProfile.id)
  ]);

  const rerender = () => renderProfil(container, myProfile, { signOut });

  const chips = myProfile.interests.map(i => `<span class="chip">${escapeHtml(i.name)}</span>`).join('')
    || `<span class="empty-hint">Aucun centre d'intérêt renseigné.</span>`;

  const prompts = myProfile.prompts.length
    ? myProfile.prompts.map(p => `
        <div class="prompt-card">
          <p class="prompt-q">${escapeHtml(p.question)}</p>
          <p class="prompt-a">${escapeHtml(p.answer)}</p>
        </div>
      `).join('')
    : `<p class="empty-hint">Pas encore de réponse ajoutée.</p>`;

  const incomingHtml = incomingFriends.length ? `
    <p class="section-label">Demandes d'amitié</p>
    ${incomingFriends.map(f => `
      <div class="admin-row" data-friend-request-id="${f.id}">
        <div class="admin-row-main"><p class="admin-row-title">${escapeHtml(f.profiles.display_name)}</p></div>
        <div class="admin-row-actions">
          <button class="btn-sm" data-action="decline-friend" data-id="${f.id}">Refuser</button>
          <button class="btn-sm positive" data-action="accept-friend" data-id="${f.id}">Accepter</button>
        </div>
      </div>
    `).join('')}
  ` : '';

  const friendsHtml = friends.length ? `
    <p class="section-label">Amis</p>
    <div class="chips" style="margin-bottom:14px">
      ${friends.map(f => `<span class="chip" data-action="view-friend" data-id="${f.id}" style="cursor:pointer">${escapeHtml(f.display_name)}</span>`).join('')}
    </div>
  ` : '';

  const wallHtml = wall.length ? wall.map(renderPostRow).join('') : `<p class="empty-hint">Rien sur ton mur pour l'instant.</p>`;

  container.innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar-wrap">
        <div class="veil-ring r1"></div>
        <div class="veil-ring r2"></div>
        <div class="profile-avatar ${escapeHtml(myProfile.avatar_style)}"><div class="avatar-shape"></div></div>
      </div>
      <p class="profile-name">${escapeHtml(myProfile.display_name)}</p>
      <p class="profile-caption">Ton avatar est visible par tous. Ton visage reste à toi de le révéler.</p>
    </div>

    <div class="setting-row">
      <div>
        <p class="setting-label">Visage débloqué</p>
        <p class="setting-sub">Pour ${myProfile.faceRevealCount} personne${myProfile.faceRevealCount === 1 ? '' : 's'}</p>
      </div>
      <span class="chip">Gérer</span>
    </div>

    <div class="setting-row">
      <div>
        <p class="setting-label">Messages privés</p>
        <p class="setting-sub" id="dm-status">${myProfile.dm_open ? 'Ouverts à tous' : 'Fermés'}</p>
      </div>
      <div class="toggle ${myProfile.dm_open ? '' : 'off'}" id="dm-toggle"></div>
    </div>

    ${incomingHtml}
    ${friendsHtml}

    <p class="section-label">Quelques mots</p>
    ${prompts}

    <div class="chips" style="margin-top:14px">${chips}</div>

    <div class="trust-note">
      <p>Débloquer ton visage est un signe de confiance. Tu peux le retirer à tout moment.</p>
    </div>

    <p class="section-label">Ton mur</p>
    <form id="post-form" style="margin-bottom:16px">
      <textarea name="body" placeholder="Partage quelque chose…" required maxlength="500" style="width:100%;min-height:64px;font-family:var(--font-body);font-size:13px;padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--line);background:var(--surface-alt);color:var(--ink);resize:vertical;margin-bottom:8px"></textarea>
      <div style="display:flex;gap:8px">
        <select name="visibility" style="flex:1;font-family:var(--font-body);font-size:12.5px;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--line);background:var(--surface-alt);color:var(--ink)">
          <option value="public">Public</option>
          <option value="friends">Amis uniquement</option>
        </select>
        <button type="submit" class="btn btn-primary" style="flex:1">Publier</button>
      </div>
    </form>
    <div id="wall-list">${wallHtml}</div>

    <div class="setting-row" style="margin-top:20px">
      <div>
        <p class="setting-label">Déconnexion</p>
        <p class="setting-sub">Quitter ce compte sur cet appareil</p>
      </div>
      <button class="chip" id="logout-btn" style="cursor:pointer;background:none">Quitter</button>
    </div>
  `;

  document.getElementById('logout-btn')?.addEventListener('click', () => signOut?.());

  const dmToggle = document.getElementById('dm-toggle');
  dmToggle?.addEventListener('click', async () => {
    const next = !myProfile.dm_open;
    myProfile.dm_open = next;
    dmToggle.classList.toggle('off', !next);
    document.getElementById('dm-status').textContent = next ? 'Ouverts à tous' : 'Fermés';
    try {
      await setDmOpen(myProfile.id, next);
    } catch (err) {
      myProfile.dm_open = !next;
      dmToggle.classList.toggle('off', next);
      document.getElementById('dm-status').textContent = !next ? 'Ouverts à tous' : 'Fermés';
      console.error('Impossible de mettre à jour les messages privés', err);
    }
  });

  document.getElementById('post-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const body = fd.get('body').trim();
    if (!body) return;
    try {
      await createPost(myProfile.id, body, fd.get('visibility'));
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  });

  container.querySelectorAll('[data-action="delete-post"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce post ?')) return;
      try {
        await deletePost(btn.dataset.id);
        rerender();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
      }
    });
  });

  container.querySelectorAll('[data-action="accept-friend"]').forEach(btn => {
    btn.addEventListener('click', async () => { await respondToFriendRequest(btn.dataset.id, 'accepted'); rerender(); });
  });
  container.querySelectorAll('[data-action="decline-friend"]').forEach(btn => {
    btn.addEventListener('click', async () => { await respondToFriendRequest(btn.dataset.id, 'declined'); rerender(); });
  });
  container.querySelectorAll('[data-action="view-friend"]').forEach(chip => {
    chip.addEventListener('click', () => renderProfileDetail(container, myProfile, chip.dataset.id, rerender));
  });
}
