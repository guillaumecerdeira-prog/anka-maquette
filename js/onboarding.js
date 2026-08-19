import { fetchInterestsCatalog, PROMPT_CATALOG } from './profile.js';

const form = document.getElementById('onboarding-form');
const nameInput = document.getElementById('ob-name');
const birthdateInput = document.getElementById('ob-birthdate');
const avatarPicker = document.getElementById('ob-avatar-picker');
const interestsContainer = document.getElementById('ob-interests');
const promptsContainer = document.getElementById('ob-prompts');
const errorEl = document.getElementById('ob-error');
const submitBtn = document.getElementById('ob-submit');

let selectedAvatarStyle = 'av-a';
let selectedInterestIds = new Set();
let interestsLoaded = false;

avatarPicker.addEventListener('click', (event) => {
  const btn = event.target.closest('.avatar-option');
  if (!btn) return;
  selectedAvatarStyle = btn.dataset.style;
  avatarPicker.querySelectorAll('.avatar-option').forEach(b => b.classList.toggle('active', b === btn));
});

function buildPromptRows(){
  promptsContainer.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const row = document.createElement('div');
    row.className = 'prompt-picker-row';

    const select = document.createElement('select');
    PROMPT_CATALOG.forEach((question, qi) => {
      const opt = document.createElement('option');
      opt.value = question;
      opt.textContent = question;
      if (qi === i % PROMPT_CATALOG.length) opt.selected = true;
      select.appendChild(opt);
    });

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Ta réponse (laisse vide pour ignorer)';
    textarea.maxLength = 240;

    row.appendChild(select);
    row.appendChild(textarea);
    promptsContainer.appendChild(row);
  }
}

async function ensureInterestsLoaded(){
  if (interestsLoaded) return;
  const interests = await fetchInterestsCatalog();
  interestsContainer.innerHTML = '';
  interests.forEach(interest => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'interest-option';
    btn.textContent = interest.name;
    btn.dataset.id = interest.id;
    btn.addEventListener('click', () => {
      if (selectedInterestIds.has(interest.id)) {
        selectedInterestIds.delete(interest.id);
        btn.classList.remove('selected');
      } else {
        selectedInterestIds.add(interest.id);
        btn.classList.add('selected');
      }
    });
    interestsContainer.appendChild(btn);
  });
  interestsLoaded = true;
}

export async function resetOnboardingForm(){
  selectedAvatarStyle = 'av-a';
  selectedInterestIds = new Set();
  form.reset();
  errorEl.hidden = true;
  avatarPicker.querySelectorAll('.avatar-option').forEach(b => b.classList.toggle('active', b.dataset.style === 'av-a'));
  buildPromptRows();
  await ensureInterestsLoaded();
  interestsContainer.querySelectorAll('.interest-option').forEach(b => b.classList.remove('selected'));
}

export function onOnboardingSubmit(handler){
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    try {
      const prompts = Array.from(promptsContainer.querySelectorAll('.prompt-picker-row')).map(row => ({
        question: row.querySelector('select').value,
        answer: row.querySelector('textarea').value
      }));
      await handler({
        displayName: nameInput.value.trim(),
        birthDate: birthdateInput.value,
        avatarStyle: selectedAvatarStyle,
        interestIds: Array.from(selectedInterestIds),
        prompts
      });
    } catch (err) {
      errorEl.textContent = err.message || 'Une erreur est survenue.';
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
}
