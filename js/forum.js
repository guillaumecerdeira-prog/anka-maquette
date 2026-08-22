import { supabase } from './supabase-client.js';
import { fetchInterestsCatalog } from './profile.js';
import { reportButtonHtml, attachReportHandlers } from './reports.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(iso){
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function fmtRelative(iso){
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'hier';
  return `il y a ${diffD}j`;
}

const PROPOSAL_STATUS_LABEL = { pending: 'en attente', accepted: 'acceptée', refused: 'refusée' };
const PROPOSAL_STATUS_BADGE = { pending: 'pending', accepted: '', refused: 'banned' };

async function fetchMyCategoryProposals(profileId){
  const { data, error } = await supabase
    .from('forum_category_proposals')
    .select('id, proposed_name, status, decision_reason, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

async function renderThreadList(container, myProfile){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [interests, threadsResult, allThreadsResult, allPostsResult, myProposals] = await Promise.all([
    fetchInterestsCatalog(),
    supabase.from('forum_threads').select('id, title, created_at, interest_id, interests(name)').not('interest_id', 'is', null).order('created_at', { ascending: false }).limit(15),
    supabase.from('forum_threads').select('id, interest_id, created_at, profiles(display_name)').not('interest_id', 'is', null),
    supabase.from('forum_posts').select('thread_id, created_at, profiles(display_name)'),
    fetchMyCategoryProposals(myProfile.id)
  ]);

  const repliesByThread = new Map();
  (allPostsResult.data || []).forEach(p => repliesByThread.set(p.thread_id, (repliesByThread.get(p.thread_id) || 0) + 1));

  // Per-category: thread count + whichever is more recent, the last thread
  // opened or the last reply posted in it (and by whom) — "dernier message".
  const activityByInterest = new Map();
  const threadToInterest = new Map();
  (allThreadsResult.data || []).forEach(t => {
    threadToInterest.set(t.id, t.interest_id);
    const entry = activityByInterest.get(t.interest_id) || { count: 0, lastAt: null, lastAuthor: null };
    entry.count += 1;
    if (!entry.lastAt || new Date(t.created_at) > new Date(entry.lastAt)) {
      entry.lastAt = t.created_at;
      entry.lastAuthor = t.profiles?.display_name;
    }
    activityByInterest.set(t.interest_id, entry);
  });
  (allPostsResult.data || []).forEach(p => {
    const interestId = threadToInterest.get(p.thread_id);
    const entry = activityByInterest.get(interestId);
    if (!entry) return;
    if (!entry.lastAt || new Date(p.created_at) > new Date(entry.lastAt)) {
      entry.lastAt = p.created_at;
      entry.lastAuthor = p.profiles?.display_name;
    }
  });

  const catList = interests.map(i => {
    const activity = activityByInterest.get(i.id);
    const isEmpty = !activity;
    return `
      <div class="cat-row${isEmpty ? ' is-empty' : ''}" data-interest-id="${i.id}" style="cursor:pointer">
        <div class="cat-icon" style="${isEmpty ? '' : `background:linear-gradient(135deg,${escapeHtml(i.color_from)},${escapeHtml(i.color_to)})`}">${i.icon ? escapeHtml(i.icon) : '💬'}</div>
        <div>
          <p class="cat-row-name">${escapeHtml(i.name)}</p>
          <p class="cat-row-meta">${isEmpty
            ? "Aucun fil pour l'instant"
            : `${activity.count} fil${activity.count === 1 ? '' : 's'} · dernier message par ${escapeHtml(activity.lastAuthor || '—')} · ${fmtRelative(activity.lastAt)}`}</p>
        </div>
      </div>
    `;
  }).join('');

  const threads = threadsResult.data || [];
  const threadRows = threads.length ? threads.map(t => `
    <div class="thread" data-thread-id="${t.id}" style="cursor:pointer">
      <div>
        <span class="thread-tag">${escapeHtml(t.interests?.name || '—')}</span>
        <p>${escapeHtml(t.title)}</p>
      </div>
      <span class="thread-meta">${repliesByThread.get(t.id) || 0} réponse${(repliesByThread.get(t.id) || 0) === 1 ? '' : 's'}</span>
    </div>
  `).join('') : `<p class="empty-hint">Aucun fil pour l'instant.</p>`;

  const proposalStatusHtml = myProposals.length ? `
    <p class="section-label">Tes propositions de catégorie</p>
    <div class="admin-list" style="margin-bottom:10px">${myProposals.map(p => `
      <div class="admin-row">
        <div class="admin-row-main">
          <p class="admin-row-title">${escapeHtml(p.proposed_name)} <span class="badge ${PROPOSAL_STATUS_BADGE[p.status]}">${escapeHtml(PROPOSAL_STATUS_LABEL[p.status])}</span></p>
          ${p.status === 'refused' && p.decision_reason ? `<p class="admin-row-sub">Motif : ${escapeHtml(p.decision_reason)}</p>` : ''}
        </div>
      </div>
    `).join('')}</div>
  ` : '';

  container.innerHTML = `
    <p class="section-label">Catégories</p>
    <div class="cat-list">${catList}</div>

    <button class="btn-sm" id="propose-category-toggle" style="margin-top:10px">Proposer une catégorie</button>
    <form class="admin-form-row" id="propose-category-form" style="margin-top:10px" hidden>
      <input type="text" name="proposed_name" placeholder="Nom proposé" required maxlength="40" style="flex:1;min-width:140px">
      <input type="text" name="justification" placeholder="Pourquoi cette catégorie ?" required maxlength="240" style="flex:2;min-width:200px">
      <button type="submit" class="btn-sm primary">Envoyer</button>
    </form>

    ${proposalStatusHtml}

    <p class="section-label">Fils récents</p>
    <div id="thread-list">${threadRows}</div>
  `;

  const proposeToggleBtn = document.getElementById('propose-category-toggle');
  const proposeForm = document.getElementById('propose-category-form');
  proposeToggleBtn.addEventListener('click', () => { proposeForm.hidden = !proposeForm.hidden; });

  proposeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const { error } = await supabase.from('forum_category_proposals').insert({
      profile_id: myProfile.id,
      proposed_name: fd.get('proposed_name').trim(),
      justification: fd.get('justification').trim()
    });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderThreadList(container, myProfile);
  });

  const rerenderList = () => renderThreadList(container, myProfile);
  container.querySelectorAll('[data-thread-id]').forEach(row => {
    row.addEventListener('click', () => renderThreadDetail(container, myProfile, row.dataset.threadId, rerenderList));
  });
  container.querySelectorAll('[data-interest-id]').forEach(row => {
    const interest = interests.find(i => i.id === row.dataset.interestId);
    row.addEventListener('click', () => renderCategoryDetail(container, myProfile, interest, rerenderList));
  });
}

async function renderCategoryDetail(container, myProfile, interest, onBack){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [{ data: threads, error: threadsError }, { data: posts }] = await Promise.all([
    supabase.from('forum_threads').select('id, title, created_at, profiles(display_name)').eq('interest_id', interest.id).order('created_at', { ascending: false }),
    supabase.from('forum_posts').select('thread_id, created_at, profiles(display_name)')
  ]);

  const activityByThread = new Map();
  (threads || []).forEach(t => activityByThread.set(t.id, { count: 0, lastAt: t.created_at, lastAuthor: t.profiles?.display_name }));
  (posts || []).forEach(p => {
    const entry = activityByThread.get(p.thread_id);
    if (!entry) return;
    entry.count += 1;
    if (new Date(p.created_at) > new Date(entry.lastAt)) {
      entry.lastAt = p.created_at;
      entry.lastAuthor = p.profiles?.display_name;
    }
  });

  const threadRows = (threads || []).length ? threads.map(t => {
    const activity = activityByThread.get(t.id);
    return `
      <div class="thread" data-thread-id="${t.id}" style="cursor:pointer">
        <div>
          <span class="thread-tag">par ${escapeHtml(t.profiles?.display_name || '—')}</span>
          <p>${escapeHtml(t.title)}</p>
          <p class="empty-hint" style="margin-top:3px">dernier message par ${escapeHtml(activity.lastAuthor || '—')} · ${fmtRelative(activity.lastAt)}</p>
        </div>
        <span class="thread-meta">${activity.count} réponse${activity.count === 1 ? '' : 's'}</span>
      </div>
    `;
  }).join('') : `<p class="empty-hint">Aucun fil pour l'instant — sois le premier·ère.</p>`;

  container.innerHTML = `
    <button class="btn-sm" id="back-to-categories" style="margin-bottom:14px">← Retour</button>
    <p class="section-label">${interest.icon ? `${escapeHtml(interest.icon)} ` : ''}${escapeHtml(interest.name)}</p>
    ${threadsError ? `<p class="empty-hint">Erreur : ${escapeHtml(threadsError.message)}</p>` : threadRows}

    <button class="btn btn-ghost" id="new-thread-toggle" style="width:100%;margin-top:14px">Démarrer un fil</button>
    <form class="admin-form-row" id="new-thread-form" style="margin-top:12px" hidden>
      <input type="text" name="title" placeholder="Ta question" required maxlength="140" style="flex:1;min-width:160px">
      <button type="submit" class="btn-sm primary">Publier</button>
    </form>
  `;

  const rerender = () => renderCategoryDetail(container, myProfile, interest, onBack);

  document.getElementById('back-to-categories').addEventListener('click', onBack);
  container.querySelectorAll('[data-thread-id]').forEach(row => {
    row.addEventListener('click', () => renderThreadDetail(container, myProfile, row.dataset.threadId, rerender));
  });

  const toggleBtn = document.getElementById('new-thread-toggle');
  const newThreadForm = document.getElementById('new-thread-form');
  toggleBtn.addEventListener('click', () => { newThreadForm.hidden = !newThreadForm.hidden; });

  newThreadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const { error } = await supabase.from('forum_threads').insert({
      interest_id: interest.id,
      profile_id: myProfile.id,
      title: fd.get('title').trim()
    });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    rerender();
  });
}

async function renderThreadDetail(container, myProfile, threadId, onBack){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [{ data: thread, error: threadError }, { data: posts, error: postsError }] = await Promise.all([
    supabase.from('forum_threads').select('id, title, created_at, profile_id, interests(name), profiles(display_name)').eq('id', threadId).maybeSingle(),
    supabase.from('forum_posts').select('id, body, created_at, profile_id, profiles(display_name, avatar_style)').eq('thread_id', threadId).order('created_at', { ascending: true })
  ]);

  if (threadError || !thread) { container.innerHTML = `<p class="empty-hint">Fil introuvable.</p>`; return; }

  const postRows = (posts || []).length ? posts.map(p => `
    <div class="response-row">
      <div class="avatar ${escapeHtml(p.profiles?.avatar_style || 'av-a')}" style="width:36px;height:36px;flex-shrink:0"><div class="avatar-shape"></div></div>
      <div style="flex:1;min-width:0">
        <p class="response-name">${escapeHtml(p.profiles?.display_name || '—')} <span class="empty-hint">· ${fmtDate(p.created_at)}</span></p>
        <p class="response-text">${escapeHtml(p.body)}</p>
      </div>
      ${p.profile_id !== myProfile.id ? reportButtonHtml('forum_post', p.id) : ''}
    </div>
  `).join('') : (postsError ? `<p class="empty-hint">Erreur : ${escapeHtml(postsError.message)}</p>` : `<p class="empty-hint">Aucune réponse pour l'instant — sois le premier·ère.</p>`);

  container.innerHTML = `
    <button class="btn-sm" id="back-to-list" style="margin-bottom:14px">← Retour</button>
    <p class="thread-tag">${escapeHtml(thread.interests?.name || '—')}</p>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:6px 0 3px">
      <h2 style="font-family:var(--font-display);font-weight:500;font-size:18px;margin:0">${escapeHtml(thread.title)}</h2>
      ${thread.profile_id !== myProfile.id ? reportButtonHtml('forum_thread', thread.id) : ''}
    </div>
    <p class="empty-hint" style="margin-bottom:16px">par ${escapeHtml(thread.profiles?.display_name || '—')} · ${fmtDate(thread.created_at)}</p>

    <div class="admin-list">${postRows}</div>

    <form id="reply-form" style="margin-top:16px">
      <textarea name="body" placeholder="Ta réponse…" required maxlength="500" style="width:100%;min-height:70px;font-family:var(--font-body);font-size:13px;padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--line);background:var(--surface-alt);color:var(--ink);resize:vertical"></textarea>
      <button type="submit" class="btn btn-primary" style="margin-top:8px;width:100%">Répondre</button>
    </form>
  `;

  attachReportHandlers(container, myProfile);

  document.getElementById('back-to-list').addEventListener('click', onBack);
  document.getElementById('reply-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const body = fd.get('body').trim();
    if (!body) return;
    const { error } = await supabase.from('forum_posts').insert({ thread_id: threadId, profile_id: myProfile.id, body });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderThreadDetail(container, myProfile, threadId, onBack);
  });
}

export async function renderForum(container, myProfile){
  await renderThreadList(container, myProfile);
}
