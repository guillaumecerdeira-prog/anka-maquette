import { supabase } from './supabase-client.js';
import { renderProfileDetail } from './profile-view.js';
import { respondToConnectionRequest } from './connections.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function computeAge(birthDate){
  const dob = new Date(birthDate);
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function statusLabel(profile){
  const daysSinceCreation = (Date.now() - new Date(profile.created_at).getTime()) / (24 * 3600 * 1000);
  if (daysSinceCreation <= 7) return 'Nouveau sur Anka';
  const hoursSinceSeen = (Date.now() - new Date(profile.last_seen_at).getTime()) / (3600 * 1000);
  if (hoursSinceSeen <= 48) return 'Active récemment';
  return '';
}

const QUOTA_ERROR = 'daily_connection_quota_exceeded';

export async function renderAccueil(container, myProfile){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [quotaResult, incomingResult, sentResult, passedResult, myInterestsResult] = await Promise.all([
    supabase.rpc('get_daily_connection_quota').single(),
    supabase.from('connection_requests').select('id, from_profile_id, created_at, profiles!connection_requests_from_profile_id_fkey(display_name, avatar_style)').eq('to_profile_id', myProfile.id).eq('status', 'pending'),
    supabase.from('connection_requests').select('from_profile_id, to_profile_id').or(`from_profile_id.eq.${myProfile.id},to_profile_id.eq.${myProfile.id}`),
    supabase.from('profile_passes').select('passed_profile_id').eq('profile_id', myProfile.id),
    supabase.from('profile_interests').select('interest_id').eq('profile_id', myProfile.id)
  ]);

  const excludedIds = new Set([myProfile.id]);
  (sentResult.data || []).forEach(r => { excludedIds.add(r.from_profile_id); excludedIds.add(r.to_profile_id); });
  (passedResult.data || []).forEach(r => excludedIds.add(r.passed_profile_id));
  const myInterestIds = new Set((myInterestsResult.data || []).map(r => r.interest_id));

  let suggestionsQuery = supabase
    .from('profiles')
    .select(`
      id, display_name, birth_date, avatar_style, created_at, last_seen_at, is_banned, suspended_until,
      profile_interests ( interests ( id, name ) )
    `)
    .neq('id', myProfile.id)
    .eq('is_banned', false)
    .limit(15);
  if (excludedIds.size) {
    suggestionsQuery = suggestionsQuery.not('id', 'in', `(${Array.from(excludedIds).join(',')})`);
  }
  const { data: candidates, error: suggestionsError } = await suggestionsQuery;

  const now = new Date();
  const suggestions = (candidates || [])
    .filter(p => !p.suspended_until || new Date(p.suspended_until) <= now)
    .slice(0, 10);

  const quota = quotaResult.data;
  const incoming = incomingResult.data || [];

  const quotaHtml = quota
    ? (quota.is_unlimited
        ? `<div class="quota"><div class="quota-text"><b>Illimité</b>mises en relation possibles</div></div>`
        : `<div class="quota">
             <div class="quota-text"><b>${quota.remaining} mise${quota.remaining === 1 ? '' : 's'} en relation</b>possibles aujourd'hui</div>
             <div class="quota-dots">${Array.from({ length: quota.quota_limit }).map((_, i) => `<span class="${i < quota.used ? 'filled' : ''}"></span>`).join('')}</div>
           </div>`)
    : '';

  const incomingHtml = incoming.length ? `
    <p class="section-label">On t'a dit bonjour</p>
    ${incoming.map(r => `
      <div class="admin-row" data-incoming-id="${r.id}">
        <div class="admin-row-main" data-action="view-profile" data-id="${r.from_profile_id}" style="cursor:pointer;display:flex;align-items:center;gap:10px">
          <div class="avatar ${escapeHtml(r.profiles.avatar_style)}" style="width:40px;height:40px;flex-shrink:0"><div class="avatar-shape"></div></div>
          <p class="admin-row-title" style="margin:0">${escapeHtml(r.profiles.display_name)}</p>
        </div>
        <div class="admin-row-actions">
          <button class="btn-sm" data-action="decline-request" data-id="${r.id}">Refuser</button>
          <button class="btn-sm positive" data-action="accept-request" data-id="${r.id}">Accepter</button>
        </div>
      </div>
    `).join('')}
  ` : '';

  const cardsHtml = suggestions.length ? suggestions.map(p => {
    const interests = p.profile_interests.map(pi => pi.interests);
    const sharedCount = interests.filter(i => myInterestIds.has(i.id)).length;
    const status = statusLabel(p);
    return `
      <div class="card" data-suggestion-id="${p.id}">
        <div class="card-top" data-action="view-profile" data-id="${p.id}" style="cursor:pointer">
          <div class="avatar ${escapeHtml(p.avatar_style)}"><div class="avatar-shape"></div></div>
          <div>
            <p class="card-name">${escapeHtml(p.display_name)}, ${computeAge(p.birth_date)} ans</p>
            ${status ? `<p class="card-sub">${status}</p>` : ''}
          </div>
        </div>
        <div class="chips">${interests.map(i => `<span class="chip">${escapeHtml(i.name)}</span>`).join('') || '<span class="empty-hint">Aucun centre d\'intérêt renseigné.</span>'}</div>
        ${sharedCount >= 2 ? `<p class="whisper">On pense que vous pourriez bien vous entendre.</p>` : ''}
        <div class="card-actions">
          <button class="btn btn-primary" data-action="say-hello" data-id="${p.id}">Dire bonjour</button>
          <button class="btn btn-ghost" data-action="pass" data-id="${p.id}">Passer</button>
        </div>
      </div>
    `;
  }).join('') : `<p class="empty-hint">Plus personne à te proposer pour l'instant — reviens plus tard.</p>`;

  container.innerHTML = `
    ${quotaHtml}
    ${incomingHtml}
    <p class="section-label">Suggestions</p>
    ${suggestionsError ? `<p class="empty-hint">Erreur : ${escapeHtml(suggestionsError.message)}</p>` : cardsHtml}
  `;

  container.querySelectorAll('[data-action="view-profile"]').forEach(el => {
    el.addEventListener('click', () => renderProfileDetail(container, myProfile, el.dataset.id, () => renderAccueil(container, myProfile)));
  });
  container.querySelectorAll('[data-action="accept-request"]').forEach(btn => {
    btn.addEventListener('click', () => respondToRequest(btn.dataset.id, 'accepted', container, myProfile));
  });
  container.querySelectorAll('[data-action="decline-request"]').forEach(btn => {
    btn.addEventListener('click', () => respondToRequest(btn.dataset.id, 'declined', container, myProfile));
  });
  container.querySelectorAll('[data-action="say-hello"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await supabase.from('connection_requests').insert({ from_profile_id: myProfile.id, to_profile_id: btn.dataset.id });
      if (error) {
        alert(error.message.includes(QUOTA_ERROR)
          ? "Tu as atteint ta limite quotidienne de mises en relation gratuites. Reviens demain, ou passe en Premium pour continuer."
          : `Erreur : ${error.message}`);
        btn.disabled = false;
        return;
      }
      renderAccueil(container, myProfile);
    });
  });
  container.querySelectorAll('[data-action="pass"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.card');
      const { error } = await supabase.from('profile_passes').insert({ profile_id: myProfile.id, passed_profile_id: btn.dataset.id });
      if (error) { alert(`Erreur : ${error.message}`); return; }
      card?.remove();
    });
  });
}

async function respondToRequest(requestId, status, container, myProfile){
  try {
    await respondToConnectionRequest(requestId, status);
  } catch (err) {
    alert(`Erreur : ${err.message}`);
    return;
  }
  if (status === 'accepted') alert("C'est un match !");
  renderAccueil(container, myProfile);
}
