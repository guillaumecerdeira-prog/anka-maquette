import { supabase } from './supabase-client.js';

export async function createReport(reporterProfileId, targetType, targetId, reason){
  const { error } = await supabase.from('reports').insert({
    reporter_profile_id: reporterProfileId,
    target_type: targetType,
    target_id: targetId,
    reason
  });
  if (error) throw error;
}

export function reportButtonHtml(targetType, targetId){
  return `<button type="button" class="btn-sm" data-action="report" data-target-type="${targetType}" data-target-id="${targetId}">Signaler</button>`;
}

export function attachReportHandlers(container, myProfile){
  container.querySelectorAll('[data-action="report"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reason = window.prompt('Pourquoi signales-tu ce contenu ?');
      if (reason === null) return;
      const trimmed = reason.trim();
      if (!trimmed) { alert('Merci de préciser un motif.'); return; }
      btn.disabled = true;
      try {
        await createReport(myProfile.id, btn.dataset.targetType, btn.dataset.targetId, trimmed);
        alert('Signalement envoyé. Merci.');
      } catch (err) {
        alert(`Erreur : ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}
