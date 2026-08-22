import { fetchMyFriends } from './friends.js';
import { fetchRevealedTo, revealFaceTo, unrevealFaceFrom } from './face-reveals.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function renderFaceRevealPage(container, myProfile, onBack){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [friends, revealedTo] = await Promise.all([
    fetchMyFriends(myProfile.id),
    fetchRevealedTo(myProfile.id)
  ]);

  const originalRevealed = new Set(revealedTo);
  const pendingRevealed = new Set(revealedTo);

  function isDirty(){
    if (pendingRevealed.size !== originalRevealed.size) return true;
    for (const id of pendingRevealed) if (!originalRevealed.has(id)) return true;
    return false;
  }

  const listHtml = friends.length ? friends.map(f => `
    <div class="setting-row">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="avatar ${escapeHtml(f.avatar_style)}" style="width:32px;height:32px"><div class="avatar-shape"></div></div>
        <p class="setting-label" style="margin:0">${escapeHtml(f.display_name)}</p>
      </div>
      <div class="toggle ${pendingRevealed.has(f.id) ? '' : 'off'}" data-action="toggle-reveal" data-id="${f.id}"></div>
    </div>
  `).join('') : `<p class="empty-hint">Ajoute des amis pour pouvoir leur révéler ton visage.</p>`;

  container.innerHTML = `
    <button class="btn-sm" id="back-btn" style="margin-bottom:14px">← Retour</button>
    <p class="section-label">Visage débloqué</p>
    <div class="trust-note">
      <p>Débloquer ton visage est un signe de confiance. Tu peux le retirer à tout moment.</p>
    </div>
    <div id="reveal-list" style="margin-top:14px">${listHtml}</div>

    <div class="unsaved-banner hidden" id="unsaved-banner">
      <p>Enregistrer les modifications ?</p>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn-sm" id="unsaved-no">Non</button>
        <button type="button" class="btn-sm primary" id="unsaved-yes">Oui</button>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-action="toggle-reveal"]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const id = toggle.dataset.id;
      if (pendingRevealed.has(id)) pendingRevealed.delete(id); else pendingRevealed.add(id);
      toggle.classList.toggle('off', !pendingRevealed.has(id));
    });
  });

  async function commitChanges(){
    const toAdd = Array.from(pendingRevealed).filter(id => !originalRevealed.has(id));
    const toRemove = Array.from(originalRevealed).filter(id => !pendingRevealed.has(id));
    await Promise.all([
      ...toAdd.map(id => revealFaceTo(myProfile.id, id)),
      ...toRemove.map(id => unrevealFaceFrom(myProfile.id, id))
    ]);
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    if (!isDirty()) { onBack(); return; }
    document.getElementById('unsaved-banner').classList.remove('hidden');
  });

  document.getElementById('unsaved-yes').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      await commitChanges();
      myProfile.faceRevealCount = pendingRevealed.size;
      onBack();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      event.target.disabled = false;
    }
  });

  document.getElementById('unsaved-no').addEventListener('click', () => {
    onBack();
  });
}
