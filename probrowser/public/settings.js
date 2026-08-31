'use strict';
/* Pro Browser — Settings */

document.addEventListener('DOMContentLoaded', () => {
  const s = getSettings();
  const theme = localStorage.getItem('pb-theme') || 'light';

  // Dark mode toggle
  const darkBtn = document.getElementById('darkModeToggle');
  if (darkBtn) { if (theme === 'dark') darkBtn.classList.add('on'); darkBtn.onclick = toggleTheme; }

  // Mode buttons
  const mode = getCurrentMode();
  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  updateModeNote(mode);

  // Security level
  const sec = s.security || 'balanced';
  document.querySelectorAll('.sec-btn[data-sec]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sec === sec);
  });

  // Toggles
  const sh = document.getElementById('searchHistToggle');
  const bh = document.getElementById('browseHistToggle');
  if (sh) { if (s.saveSearchHist === false) sh.classList.remove('on'); }
  if (bh) { if (s.saveBrowseHist === false) bh.classList.remove('on'); }

  // Results per page
  const rpp = document.getElementById('resultsPerPage');
  if (rpp) rpp.value = s.resultsPerPage || '10';

  // Suggestions
  const st = document.getElementById('suggestToggle');
  if (st) { if (s.suggestions === false) st.classList.remove('on'); }

  // AI
  const aip = document.getElementById('aiProvider');
  if (aip) {
    aip.value = s.aiProvider || 'none';
    aip.onchange = () => toggleAIFields(aip.value);
    toggleAIFields(aip.value);
  }
  if (s.aiEndpoint) { const el = document.getElementById('aiEndpoint'); if (el) el.value = s.aiEndpoint; }
  if (s.aiModel)    { const el = document.getElementById('aiModel');    if (el) el.value = s.aiModel; }
  if (s.aiEndpointOAI) { const el = document.getElementById('aiEndpointOAI'); if (el) el.value = s.aiEndpointOAI; }
  if (s.aiModelOAI)    { const el = document.getElementById('aiModelOAI');    if (el) el.value = s.aiModelOAI; }

  // Check ?tab param
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get('tab') === 'mode') {
    document.querySelector('.mode-btns')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

function toggleAIFields(val) {
  document.getElementById('aiOllamaFields').style.display = val === 'ollama' ? '' : 'none';
  document.getElementById('aiOpenAIFields').style.display = val === 'openai' ? '' : 'none';
}

function toggleDark() { toggleTheme(); }

function toggleSetting(key, btn) {
  const s = getSettings();
  const current = s[key] !== false;
  saveSetting(key, !current);
  btn.classList.toggle('on', !current);
}

function setMode(mode) {
  setCurrentMode(mode);
  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  updateModeNote(mode);
  showToast('Mode set to ' + mode);
}

function updateModeNote(mode) {
  const notes = {
    normal: 'Standard browsing. History and suggestions enabled.',
    private: 'Enhanced privacy mode. History is not saved during this session.',
    child: 'Safer experience. Discovery content is filtered for younger users.',
    developer: 'Developer mode. Technical information and extended controls available.',
  };
  const el = document.getElementById('modeNote');
  if (el) el.textContent = notes[mode] || '';
}

function setSec(level) {
  saveSetting('security', level);
  document.querySelectorAll('.sec-btn[data-sec]').forEach(btn => btn.classList.toggle('active', btn.dataset.sec === level));
  showToast('Security: ' + level);
}

function clearSearchHist() { clearSearchHistory(); showToast('Search history cleared'); }
function clearBrowseHist() { clearBrowserHistory(); showToast('Browsing history cleared'); }
function clearAllData() {
  if (!confirm('Clear all browsing data? This cannot be undone.')) return;
  clearSearchHistory(); clearBrowserHistory();
  localStorage.removeItem('pb-bookmarks'); localStorage.removeItem('pb-downloads');
  showToast('All data cleared');
}

function saveAI() {
  const provider = document.getElementById('aiProvider')?.value || 'none';
  saveSetting('aiProvider', provider);
  if (provider === 'ollama') {
    saveSetting('aiEndpoint', document.getElementById('aiEndpoint')?.value || '');
    saveSetting('aiModel', document.getElementById('aiModel')?.value || '');
  } else if (provider === 'openai') {
    saveSetting('aiEndpoint', document.getElementById('aiEndpointOAI')?.value || '');
    saveSetting('aiModel', document.getElementById('aiModelOAI')?.value || '');
    saveSetting('aiApiKey', document.getElementById('aiApiKey')?.value || '');
  }
  // Also sync to server if possible
  const s = getSettings();
  fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(s) }).catch(()=>{});
  showToast('AI settings saved');
}

function resetIdx() {
  if (!confirm('Delete all indexed pages?')) return;
  fetch('/api/admin/reset', { method:'POST' })
    .then(r => r.json()).then(() => showToast('Index reset'))
    .catch(() => showToast('Reset failed'));
}
