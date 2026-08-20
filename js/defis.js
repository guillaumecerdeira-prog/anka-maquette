import { supabase } from './supabase-client.js';
import { reportButtonHtml, attachReportHandlers } from './reports.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function renderDefis(container, myProfile){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const { data: allChallenges, error: challengesError } = await supabase
    .from('challenges')
    .select('id, title, week_start, interests(name)')
    .lte('week_start', new Date().toISOString().slice(0, 10))
    .order('week_start', { ascending: false });

  if (challengesError) { container.innerHTML = `<p class="empty-hint">Erreur : ${escapeHtml(challengesError.message)}</p>`; return; }

  if (!allChallenges || !allChallenges.length) {
    container.innerHTML = `<p class="empty-hint">Aucun défi disponible pour l'instant — reviens plus tard.</p>`;
    return;
  }

  const currentWeek = allChallenges[0].week_start;
  const currentChallenges = allChallenges.filter(c => c.week_start === currentWeek);

  const { data: responses, error: responsesError } = await supabase
    .from('challenge_responses')
    .select('id, challenge_id, text, created_at, profile_id, profiles(display_name, avatar_style)')
    .in('challenge_id', currentChallenges.map(c => c.id))
    .order('created_at', { ascending: false });

  const responsesByChallenge = new Map();
  (responses || []).forEach(r => {
    if (!responsesByChallenge.has(r.challenge_id)) responsesByChallenge.set(r.challenge_id, []);
    responsesByChallenge.get(r.challenge_id).push(r);
  });

  container.innerHTML = currentChallenges.map(c => {
    const list = responsesByChallenge.get(c.id) || [];
    const rows = list.length ? list.map(r => `
      <div class="response-row">
        <div class="avatar ${escapeHtml(r.profiles?.avatar_style || 'av-a')}" style="width:36px;height:36px;flex-shrink:0"><div class="avatar-shape"></div></div>
        <div style="flex:1;min-width:0">
          <p class="response-name">${escapeHtml(r.profiles?.display_name || '—')}</p>
          <p class="response-text">${escapeHtml(r.text || '')}</p>
        </div>
        ${r.profile_id !== myProfile.id ? reportButtonHtml('challenge_response', r.id) : ''}
      </div>
    `).join('') : `<p class="empty-hint">Aucune réponse pour l'instant.</p>`;

    return `
      <div class="defi-card">
        <p class="defi-eyebrow">${escapeHtml(c.interests?.name || '—')} · cette semaine</p>
        <h2>${escapeHtml(c.title)}</h2>
        <div class="defi-photo">+ ajouter une photo (bientôt)</div>
        <form class="defi-response-form" data-challenge-id="${c.id}">
          <textarea name="text" placeholder="Ta réponse…" maxlength="500" required style="width:100%;min-height:60px;font-family:var(--font-body);font-size:13px;padding:10px 12px;border-radius:var(--radius-sm);border:none;background:rgba(251,250,246,0.12);color:var(--surface);resize:vertical;margin-bottom:10px"></textarea>
          <button type="submit" class="btn btn-light">Partager ta réponse</button>
        </form>
      </div>

      <p class="section-label">Réponses de la communauté</p>
      <div class="admin-list" style="margin-bottom:22px">${rows}</div>
    `;
  }).join('');

  attachReportHandlers(container, myProfile);

  container.querySelectorAll('.defi-response-form').forEach(form => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const text = fd.get('text').trim();
      if (!text) return;
      const { error } = await supabase.from('challenge_responses').insert({
        challenge_id: form.dataset.challengeId,
        profile_id: myProfile.id,
        text
      });
      if (error) {
        alert(error.code === '23505' ? 'Tu as déjà répondu à ce défi.' : `Erreur : ${error.message}`);
        return;
      }
      renderDefis(container, myProfile);
    });
  });
}
