import { setDmOpen, updatePromptAnswer, deletePrompt, updateProfileInterests, fetchInterestsCatalog, updateAvatarStyle } from './profile.js';
import { fetchWall, createPost, deletePost } from './posts.js';
import { fetchIncomingFriendRequests, respondToFriendRequest, fetchMyFriends } from './friends.js';
import { renderProfileDetail } from './profile-view.js';
import { fetchFacePhotoUrl, uploadFacePhoto } from './face-photo.js';

const AVATAR_STYLES = ['av-a', 'av-b', 'av-c', 'av-d'];
const MAX_FACE_PHOTO_BYTES = 5 * 1024 * 1024;

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

  const [wall, incomingFriends, friends, interestsCatalog, facePhotoUrl] = await Promise.all([
    fetchWall(myProfile.id),
    fetchIncomingFriendRequests(myProfile.id),
    fetchMyFriends(myProfile.id),
    fetchInterestsCatalog(),
    fetchFacePhotoUrl(myProfile.id)
  ]);

  const rerender = () => renderProfil(container, myProfile, { signOut });

  const chips = myProfile.interests.map(i => `<span class="chip">${escapeHtml(i.name)}</span>`).join('')
    || `<span class="empty-hint">Aucun centre d'intérêt renseigné.</span>`;

  const myInterestIds = new Set(myProfile.interests.map(i => i.id));
  const interestsPickerHtml = interestsCatalog.map(i => `
    <button type="button" class="interest-option${myInterestIds.has(i.id) ? ' selected' : ''}" data-id="${i.id}">${escapeHtml(i.name)}</button>
  `).join('');

  const prompts = myProfile.prompts.length
    ? myProfile.prompts.map(p => `
        <div class="prompt-card" data-prompt-id="${p.id}">
          <p class="prompt-q">${escapeHtml(p.question)}</p>
          <p class="prompt-a" data-role="prompt-answer">${escapeHtml(p.answer)}</p>
          <div class="prompt-edit-form" hidden>
            <textarea maxlength="240" style="width:100%;min-height:60px;font-family:var(--font-body);font-size:13px;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--line);background:var(--surface-alt);color:var(--ink);resize:vertical;margin:8px 0">${escapeHtml(p.answer)}</textarea>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn-sm" data-action="save-prompt">Enregistrer</button>
              <button type="button" class="btn-sm" data-action="cancel-prompt">Annuler</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button type="button" class="btn-sm" data-action="edit-prompt">Modifier</button>
            <button type="button" class="btn-sm danger" data-action="delete-prompt">Supprimer</button>
          </div>
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

  const editIconSvg = `<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const avatarPickerHtml = AVATAR_STYLES.map(style => `
    <button type="button" class="avatar-option ${style}${style === myProfile.avatar_style ? ' active' : ''}" data-style="${style}"><div class="avatar-shape"></div></button>
  `).join('');

  container.innerHTML = `
    <div class="profile-hero">
      <div class="profile-photos">
        <div class="profile-photo-slot">
          <div class="profile-avatar-wrap">
            <div class="veil-ring r1"></div>
            <div class="veil-ring r2"></div>
            <div class="profile-avatar ${escapeHtml(myProfile.avatar_style)}" id="avatar-circle"><div class="avatar-shape"></div></div>
            <button type="button" class="profile-photo-edit-btn" id="edit-avatar-btn" title="Modifier l'avatar">${editIconSvg}</button>
          </div>
          <p class="profile-photo-label">Avatar</p>
        </div>
        <div class="profile-photo-slot">
          <div class="profile-avatar-wrap">
            <div class="veil-ring r1"></div>
            <div class="veil-ring r2"></div>
            <div class="profile-avatar profile-face-circle" id="face-circle">${facePhotoUrl ? `<img src="${facePhotoUrl}" alt="Ta photo de visage">` : `<div class="avatar-shape"></div>`}</div>
            <button type="button" class="profile-photo-edit-btn" id="edit-face-btn" title="Modifier ta photo de visage">${editIconSvg}</button>
          </div>
          <p class="profile-photo-label">Visage</p>
        </div>
      </div>
      <input type="file" id="face-photo-input" accept="image/*" hidden>
      <div class="avatar-picker" id="avatar-edit-picker" hidden style="margin-top:14px">${avatarPickerHtml}</div>
      <p class="profile-name" style="margin-top:14px">${escapeHtml(myProfile.display_name)}</p>
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

    <p class="section-label" style="margin-top:14px">Centres d'intérêt</p>
    <div class="chips" id="interests-chips">${chips}</div>
    <div class="interest-picker" id="interests-picker" hidden style="margin-top:6px">${interestsPickerHtml}</div>
    <div style="margin-top:8px">
      <button type="button" class="btn-sm" id="edit-interests-btn">Modifier</button>
      <button type="button" class="btn-sm" id="save-interests-btn" hidden>Enregistrer</button>
      <button type="button" class="btn-sm" id="cancel-interests-btn" hidden>Annuler</button>
    </div>

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

  const avatarPicker = document.getElementById('avatar-edit-picker');
  document.getElementById('edit-avatar-btn').addEventListener('click', () => {
    avatarPicker.hidden = !avatarPicker.hidden;
  });
  avatarPicker.addEventListener('click', async (event) => {
    const btn = event.target.closest('.avatar-option');
    if (!btn) return;
    const style = btn.dataset.style;
    avatarPicker.hidden = true;
    if (style === myProfile.avatar_style) return;
    try {
      await updateAvatarStyle(myProfile.id, style);
      myProfile.avatar_style = style;
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  });

  const facePhotoInput = document.getElementById('face-photo-input');
  const editFaceBtn = document.getElementById('edit-face-btn');
  editFaceBtn.addEventListener('click', () => facePhotoInput.click());
  facePhotoInput.addEventListener('change', async () => {
    const file = facePhotoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Merci de choisir une image.'); facePhotoInput.value = ''; return; }
    if (file.size > MAX_FACE_PHOTO_BYTES) { alert('Image trop lourde (5 Mo maximum).'); facePhotoInput.value = ''; return; }
    editFaceBtn.disabled = true;
    try {
      await uploadFacePhoto(myProfile.id, file);
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      editFaceBtn.disabled = false;
    }
  });

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

  container.querySelectorAll('[data-action="edit-prompt"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.prompt-card');
      card.querySelector('[data-role="prompt-answer"]').hidden = true;
      card.querySelector('.prompt-edit-form').hidden = false;
      btn.hidden = true;
    });
  });

  container.querySelectorAll('[data-action="cancel-prompt"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.prompt-card');
      card.querySelector('.prompt-edit-form').hidden = true;
      card.querySelector('[data-role="prompt-answer"]').hidden = false;
      card.querySelector('[data-action="edit-prompt"]').hidden = false;
    });
  });

  container.querySelectorAll('[data-action="save-prompt"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.prompt-card');
      const promptId = card.dataset.promptId;
      const textarea = card.querySelector('textarea');
      const answer = textarea.value.trim();
      if (!answer) { alert('La réponse ne peut pas être vide.'); return; }
      btn.disabled = true;
      try {
        await updatePromptAnswer(promptId, answer);
        const prompt = myProfile.prompts.find(p => p.id === promptId);
        if (prompt) prompt.answer = answer;
        rerender();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('[data-action="delete-prompt"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce prompt ?')) return;
      const card = btn.closest('.prompt-card');
      const promptId = card.dataset.promptId;
      btn.disabled = true;
      try {
        await deletePrompt(promptId);
        myProfile.prompts = myProfile.prompts.filter(p => p.id !== promptId);
        rerender();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  const interestsChips = document.getElementById('interests-chips');
  const interestsPicker = document.getElementById('interests-picker');
  const editInterestsBtn = document.getElementById('edit-interests-btn');
  const saveInterestsBtn = document.getElementById('save-interests-btn');
  const cancelInterestsBtn = document.getElementById('cancel-interests-btn');

  editInterestsBtn.addEventListener('click', () => {
    interestsChips.hidden = true;
    interestsPicker.hidden = false;
    editInterestsBtn.hidden = true;
    saveInterestsBtn.hidden = false;
    cancelInterestsBtn.hidden = false;
  });

  cancelInterestsBtn.addEventListener('click', () => {
    interestsPicker.querySelectorAll('.interest-option').forEach(btn => {
      btn.classList.toggle('selected', myInterestIds.has(btn.dataset.id));
    });
    interestsChips.hidden = false;
    interestsPicker.hidden = true;
    editInterestsBtn.hidden = false;
    saveInterestsBtn.hidden = true;
    cancelInterestsBtn.hidden = true;
  });

  interestsPicker.addEventListener('click', (event) => {
    const btn = event.target.closest('.interest-option');
    if (!btn) return;
    btn.classList.toggle('selected');
  });

  saveInterestsBtn.addEventListener('click', async () => {
    const selectedIds = Array.from(interestsPicker.querySelectorAll('.interest-option.selected')).map(btn => btn.dataset.id);
    saveInterestsBtn.disabled = true;
    try {
      await updateProfileInterests(myProfile.id, selectedIds);
      myProfile.interests = interestsCatalog.filter(i => selectedIds.includes(i.id));
      rerender();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    } finally {
      saveInterestsBtn.disabled = false;
    }
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
