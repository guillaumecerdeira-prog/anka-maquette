import { supabase } from './supabase-client.js';

export async function fetchMyConversations(myId){
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, participant_1, participant_2, origin, status, created_at,
      p1:profiles!conversations_participant_1_fkey(id, display_name, avatar_style),
      p2:profiles!conversations_participant_2_fkey(id, display_name, avatar_style)
    `)
    .or(`participant_1.eq.${myId},participant_2.eq.${myId}`);
  if (error) throw error;

  const conversations = (data || []).map(c => ({
    id: c.id,
    origin: c.origin,
    status: c.status,
    createdAt: c.created_at,
    otherProfile: c.participant_1 === myId ? c.p2 : c.p1
  }));

  if (!conversations.length) return [];

  const ids = conversations.map(c => c.id);

  const [{ data: allMessages, error: messagesError }, { data: unread, error: unreadError }] = await Promise.all([
    supabase.from('messages').select('conversation_id, body, sender_id, created_at').in('conversation_id', ids).order('created_at', { ascending: false }),
    supabase.from('messages').select('conversation_id').in('conversation_id', ids).is('read_at', null).neq('sender_id', myId)
  ]);
  if (messagesError) throw messagesError;
  if (unreadError) throw unreadError;

  const lastMessageByConversation = new Map();
  (allMessages || []).forEach(m => {
    if (!lastMessageByConversation.has(m.conversation_id)) lastMessageByConversation.set(m.conversation_id, m);
  });
  const unreadCountByConversation = new Map();
  (unread || []).forEach(m => unreadCountByConversation.set(m.conversation_id, (unreadCountByConversation.get(m.conversation_id) || 0) + 1));

  return conversations
    .map(c => ({
      ...c,
      lastMessage: lastMessageByConversation.get(c.id) || null,
      unreadCount: unreadCountByConversation.get(c.id) || 0
    }))
    .sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.createdAt;
      const bTime = b.lastMessage?.created_at || b.createdAt;
      return new Date(bTime) - new Date(aTime);
    });
}

// RLS on messages already restricts SELECT to conversations the caller is
// a participant of, so this counts only messages actually addressed to me.
export async function fetchUnreadMessageCount(myId){
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .neq('sender_id', myId);
  if (error) throw error;
  return count || 0;
}

export async function fetchConversationBetween(myId, theirId){
  const { data, error } = await supabase
    .from('conversations')
    .select('id, origin, status')
    .eq('participant_1', myId < theirId ? myId : theirId)
    .eq('participant_2', myId < theirId ? theirId : myId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMessages(conversationId){
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, body, created_at, read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function sendMessage(conversationId, senderId, body){
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select('id, sender_id, body, created_at, read_at')
    .single();
  if (error) throw error;
  return data;
}

export async function markConversationRead(conversationId, myId){
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', myId)
    .is('read_at', null);
  if (error) throw error;
}

export async function startOpenDmConversation(targetProfileId){
  const { data, error } = await supabase.rpc('start_conversation_open_dm', { target_profile_id: targetProfileId });
  if (error) throw error;
  return data;
}

// Live updates for one conversation: new/updated messages (read receipts)
// plus an ephemeral typing-indicator broadcast (never persisted to the
// database — matches the anti-urgence spirit while still showing intent
// to reply in the moment).
export function subscribeToConversation(conversationId, { onMessage, onMessageUpdate, onTyping }){
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessage?.(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessageUpdate?.(payload.new))
    .on('broadcast', { event: 'typing' }, (payload) => onTyping?.(payload.payload))
    .subscribe();

  return {
    sendTyping(senderId){
      channel.send({ type: 'broadcast', event: 'typing', payload: { senderId } });
    },
    unsubscribe(){
      supabase.removeChannel(channel);
    }
  };
}
