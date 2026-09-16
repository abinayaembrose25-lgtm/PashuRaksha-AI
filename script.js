const api = (path, options = {}) => fetch(`/api${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const searchInput = document.getElementById('searchInput');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');

togglePassword?.addEventListener('click', () => {
  const showingPassword = passwordInput.type === 'password';
  passwordInput.type = showingPassword ? 'text' : 'password';
  togglePassword.textContent = showingPassword ? 'Hide' : 'Show';
  togglePassword.setAttribute('aria-label', showingPassword ? 'Hide password' : 'Show password');
});

menuToggle?.addEventListener('click', () => sidebar?.classList.toggle('open'));
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => { if (window.innerWidth <= 760) sidebar?.classList.remove('open'); }));
searchInput?.addEventListener('input', (event) => { const query = event.target.value.toLowerCase().trim(); document.querySelectorAll('#reportRows tr').forEach((row) => { row.hidden = Boolean(query && !row.textContent.toLowerCase().includes(query)); }); });
document.querySelector('.notification-button')?.addEventListener('click', () => alert('Your latest health reports are ready.'));

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); loginStatus.textContent = 'Signing in...';
  if (!loginForm.checkValidity()) { loginStatus.textContent = 'Please enter a valid email and password.'; loginForm.reportValidity(); return; }
  try {
    const response = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: loginForm.email.value, password: loginForm.password.value }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    const session = await api('/auth/session'); const sessionData = await session.json();
    window.location.href = sessionData.user?.profileComplete ? 'index.html' : 'profile.html';
  } catch (error) { loginStatus.textContent = error.message || 'Unable to sign in. Please try again.'; }
});

document.querySelector('.demo-button')?.addEventListener('click', (event) => {
  event.preventDefault(); document.getElementById('email').value = 'demo@pashuraksha.local'; document.getElementById('password').value = 'demo123'; loginForm?.requestSubmit();
});
document.querySelectorAll('.oauth-button').forEach((button) => button.addEventListener('click', async () => {
  const status = document.getElementById('loginStatus'); status.textContent = `Official ${button.dataset.provider} sign-in is not configured for this local build. Add the provider OAuth URL on the server; no password is collected here.`;
}));

async function requireSession() {
  if (loginForm) return true;
  const response = await api('/auth/session'); const data = await response.json();
  if (!data.authenticated) { window.location.replace('login.html'); return false; }
  if (document.body.classList.contains('profile-page')) return true;
  if (!data.user.profileComplete) { window.location.replace('profile.html'); return false; }
  const name = data.user.displayName; const profileName = document.getElementById('profileName'); const profileAvatar = document.getElementById('profileAvatar'); const welcomeName = document.getElementById('welcomeName');
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  if (profileName) profileName.textContent = name; if (profileAvatar) profileAvatar.textContent = initials; if (welcomeName) welcomeName.textContent = name.split(' ')[0];
  const languageSelect = document.getElementById('languageSelect'); if (languageSelect) languageSelect.value = data.user.language || 'mr'; return true;
}

const profileForm = document.getElementById('profileForm');
profileForm?.closest('body')?.classList.add('profile-page');
profileForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); const status = document.getElementById('profileStatus'); status.textContent = 'Saving your profile...';
  if (!profileForm.checkValidity()) { profileForm.reportValidity(); return; }
  try { const response = await api('/profile', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(profileForm).entries())) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.location.href = 'index.html'; } catch (error) { status.textContent = error.message || 'Unable to save your profile.'; }
});

document.getElementById('languageSelect')?.addEventListener('change', async (event) => {
  try { const profileResponse = await api('/profile'); const current = await profileResponse.json(); const profile = current.profile || {}; await api('/profile', { method: 'POST', body: JSON.stringify({ ...profile, preferred_language: event.target.value }) }); window.location.reload(); } catch { alert('Unable to change language right now.'); }
});

async function loadDashboard() {
  const response = await api('/dashboard'); if (!response.ok) return; const data = await response.json(); const stats = data.stats;
  document.getElementById('totalAnimals').textContent = stats.total; document.getElementById('healthyAnimals').textContent = stats.healthy; document.getElementById('mediumAnimals').textContent = stats.medium; document.getElementById('highAnimals').textContent = stats.high;
  document.getElementById('healthyPercent').textContent = `${data.chart.healthy}% of total animals`; document.getElementById('chartTotal').textContent = stats.total; document.getElementById('chartHealthy').textContent = `${data.chart.healthy}%`; document.getElementById('chartMedium').textContent = `${data.chart.medium}%`; document.getElementById('chartHigh').textContent = `${data.chart.high}%`;
  document.getElementById('healthDonut').style.background = `conic-gradient(var(--green) 0 ${data.chart.healthy}%, #86efac ${data.chart.healthy}% ${data.chart.healthy + data.chart.medium}%, #bbf7d0 ${data.chart.healthy + data.chart.medium}% 100%)`;
  document.getElementById('reportRows').innerHTML = data.reports.length ? data.reports.map((report) => { const risk = report.risk_level.toLowerCase(); const status = risk === 'high' ? 'Action needed' : risk === 'medium' ? 'Monitoring' : 'Healthy'; return `<tr><td><strong>PR-${String(report.id).padStart(4, '0')}</strong></td><td><span class="animal-cell"><span class="animal-avatar cow">🐄</span> ${escapeHtml(report.animal_name)}</span></td><td>${new Date(`${report.created_at}Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td><span class="risk ${risk}">${escapeHtml(report.risk_level)}</span></td><td><span class="status ${risk === 'high' ? 'urgent' : ''}"><i></i> ${status}</span></td></tr>`; }).join('') : '<tr><td colspan="5">No health checks yet. Start your first assessment.</td></tr>';
}

async function loadRecords() {
  const response = await api('/health-checks'); if (!response.ok) return;
  const data = await response.json(); const rows = document.getElementById('recordsRows');
  rows.innerHTML = data.records.length ? data.records.map((record) => `<tr><td><strong>${escapeHtml(record.animal_name)}</strong></td><td>${record.temperature} °C</td><td>${new Date(`${record.created_at}Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td><span class="risk ${record.risk_level.toLowerCase()}">${escapeHtml(record.risk_level)}</span></td><td>${escapeHtml(record.recommendation)}</td></tr>`).join('') : '<tr><td colspan="5">No health checks yet.</td></tr>';
}

document.getElementById('healthCheckForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const status = document.getElementById('healthStatus'); const resultBox = document.getElementById('healthResult');
  if (!form.checkValidity()) { form.reportValidity(); return; } status.textContent = 'Calculating...';
  try { const response = await api('/health-checks', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); resultBox.hidden = false; resultBox.innerHTML = `<strong>${escapeHtml(data.result.riskLevel)} risk</strong><span>Risk score: ${data.result.riskScore}/100</span><p>${escapeHtml(data.result.recommendation)}</p>`; status.textContent = 'Health check saved.'; form.reset(); } catch (error) { status.textContent = error.message || 'Unable to complete the health check.'; }
});

document.getElementById('vetSearchForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); const state = document.getElementById('vetState').value.trim(); const district = document.getElementById('vetDistrict').value.trim(); const status = document.getElementById('vetStatus'); const results = document.getElementById('vetResults'); status.textContent = 'Searching verified listings...';
  try { const response = await api(`/vets?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); results.innerHTML = data.results.length ? data.results.map((vet) => `<article class="vet-card"><strong>${escapeHtml(vet.name)}</strong><small>${escapeHtml(vet.clinic_type)} · ${escapeHtml(vet.locality)}, ${escapeHtml(vet.district)}</small><p>${escapeHtml(vet.address)}${vet.phone ? ` · ${escapeHtml(vet.phone)}` : ''}</p></article>`).join('') : `<p class="muted">${escapeHtml(data.message)} Try a broader state or district search, or contact your local government veterinary office.</p>`; status.textContent = ''; } catch (error) { status.textContent = error.message || 'We could not search veterinary listings.'; }
});

function mountChatbot() {
  if (loginForm || document.getElementById('chatbot')) return;
  document.body.insertAdjacentHTML('beforeend', `<section class="chatbot" id="chatbot" aria-label="PashuRaksha assistant"><button class="chatbot-toggle" id="chatbotToggle" type="button" aria-expanded="false"><span>✦</span><span>🐄 Ask Animal Health AI</span></button><div class="chatbot-panel" id="chatbotPanel" hidden><div class="chatbot-header"><div><strong>Animal health assistant</strong><small>Preliminary guidance, not a veterinary diagnosis</small></div><button class="chatbot-close" id="chatbotClose" type="button" aria-label="Close assistant">×</button></div><div class="chatbot-messages" id="chatbotMessages"><p class="chat-message assistant">Namaste. Start a guided health check or ask a question.</p></div><div class="chatbot-controls"><select id="chatLanguage" aria-label="Assistant language"><option value="mr-IN">मराठी</option><option value="hi-IN">हिन्दी</option><option value="en-US">English</option><option value="bn-IN">বাংলা</option><option value="gu-IN">ગુજરાતી</option><option value="kn-IN">ಕನ್ನಡ</option><option value="ml-IN">മലയാളം</option><option value="or-IN">ଓଡ଼ିଆ</option><option value="pa-IN">ਪੰਜਾਬੀ</option><option value="ta-IN">தமிழ்</option><option value="te-IN">తెలుగు</option><option value="as-IN">অসমীয়া</option></select><button id="chatMic" class="chat-icon-button" type="button" aria-label="Speak to assistant" title="Speak to assistant">●</button><label class="chat-upload" title="Upload animal photo">📷<input id="chatPhoto" type="file" accept="image/*" capture="environment" hidden></label></div><button class="chat-start" id="chatStart" type="button">Start new health check</button><form class="chatbot-form" id="chatForm"><input id="chatInput" maxlength="500" autocomplete="off" placeholder="Type your answer..." aria-label="Message"><button type="submit" aria-label="Send message">→</button></form><small class="chatbot-note" id="chatStatus">Use the microphone, photo button, or type an answer.</small></div></section>`);

  const panel = document.getElementById('chatbotPanel'); const toggle = document.getElementById('chatbotToggle'); const close = document.getElementById('chatbotClose'); const form = document.getElementById('chatForm'); const input = document.getElementById('chatInput'); const messages = document.getElementById('chatbotMessages'); const language = document.getElementById('chatLanguage'); const mic = document.getElementById('chatMic'); const status = document.getElementById('chatStatus'); const start = document.getElementById('chatStart'); const photo = document.getElementById('chatPhoto');
  const savedLanguage = document.getElementById('languageSelect')?.value; if (savedLanguage) language.value = `${savedLanguage}-IN`;
  let workflowStep = -1; const workflow = ['animalName', 'animalType', 'temperature', 'behavior', 'appetite', 'symptoms', 'duration']; const answers = {};
  const prompts = { en: ['What is the animal name or ID?', 'What type of animal is it? (cow, buffalo, goat, sheep, dog, cat, poultry, horse, or other)', 'What is the body temperature, if measured? Type skip if unknown.', 'How is the animal behaving? (active, quiet, or lethargic)', 'How is the appetite? (normal, reduced, or none)', 'Describe visible symptoms in your own words.', 'How long have the symptoms been present?'] , mr: ['प्राण्याचे नाव किंवा ओळख क्रमांक काय आहे?', 'हा कोणता प्राणी आहे? (गाय, म्हैस, शेळी, मेंढी किंवा इतर)', 'तापमान मोजले असल्यास सांगा. माहीत नसेल तर skip लिहा.', 'प्राण्याचे वर्तन कसे आहे? (सक्रिय, शांत किंवा सुस्त)', 'भूक कशी आहे? (सामान्य, कमी किंवा नाही)', 'दिसणारी लक्षणे तुमच्या शब्दांत सांगा.', 'लक्षणे किती दिवसांपासून आहेत?'], hi: ['पशु का नाम या पहचान क्या है?', 'यह कौन सा पशु है? (गाय, भैंस, बकरी, भेड़ या अन्य)', 'तापमान मापा हो तो बताएं। पता न हो तो skip लिखें।', 'पशु का व्यवहार कैसा है? (सक्रिय, शांत या सुस्त)', 'भूख कैसी है? (सामान्य, कम या नहीं)', 'दिखने वाले लक्षण अपने शब्दों में बताएं।', 'लक्षण कितने समय से हैं?'] };
  const addMessage = (text, kind) => { const message = document.createElement('p'); message.className = `chat-message ${kind}`; message.textContent = text; messages.appendChild(message); messages.scrollTop = messages.scrollHeight; };
  const speak = (text) => { if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = language.value; window.speechSynthesis.speak(utterance); } };
  const askNext = () => { workflowStep += 1; if (workflowStep >= workflow.length) { submitWorkflow(); return; } const lang = language.value.slice(0, 2); const prompt = prompts[lang]?.[workflowStep] || prompts.en[workflowStep]; addMessage(prompt, 'assistant'); speak(prompt); };
  const startWorkflow = () => { workflowStep = -1; Object.keys(answers).forEach((key) => delete answers[key]); addMessage('Starting a guided health check. I will ask one question at a time.', 'assistant'); askNext(); };
  const submitWorkflow = async () => { status.textContent = 'Preparing preliminary assessment...'; const symptoms = `${answers.symptoms || 'No symptoms reported'}${answers.duration ? ` Duration: ${answers.duration}` : ''}`; const payload = { animalName: answers.animalName, animalType: answers.animalType || 'other', temperature: answers.temperature && answers.temperature !== 'skip' ? answers.temperature : 38.5, appetite: answers.appetite || 'normal', behavior: answers.behavior || 'active', symptoms }; try { const response = await api('/health-checks', { method: 'POST', body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const result = `Preliminary assessment: ${data.result.riskLevel} concern. Risk score ${data.result.riskScore}/100 is an AI estimate, not a diagnosis. ${data.result.recommendation}`; addMessage(result, 'assistant'); speak(result); status.textContent = 'Health check saved. Contact a qualified veterinarian for serious symptoms.'; } catch (error) { addMessage(error.message || 'We could not complete the health check. Please try again.', 'assistant'); status.textContent = 'Try again in a moment.'; } };
  const sendMessage = async () => { const message = input.value.trim(); if (!message) return; addMessage(message, 'user'); input.value = ''; if (workflowStep >= 0) { answers[workflow[workflowStep]] = message; askNext(); return; } status.textContent = 'Thinking...'; try { const response = await api('/chat', { method: 'POST', body: JSON.stringify({ message, language: language.value.slice(0, 2) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); addMessage(data.reply, 'assistant'); speak(data.reply); status.textContent = 'You can ask another question.'; } catch (error) { addMessage(error.message || 'We could not connect to the AI service right now. Please try again.', 'assistant'); status.textContent = 'Try again in a moment.'; } };
  start.addEventListener('click', startWorkflow); photo.addEventListener('change', () => { if (photo.files[0]) { addMessage('Photo selected for preliminary review. A clear photo can help a qualified veterinarian understand the concern.', 'assistant'); status.textContent = 'Photo selected; it has not been used for diagnosis.'; } });
  toggle.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) input.focus(); }); close.addEventListener('click', () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }); form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(); });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { mic.disabled = true; mic.title = 'Speech input is not supported in this browser'; status.textContent = 'Voice input is unavailable; type your message instead.'; return; }
  const recognition = new Recognition(); recognition.interimResults = false; recognition.continuous = false;
  mic.addEventListener('click', () => { recognition.lang = language.value; recognition.start(); mic.classList.add('listening'); status.textContent = 'Listening...'; });
  recognition.onresult = (event) => { input.value = event.results[0][0].transcript; mic.classList.remove('listening'); status.textContent = 'Message captured.'; sendMessage(); }; recognition.onerror = () => { mic.classList.remove('listening'); status.textContent = 'Could not hear that. Please try again or type.'; }; recognition.onend = () => mic.classList.remove('listening');
}

(async () => { try { if (await requireSession()) { if (document.getElementById('reportRows')) await loadDashboard(); if (document.getElementById('recordsRows')) await loadRecords(); if (!profileForm) mountChatbot(); } } catch { if (!loginForm) window.location.replace('login.html'); } })();
