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

async function renderThreadList(container, myProfile){
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [interests, threadsResult, allThreadsResult, allPostsResult] = await Promise.all([
    fetchInterestsCatalog(),
    supabase.from('forum_threads').select('id, title, created_at, interest_id, interests(name)').order('created_at', { ascending: false }).limit(15),
    supabase.from('forum_threads').select('interest_id'),
    supabase.from('forum_posts').select('thread_id')
  ]);

  const countsByInterest = new Map();
  (allThreadsResult.data || []).forEach(t => countsByInterest.set(t.interest_id, (countsByInterest.get(t.interest_id) || 0) + 1));
  const repliesByThread = new Map();
  (allPostsResult.data || []).forEach(p => repliesByThread.set(p.thread_id, (repliesByThread.get(p.thread_id) || 0) + 1));

  const catGrid = interests.map(i => `
    <div class="cat-card">
      <div class="cat-mark" style="background:linear-gradient(135deg,${escapeHtml(i.color_from)},${escapeHtml(i.color_to)})"></div>
      <h3>${escapeHtml(i.name)}</h3>
      <p>${countsByInterest.get(i.id) || 0} discussion${(countsByInterest.get(i.id) || 0) === 1 ? '' : 's'}</p>
    </div>
  `).join('');

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

  const interestOptions = interests.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');

  container.innerHTML = `
    <p class="section-label">Catégories</p>
    <div class="cat-grid">${catGrid}</div>

    <p class="section-label">Fils récents</p>
    <div id="thread-list">${threadRows}</div>

    <button class="btn btn-ghost" id="new-thread-toggle" style="width:100%;margin-top:14px">Démarrer un fil</button>
    <form class="admin-form-row" id="new-thread-form" style="margin-top:12px" hidden>
      <select name="interest_id" required>${interestOptions}</select>
      <input type="text" name="title" placeholder="Ta question" required maxlength="140" style="flex:1;min-width:160px">
      <button type="submit" class="btn-sm primary">Publier</button>
    </form>
  `;

  container.querySelectorAll('[data-thread-id]').forEach(row => {
    row.addEventListener('click', () => renderThreadDetail(container, myProfile, row.dataset.threadId));
  });

  const toggleBtn = document.getElementById('new-thread-toggle');
  const newThreadForm = document.getElementById('new-thread-form');
  toggleBtn.addEventListener('click', () => { newThreadForm.hidden = !newThreadForm.hidden; });

  newThreadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const { error } = await supabase.from('forum_threads').insert({
      interest_id: fd.get('interest_id'),
      profile_id: myProfile.id,
      title: fd.get('title').trim()
    });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderThreadList(container, myProfile);
  });
}

async function renderThreadDetail(container, myProfile, threadId){
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

  document.getElementById('back-to-list').addEventListener('click', () => renderThreadList(container, myProfile));
  document.getElementById('reply-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const body = fd.get('body').trim();
    if (!body) return;
    const { error } = await supabase.from('forum_posts').insert({ thread_id: threadId, profile_id: myProfile.id, body });
    if (error) { alert(`Erreur : ${error.message}`); return; }
    renderThreadDetail(container, myProfile, threadId);
  });
}

export async function renderForum(container, myProfile){
  await renderThreadList(container, myProfile);
}
