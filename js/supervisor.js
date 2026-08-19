import { supabase } from './supabase-client.js';

let currentUserId = null;
let contentEl = null;
let activeTab = 'overview';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(iso){
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function sanctionProfile(profileId, defaultLabel){
  const type = prompt(`Action sur ce profil (${defaultLabel}) — tape "suspension", "ban" ou "reinstatement" :`, 'suspension');
  if (!type || !['suspension', 'ban', 'reinstatement'].includes(type)) return false;

  const reason = prompt('Raison (obligatoire) :', '');
  if (!reason || !reason.trim()) { alert('Une raison est requise.'); return false; }

  let endsAt = null;
  if (type === 'suspension') {
    const days = prompt('Suspension de combien de jours ?', '7');
    const n = parseInt(days, 10);
    if (!n || n <= 0) { alert('Durée invalide.'); return false; }
    endsAt = new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
  }

  const { error } = await supabase.from('profile_sanctions').insert({
    profile_id: profileId,
    type,
    reason: reason.trim(),
    issued_by: currentUserId,
    ends_at: endsAt
  });

  if (error) { alert(`Erreur : ${error.message}`); return false; }
  return true;
}

// ---------------------------------------------------------------- overview

async function renderOverview(){
  contentEl.innerHTML = `<p class="empty-hint">Chargement…</p>`;
  const { data, error } = await supabase.rpc('get_supervisor_overview');
  if (error) { contentEl.innerHTML = `<p class="empty-hint">Erreur : ${escapeHtml(error.message)}</p>`; return; }

  const interestRows = (data.interest_distribution || []).map(row => `
    <div class="admin-row">
      <div class="admin-row-main"><p class="admin-row-title">${escapeHtml(row.interest)}</p></div>
      <span class="badge">${row.count}</span>
    </div>
  `).join('') || `<p class="empty-hint">Aucune donnée pour l'instant.</p>`;

  const challengeRows = (data.challenge_response_activity || []).map(row => `
    <div class="admin-row">
      <div class="admin-row-main"><p class="admin-row-title">Défi ${escapeHtml(row.challenge_id.slice(0, 8))}…</p></div>
      <span class="badge">${row.responses} réponse${row.responses === 1 ? '' : 's'}</span>
    </div>
  `).join('') || `<p class="empty-hint">Aucune réponse de défi pour l'instant.</p>`;

  contentEl.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><span class="stat-value">${data.total_profiles}</span><span class="stat-label">Profils totaux</span></div>
      <div class="stat-card"><span class="stat-value">${data.new_profiles_7d}</span><span class="stat-label">Nouveaux (7j)</span></div>
      <div class="stat-card"><span class="stat-value">${data.active_profiles_48h}</span><span class="stat-label">Actifs (48h)</span></div>
      <div class="stat-card"><span class="stat-value">${data.quota_usage_today.free_profiles_at_limit} / ${data.quota_usage_today.total_free_profiles}</span><span class="stat-label">Quota gratuit atteint</span></div>
      <div class="stat-card"><span class="stat-value">${data.reports_pending}</span><span class="stat-label">Signalements en attente</span></div>
      <div class="stat-card"><span class="stat-value">${data.moderation_queue_pending}</span><span class="stat-label">Flags IA en attente</span></div>
    </div>

    <p class="admin-section-title">Répartition par centre d'intérêt</p>
    <div class="admin-list">${interestRows}</div>

    <p class="admin-section-title">Activité par défi</p>
    <div class="admin-list">${challengeRows}</div>
  `;
}

// ---------------------------------------------------------------- content

const KEYWORD_CATEGORY_LABELS = {
  hate_speech: 'Racisme / haine',
  sexual_content: 'Contenu sexuel',
  harassment: 'Harcèlement',
  other: 'Autre'
};

async function renderContent(){
  contentEl.innerHTML = `<p class="empty-hint">Chargement…</p>`;
  const [{ data: interests, error: interestsError }, { data: challenges, error: challengesError }, { data: keywords, error: keywordsError }] = await Promise.all([
    supabase.from('interests').select('*').order('name'),
    supabase.from('challenges').select('*, interests(name)').order('week_start', { ascending: false }),
    supabase.from('moderation_keywords').select('*').order('category').order('keyword')
  ]);

  if (interestsError) { contentEl.innerHTML = `<p class="empty-hint">Erreur : ${escapeHtml(interestsError.message)}</p>`; return; }

  const interestRows = (interests || []).map(i => `
    <div class="admin-row" data-interest-id="${i.id}">
      <div class="admin-row-main" style="display:flex;align-items:center;gap:10px">
        <span class="swatch" style="background:linear-gradient(135deg,${escapeHtml(i.color_from)},${escapeHtml(i.color_to)})"></span>
        <p class="admin-row-title">${escapeHtml(i.name)}</p>
      </div>
      <div class="admin-row-actions"><button class="btn-sm danger" data-action="delete-interest" data-id="${i.id}">Supprimer</button></div>
    </div>
  `).join('') || `<p class="empty-hint">Aucun centre d'intérêt.</p>`;

  const interestOptions = (interests || []).map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');

  const challengeRows = (challenges || []).map(c => `
    <div class="admin-row" data-challenge-id="${c.id}">
      <div class="admin-row-main">
        <p class="admin-row-title">${escapeHtml(c.title)}</p>
        <p class="admin-row-sub">${escapeHtml(c.interests?.name || '—')} · semaine du ${c.week_start}</p>
      </div>
      <div class="admin-row-actions"><button class="btn-sm danger" data-action="delete-challenge" data-id="${c.id}">Supprimer</button></div>
    </div>
  `).join('') || (challengesError ? `<p class="empty-hint">Erreur : ${escapeHtml(challengesError.message)}</p>` : `<p class="empty-hint">Aucun défi.</p>`);

  const keywordOptions = Object.entries(KEYWORD_CATEGORY_LABELS).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');

  const keywordRows = (keywords || []).map(k => `
    <div class="admin-row" data-keyword-id="${k.id}">
      <div class="admin-row-main">
        <p class="admin-row-title">${escapeHtml(k.keyword)}</p>
        <p class="admin-row-sub">${escapeHtml(KEYWORD_CATEGORY_LABELS[k.category] || k.category)}</p>
      </div>
      <div class="admin-row-actions"><button class="btn-sm danger" data-action="delete-keyword" data-id="${k.id}">Supprimer</button></div>
    </div>
  `).join('') || (keywordsError ? `<p class="empty-hint">Erreur : ${escapeHtml(keywordsError.message)}</p>` : `<p class="empty-hint">Aucun mot-clé pour l'instant — la file de modération automatique restera vide tant que la liste est vide.</p>`);

  contentEl.innerHTML = `
    <p class="admin-section-title">Centres d'intérêt / catégories</p>
    <form class="admin-form-row" id="add-interest-form">
      <input type="text" name="name" placeholder="Nom" required maxlength="40">
      <input type="color" name="color_from" value="#cddccf" title="Couleur 1">
      <input type="color" name="color_to" value="#6e8c7c" title="Couleur 2">
      <button type="submit" class="btn-sm primary">Ajouter</button>
    </form>
    <div class="admin-list">${interestRows}</div>

    <p class="admin-section-title">Défis hebdomadaires</p>
    <form class="admin-form-row" id="add-challenge-form">
      <select name="interest_id" required>${interestOptions}</select>
      <input type="text" name="title" placeholder="Intitulé du défi" required maxlength="120" style="flex:1;min-width:180px">
      <input type="date" name="week_start" required>
      <button type="submit" class="btn-sm primary">Ajouter</button>
    </form>
    <div class="admin-list">${challengeRows}</div>

    <p class="admin-section-title">Filtre par mots-clés (réponses aux défis)</p>
    <p class="empty-hint" style="margin-bottom:14px">Toute réponse contenant un de ces mots alimente automatiquement la file de modération, sans jamais bloquer la publication.</p>
    <form class="admin-form-row" id="add-keyword-form">
      <input type="text" name="keyword" placeholder="Mot-clé" required maxlength="60">
      <select name="category" required>${keywordOptions}</select>
      <button type="submit" class="btn-sm primary">Ajouter</button>
    </form>
    <div class="admin-list">${keywordRows}</div>
  `;

  document.getElementById('add-keyword-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const { error } = await supabase.from('moderation_keywords').insert({
      keyword: fd.get('keyword').trim(),
      category: fd.get('category')
    });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderContent();
  });

  contentEl.querySelectorAll('[data-action="delete-keyword"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce mot-clé ?')) return;
      const { error } = await supabase.from('moderation_keywords').delete().eq('id', btn.dataset.id);
      if (error) { alert(`Impossible de supprimer : ${error.message}`); return; }
      renderContent();
    });
  });

  document.getElementById('add-interest-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const name = fd.get('name').trim();
    const { error } = await supabase.from('interests').insert({
      name,
      slug: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      color_from: fd.get('color_from'),
      color_to: fd.get('color_to')
    });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderContent();
  });

  document.getElementById('add-challenge-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const { error } = await supabase.from('challenges').insert({
      interest_id: fd.get('interest_id'),
      title: fd.get('title').trim(),
      week_start: fd.get('week_start')
    });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderContent();
  });

  contentEl.querySelectorAll('[data-action="delete-interest"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce centre d\'intérêt ?')) return;
      const { error } = await supabase.from('interests').delete().eq('id', btn.dataset.id);
      if (error) { alert(`Impossible de supprimer : ${error.message}`); return; }
      renderContent();
    });
  });

  contentEl.querySelectorAll('[data-action="delete-challenge"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce défi ?')) return;
      const { error } = await supabase.from('challenges').delete().eq('id', btn.dataset.id);
      if (error) { alert(`Impossible de supprimer : ${error.message}`); return; }
      renderContent();
    });
  });
}

// ------------------------------------------------------------- moderation

async function loadModerationQueue(){
  const [{ data: reports, error: reportsError }, { data: flags, error: flagsError }] = await Promise.all([
    supabase.from('reports').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('moderation_flags').select('*').eq('status', 'pending').order('created_at', { ascending: false })
  ]);

  const profileIds = new Set();
  const responseIds = new Set();
  (reports || []).forEach(r => {
    profileIds.add(r.reporter_profile_id);
    if (r.target_type === 'profile') profileIds.add(r.target_id);
    if (r.target_type === 'challenge_response') responseIds.add(r.target_id);
  });
  (flags || []).forEach(f => { if (f.target_type === 'challenge_response') responseIds.add(f.target_id); });

  const [{ data: profiles }, { data: responses }] = await Promise.all([
    profileIds.size ? supabase.from('profiles').select('id, display_name').in('id', Array.from(profileIds)) : { data: [] },
    responseIds.size ? supabase.from('challenge_responses').select('id, profile_id, text').in('id', Array.from(responseIds)) : { data: [] }
  ]);

  return {
    reports: reports || [],
    flags: flags || [],
    reportsError, flagsError,
    profileMap: new Map((profiles || []).map(p => [p.id, p])),
    responseMap: new Map((responses || []).map(r => [r.id, r]))
  };
}

async function renderModeration(){
  contentEl.innerHTML = `<p class="empty-hint">Chargement…</p>`;
  const { reports, flags, reportsError, flagsError, profileMap, responseMap } = await loadModerationQueue();

  function targetLabel(targetType, targetId){
    if (targetType === 'profile') {
      return `Profil : ${escapeHtml(profileMap.get(targetId)?.display_name || targetId)}`;
    }
    const response = responseMap.get(targetId);
    return response
      ? `Réponse de défi de ${escapeHtml(profileMap.get(response.profile_id)?.display_name || response.profile_id)} : "${escapeHtml((response.text || '').slice(0, 140))}"`
      : `Réponse de défi (${targetId.slice(0, 8)}…)`;
  }

  const reportRows = reports.map(r => `
    <div class="admin-row" data-report-id="${r.id}">
      <div class="admin-row-main">
        <p class="admin-row-title">${targetLabel(r.target_type, r.target_id)}</p>
        <p class="admin-row-sub">Signalé par ${escapeHtml(profileMap.get(r.reporter_profile_id)?.display_name || r.reporter_profile_id)} · ${fmtDate(r.created_at)}</p>
        <p class="admin-row-sub">Motif : ${escapeHtml(r.reason)}</p>
      </div>
      <div class="admin-row-actions">
        ${r.target_type === 'profile' ? `<button class="btn-sm danger" data-action="sanction-report" data-report-id="${r.id}" data-profile-id="${r.target_id}">Sanctionner</button>` : ''}
        <button class="btn-sm" data-action="dismiss-report" data-id="${r.id}">Rejeter</button>
        <button class="btn-sm positive" data-action="action-report" data-id="${r.id}">Traité</button>
      </div>
    </div>
  `).join('') || (reportsError ? `<p class="empty-hint">Erreur : ${escapeHtml(reportsError.message)}</p>` : `<p class="empty-hint">Aucun signalement en attente.</p>`);

  const flagRows = flags.map(f => `
    <div class="admin-row" data-flag-id="${f.id}">
      <div class="admin-row-main">
        <p class="admin-row-title">${targetLabel(f.target_type, f.target_id)} <span class="badge pending">${escapeHtml(f.category)}</span> <span class="badge">${escapeHtml(f.source)}</span></p>
        <p class="admin-row-sub">Extrait : "${escapeHtml(f.excerpt)}" · confiance ${f.confidence ?? '—'} · ${fmtDate(f.created_at)}</p>
      </div>
      <div class="admin-row-actions">
        <button class="btn-sm" data-action="dismiss-flag" data-id="${f.id}">Rejeter</button>
        <button class="btn-sm positive" data-action="confirm-flag" data-id="${f.id}">Confirmer</button>
      </div>
    </div>
  `).join('') || (flagsError ? `<p class="empty-hint">Erreur : ${escapeHtml(flagsError.message)}</p>` : `<p class="empty-hint">Aucun contenu signalé par la détection automatique.</p>`);

  contentEl.innerHTML = `
    <p class="admin-section-title">Signalements des utilisateurs</p>
    <div class="admin-list">${reportRows}</div>

    <p class="admin-section-title">File de détection automatique (IA)</p>
    <div class="admin-list">${flagRows}</div>
  `;

  contentEl.querySelectorAll('[data-action="dismiss-report"]').forEach(btn => btn.addEventListener('click', () => updateReport(btn.dataset.id, 'dismissed')));
  contentEl.querySelectorAll('[data-action="action-report"]').forEach(btn => btn.addEventListener('click', () => updateReport(btn.dataset.id, 'actioned')));
  contentEl.querySelectorAll('[data-action="dismiss-flag"]').forEach(btn => btn.addEventListener('click', () => updateFlag(btn.dataset.id, 'dismissed')));
  contentEl.querySelectorAll('[data-action="confirm-flag"]').forEach(btn => btn.addEventListener('click', () => updateFlag(btn.dataset.id, 'confirmed')));
  contentEl.querySelectorAll('[data-action="sanction-report"]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await sanctionProfile(btn.dataset.profileId, 'depuis un signalement');
    if (ok) { await updateReport(btn.dataset.reportId, 'actioned', { silent: true }); renderModeration(); }
  }));
}

async function updateReport(id, status, { silent } = {}){
  const { error } = await supabase.from('reports').update({ status, reviewed_by: currentUserId, reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  if (!silent) renderModeration();
}

async function updateFlag(id, status){
  const { error } = await supabase.from('moderation_flags').update({ status, reviewed_by: currentUserId, reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  renderModeration();
}

// ------------------------------------------------------------------ lookup

const TEST_ACCOUNT_PASSWORD = 'AnkaTest123!';

async function renderLookup(){
  contentEl.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const { data: testAccounts, error: testAccountsError } = await supabase.rpc('supervisor_list_test_accounts');

  const testRows = (testAccounts || []).map(p => `
    <div class="admin-row" data-test-id="${p.id}">
      <div class="admin-row-main">
        <p class="admin-row-title">${escapeHtml(p.display_name)} ${p.is_banned ? '<span class="badge banned">banni</span>' : ''}</p>
        <p class="admin-row-sub">${escapeHtml(p.email)} · DM ${p.dm_open ? 'ouverts' : 'fermés'}</p>
      </div>
      <div class="admin-row-actions">
        <button class="btn-sm primary" data-action="login-as-test" data-id="${p.id}" data-email="${escapeHtml(p.email)}">Se connecter</button>
        <button class="btn-sm" data-action="view-profile" data-id="${p.id}">Consulter</button>
        <button class="btn-sm danger" data-action="reset-test-account" data-id="${p.id}">Réinitialiser</button>
      </div>
    </div>
  `).join('') || (testAccountsError ? `<p class="empty-hint">Erreur : ${escapeHtml(testAccountsError.message)}</p>` : `<p class="empty-hint">Aucun compte de test.</p>`);

  contentEl.innerHTML = `
    <p class="admin-section-title">Comptes de test</p>
    <div class="admin-list">${testRows}</div>

    <p class="admin-section-title">Rechercher un profil</p>
    <form class="admin-form-row" id="lookup-search-form">
      <input type="text" name="q" placeholder="Prénom du profil" required style="flex:1;min-width:200px">
      <button type="submit" class="btn-sm primary">Rechercher</button>
    </form>
    <div class="admin-list" id="lookup-results"></div>
    <div id="lookup-detail"></div>
  `;

  contentEl.querySelectorAll('[data-action="login-as-test"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm(`Te connecter en tant que ${btn.dataset.email} ? Tu seras déconnecté·e de ton compte Superviseur (reconnecte-toi ensuite avec tes identifiants habituels pour y revenir).`)) return;
    const { error } = await supabase.auth.signInWithPassword({ email: btn.dataset.email, password: TEST_ACCOUNT_PASSWORD });
    if (error) alert(`Erreur : ${error.message}`);
  }));
  contentEl.querySelectorAll('[data-action="view-profile"]').forEach(btn => btn.addEventListener('click', () => showProfileDetail(btn.dataset.id)));
  contentEl.querySelectorAll('[data-action="reset-test-account"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Réinitialiser ce compte de test ? Ses initiatives, réponses, messages de forum et sanctions seront effacés (identité et profil conservés).')) return;
    const { error } = await supabase.rpc('supervisor_reset_test_account', { target_profile_id: btn.dataset.id });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderLookup();
  }));

  document.getElementById('lookup-search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const q = new FormData(event.target).get('q').trim();
    const resultsEl = document.getElementById('lookup-results');
    if (!q) return;
    const { data, error } = await supabase.from('profiles').select('id, display_name').ilike('display_name', `%${q}%`).limit(10);
    if (error) { resultsEl.innerHTML = `<p class="empty-hint">Erreur : ${escapeHtml(error.message)}</p>`; return; }
    resultsEl.innerHTML = (data || []).map(p => `
      <div class="admin-row">
        <div class="admin-row-main"><p class="admin-row-title">${escapeHtml(p.display_name)}</p></div>
        <div class="admin-row-actions"><button class="btn-sm" data-action="view-profile" data-id="${p.id}">Consulter</button></div>
      </div>
    `).join('') || `<p class="empty-hint">Aucun résultat.</p>`;

    resultsEl.querySelectorAll('[data-action="view-profile"]').forEach(btn => btn.addEventListener('click', () => showProfileDetail(btn.dataset.id)));
  });
}

async function showProfileDetail(profileId){
  const detailEl = document.getElementById('lookup-detail');
  detailEl.innerHTML = `<p class="empty-hint">Chargement…</p>`;
  const { data, error } = await supabase.rpc('supervisor_lookup_profile', { target_profile_id: profileId });
  if (error) { detailEl.innerHTML = `<p class="empty-hint">Erreur : ${escapeHtml(error.message)}</p>`; return; }
  if (!data) { detailEl.innerHTML = `<p class="empty-hint">Profil introuvable.</p>`; return; }

  const p = data.profile;
  const sanctions = (data.sanctions || []).map(s => `
    <div class="admin-row">
      <div class="admin-row-main">
        <p class="admin-row-title">${escapeHtml(s.type)} — ${escapeHtml(s.reason)}</p>
        <p class="admin-row-sub">${fmtDate(s.created_at)}${s.ends_at ? ` · jusqu'au ${fmtDate(s.ends_at)}` : ''}</p>
      </div>
    </div>
  `).join('') || `<p class="empty-hint">Aucune sanction.</p>`;

  detailEl.innerHTML = `
    <p class="admin-section-title">${escapeHtml(p.display_name)} ${p.is_banned ? '<span class="badge banned">banni</span>' : ''}</p>
    <div class="admin-row">
      <div class="admin-row-main">
        <p class="admin-row-sub">Email : ${escapeHtml(data.email)}</p>
        <p class="admin-row-sub">Inscrit le ${fmtDate(p.created_at)} · vu le ${fmtDate(p.last_seen_at)}</p>
        <p class="admin-row-sub">Signalements reçus : ${data.report_count}</p>
      </div>
      <div class="admin-row-actions">
        <button class="btn-sm danger" id="lookup-sanction-btn">Sanctionner</button>
      </div>
    </div>
    <p class="admin-section-title">Historique des sanctions</p>
    <div class="admin-list">${sanctions}</div>
  `;

  document.getElementById('lookup-sanction-btn').addEventListener('click', async () => {
    const ok = await sanctionProfile(profileId, p.display_name);
    if (ok) showProfileDetail(profileId);
  });
}

// --------------------------------------------------------------------- init

const RENDERERS = { overview: renderOverview, content: renderContent, moderation: renderModeration, lookup: renderLookup };

let listenersAttached = false;

// Safe to call every time supervisor mode is (re-)entered — including after
// an account switch (e.g. "log in as a test account") — since listeners are
// attached only once ever, while the current tab always re-renders with
// fresh data for whoever is currently signed in.
export function initSupervisor(userId){
  currentUserId = userId;
  contentEl = document.getElementById('supervisor-content');
  const tabs = document.querySelectorAll('.stab');

  if (!listenersAttached) {
    listenersAttached = true;
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.stab;
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        RENDERERS[activeTab]();
      });
    });
  }

  RENDERERS[activeTab]();
}
