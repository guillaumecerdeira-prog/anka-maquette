import { fetchMessages, sendMessage, markConversationRead, subscribeToConversation } from './messaging.js';
import { fetchBlockedIds, blockProfile, unblockProfile } from './blocks.js';
import { renderProfileDetail } from './profile-view.js';

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtTime(iso){
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Only one thread is ever open at a time in this app — tracking the live
// subscription here (rather than inside renderConversationThread's own
// closure) lets app.js tear it down whenever the user switches tabs
// without going through "Retour" first.
let activeSubscription = null;

export function teardownActiveConversation(){
  if (activeSubscription) {
    activeSubscription.unsubscribe();
    activeSubscription = null;
  }
}

function messageRowHtml(message, myId){
  const mine = message.sender_id === myId;
  return `
    <div class="message-row ${mine ? 'mine' : 'theirs'}" data-message-id="${message.id}">
      <div class="message-bubble">${escapeHtml(message.body)}</div>
      <p class="message-meta">${fmtTime(message.created_at)}${mine && message.read_at ? ' · Vu' : ''}</p>
    </div>
  `;
}

export async function renderConversationThread(container, myProfile, conversation, onBack){
  teardownActiveConversation();
  container.innerHTML = `<p class="empty-hint">Chargement…</p>`;

  const [messages, blockedIds] = await Promise.all([
    fetchMessages(conversation.id),
    fetchBlockedIds(myProfile.id)
  ]);
  markConversationRead(conversation.id, myProfile.id).catch(() => {});

  const iBlockedThem = blockedIds.includes(conversation.otherProfile.id);
  const theyBlockedMe = conversation.status === 'blocked' && !iBlockedThem;
  const canSend = conversation.status !== 'blocked';

  container.innerHTML = `
    <button class="btn-sm" id="back-btn" style="margin-bottom:14px">← Retour</button>
    <div class="thread-header">
      <div class="avatar ${escapeHtml(conversation.otherProfile.avatar_style)}" style="width:40px;height:40px;flex-shrink:0;cursor:pointer" id="thread-header-avatar"><div class="avatar-shape"></div></div>
      <p class="thread-header-name" id="thread-header-name" style="cursor:pointer">${escapeHtml(conversation.otherProfile.display_name)}</p>
      <button type="button" class="btn-sm ${iBlockedThem ? '' : 'danger'}" id="block-toggle-btn">${iBlockedThem ? 'Débloquer' : 'Bloquer'}</button>
    </div>
    <div id="message-list" class="message-list">
      ${messages.length ? messages.map(m => messageRowHtml(m, myProfile.id)).join('') : `<p class="empty-hint">Aucun message pour l'instant — dis bonjour !</p>`}
    </div>
    <p class="typing-indicator" id="typing-indicator" hidden>${escapeHtml(conversation.otherProfile.display_name)} est en train d'écrire…</p>
    ${theyBlockedMe ? `<p class="empty-hint">Cette personne a bloqué la conversation.</p>` : ''}
    <form id="compose-form" ${canSend ? '' : 'hidden'}>
      <textarea id="compose-input" placeholder="Écris un message…" maxlength="2000" required></textarea>
      <button type="submit" class="btn btn-primary">Envoyer</button>
    </form>
  `;

  const messageList = document.getElementById('message-list');
  messageList.scrollTop = messageList.scrollHeight;

  document.getElementById('back-btn').addEventListener('click', () => {
    teardownActiveConversation();
    onBack();
  });

  const openProfile = () => {
    renderProfileDetail(container, myProfile, conversation.otherProfile.id, () => {
      renderConversationThread(container, myProfile, conversation, onBack);
    });
  };
  document.getElementById('thread-header-avatar').addEventListener('click', openProfile);
  document.getElementById('thread-header-name').addEventListener('click', openProfile);

  document.getElementById('block-toggle-btn').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      if (iBlockedThem) {
        await unblockProfile(conversation.otherProfile.id);
      } else {
        if (!confirm(`Bloquer ${conversation.otherProfile.display_name} ? Plus aucun nouveau message ne pourra être échangé tant que le blocage tient.`)) { event.target.disabled = false; return; }
        await blockProfile(conversation.otherProfile.id);
      }
      const refreshed = { ...conversation, status: iBlockedThem ? 'active' : 'blocked' };
      renderConversationThread(container, myProfile, refreshed, onBack);
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      event.target.disabled = false;
    }
  });

  const typingIndicator = document.getElementById('typing-indicator');
  let typingHideTimer;

  activeSubscription = subscribeToConversation(conversation.id, {
    onMessage(newMessage){
      if (newMessage.sender_id === myProfile.id) return;
      document.querySelector('#message-list .empty-hint')?.remove();
      messageList.insertAdjacentHTML('beforeend', messageRowHtml(newMessage, myProfile.id));
      messageList.scrollTop = messageList.scrollHeight;
      markConversationRead(conversation.id, myProfile.id).catch(() => {});
      typingIndicator.hidden = true;
    },
    onMessageUpdate(updatedMessage){
      if (updatedMessage.sender_id !== myProfile.id || !updatedMessage.read_at) return;
      const meta = container.querySelector(`[data-message-id="${updatedMessage.id}"] .message-meta`);
      if (meta) meta.textContent = `${fmtTime(updatedMessage.created_at)} · Vu`;
    },
    onTyping({ senderId }){
      if (senderId === myProfile.id) return;
      typingIndicator.hidden = false;
      clearTimeout(typingHideTimer);
      typingHideTimer = setTimeout(() => { typingIndicator.hidden = true; }, 3000);
    }
  });

  const composeForm = document.getElementById('compose-form');
  const composeInput = document.getElementById('compose-input');

  composeInput?.addEventListener('input', () => {
    activeSubscription?.sendTyping(myProfile.id);
  });

  composeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = composeInput.value.trim();
    if (!body) return;
    const submitBtn = composeForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const sent = await sendMessage(conversation.id, myProfile.id, body);
      document.querySelector('#message-list .empty-hint')?.remove();
      messageList.insertAdjacentHTML('beforeend', messageRowHtml(sent, myProfile.id));
      messageList.scrollTop = messageList.scrollHeight;
      composeInput.value = '';
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
}
