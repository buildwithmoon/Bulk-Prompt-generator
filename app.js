// ==========================================
// CONSTANTS & DEFAULT PRESETS
// ==========================================

const DEFAULT_SYSTEM_PROMPT = `# SYSTEM INSTRUCTIONS: Manhwa/Anime Recap Image Prompt Generator

You are an expert AI image prompt engineer specializing in generating highly descriptive prompts for Midjourney to create consistent, story-accurate visual panels for Manhwa and Anime recap videos.

## 1. Style Lock & Consistency
Every generated prompt must begin with this exact, unmodified style prefix:
"Modern manhwa illustration style, dynamic anime digital art, "

## 2. Character Consistency Rule
- You must review the Character Descriptions provided in the context.
- Whenever a character appears in a scene, their descriptive keywords (e.g. hair style/color, eyes, specific clothing, distinct physical traits) must be copied VERBATIM into the prompt text.
- Do not summarize, shorten, or paraphrase character descriptions. This maintains visual consistency across frames.
- Maximum of 2 characters are allowed per frame. If the script line involves more, focus on the two main active characters.

## 3. Image Restrictions & Negative Prompts
- Never include text, lettering, words, logos, brand names, religious symbols, signatures, or watermarks in the prompt or in the output image.
- Avoid abstract representations; describe concrete, visual actions.

## 4. Prompt Structure and Word Count
Each prompt must be structured as follows:
[Style Prefix] [Verbatim Character Descriptions if present] [Visual Action and Environment details based on the Script Line] [Lighting and Camera Shot Type] [Quality descriptors] [Parameters]

- The prompt text (excluding the final parameters) must be strictly between 40 and 60 words.
- Keep descriptions concrete, dynamic, and visually striking.

## 5. Camera Angles & Shot Type Library
Rotate camera angles and shot types across scenes to maintain dynamic pacing. Use selections from this library:
- **Extreme Close-Up (ECU)**: Focusing on eyes, a hand gripping a weapon, or a subtle facial expression.
- **Close-Up (CU)**: High emotional impact, focusing on a single character's face.
- **Medium Shot (MS)**: Showing characters from the waist up, showing both character details and some environment.
- **Wide / Establishing Shot (WS)**: Showing full characters and their complete surroundings, great for new settings.
- **Low-Angle Shot**: Looking up at a character to make them appear powerful, threatening, or heroic.
- **High-Angle Shot**: Looking down at a character to make them appear vulnerable or defeated.
- **Dutch Angle**: Tilted frame to indicate chaos, tension, or psychological distress.
- **Over-The-Shoulder (OTS)**: Looking over one character's shoulder at another character, great for conversations or face-offs.

## 6. Lighting Library
Incorporate atmospheric lighting to match the mood of the scene:
- **Dramatic Backlighting / Rim Light**: Creates a glowing outline around characters, adding intensity.
- **Volumetric Light Rays**: Sunbeams or magic light filtering through clouds, dust, or windows.
- **Neon Glow**: Vibrant sci-fi or magic lighting casting colored light on surroundings.
- **Cinematic Sunset**: Warm, golden-hour light casting long shadows.
- **Chiaroscuro / High Contrast**: Sharp contrast between deep shadows and bright light.
- **Soft Ethereal Glow**: Gentle, diffused light for mystical or peaceful scenes.

## 8. Parameters
Every prompt must end with this exact parameter block:
\`--ar 16:9 --style anime\`
`;

// ==========================================
// STATE MANAGEMENT
// ==========================================
let state = {
  apiKeys: [], // { key: string, label: string, status: 'idle'|'active'|'rate-limited'|'failed', cooldownUntil: number }
  parsedLines: [], // { index: number, timestamp: string|null, text: string }
  generationQueue: [], // chunks to process
  runningWorkers: 0,
  isGenerating: false,
  results: [], // Array of prompt objects at original indices: { index, timestamp, scriptLine, shotType, promptText }
  metrics: {
    totalLines: 0,
    totalChunks: 0,
    completedChunks: 0,
    retries: 0,
    failures: 0
  },
  currentActiveKeyIndex: 0
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const elements = {
  btnToggleSettings: document.getElementById('btn-toggle-settings'),
  settingsPanel: document.getElementById('settings-panel'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  inputApiKey: document.getElementById('input-api-key'),
  btnAddKey: document.getElementById('btn-add-key'),
  keysContainer: document.getElementById('keys-container'),
  
  selectModel: document.getElementById('select-model'),
  inputChunkSize: document.getElementById('input-chunk-size'),
  inputConcurrency: document.getElementById('input-concurrency'),
  
  inputTone: document.getElementById('input-tone'),
  inputWorld: document.getElementById('input-world'),
  inputPower: document.getElementById('input-power'),
  inputCharacter: document.getElementById('input-character'),
  toggleToneNotRequired: document.getElementById('toggle-tone-not-required'),
  toggleWorldNotRequired: document.getElementById('toggle-world-not-required'),
  togglePowerNotRequired: document.getElementById('toggle-power-not-required'),
  toggleCharacterNotRequired: document.getElementById('toggle-character-not-required'),
  
  fileUpload: document.getElementById('file-upload'),
  inputScript: document.getElementById('input-script'),
  btnResetPrompt: document.getElementById('btn-reset-prompt'),
  inputBasePrompt: document.getElementById('input-base-prompt'),
  btnGenerate: document.getElementById('btn-generate'),
  
  dashboardSection: document.getElementById('dashboard-section'),
  dashboardStatusText: document.getElementById('dashboard-status-text'),
  btnRetryFailed: document.getElementById('btn-retry-failed'),
  btnCancelGeneration: document.getElementById('btn-cancel-generation'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  progressTextFraction: document.getElementById('progress-text-fraction'),
  progressTextPercent: document.getElementById('progress-text-percent'),
  
  statTotalLines: document.getElementById('stat-total-lines'),
  statTotalChunks: document.getElementById('stat-total-chunks'),
  statCompleted: document.getElementById('stat-completed'),
  statRetries: document.getElementById('stat-retries'),
  statFailures: document.getElementById('stat-failures'),
  keyActivityGrid: document.getElementById('key-activity-grid'),
  
  resultsSection: document.getElementById('results-section'),
  resultsMetaText: document.getElementById('results-meta-text'),
  btnRetryFailedResults: document.getElementById('btn-retry-failed-results'),
  btnCopyAll: document.getElementById('btn-copy-all'),
  btnDownloadTxt: document.getElementById('btn-download-txt'),
  btnDownloadCsv: document.getElementById('btn-download-csv'),
  inputSearchPrompts: document.getElementById('input-search-prompts'),
  resultsTableBody: document.getElementById('results-table-body'),
  
  btnHookThumbnail: document.getElementById('btn-hook-thumbnail'),
  btnHookSeo: document.getElementById('btn-hook-seo'),
  hookModal: document.getElementById('hook-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalBodyContent: document.getElementById('modal-body-content')
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  setupEventListeners();
  
  // Set default system prompt if empty
  if (!elements.inputBasePrompt.value.trim()) {
    elements.inputBasePrompt.value = DEFAULT_SYSTEM_PROMPT;
  }
  
  // Try fetching base_prompt_animerecap.md from server
  fetch('base_prompt_animerecap.md')
    .then(response => {
      if (response.ok) return response.text();
      throw new Error('Local template file not found, using embedded template');
    })
    .then(text => {
      if (text.trim()) {
        elements.inputBasePrompt.value = text;
        saveToLocalStorage();
      }
    })
    .catch(err => console.log('Notice: using embedded fallback system instructions.', err));

  // Re-apply character toggle state on load
  applyToggleState('character', elements.toggleCharacterNotRequired.checked);
});

// ==========================================
// LOCAL STORAGE & PERSISTENCE
// ==========================================
function saveToLocalStorage() {
  localStorage.setItem('gemini_api_keys', JSON.stringify(state.apiKeys));
  localStorage.setItem('base_system_prompt', elements.inputBasePrompt.value);
  
  localStorage.setItem('story_character_descriptions', elements.inputCharacter.value);
  localStorage.setItem('story_tone', elements.inputTone.value);
  localStorage.setItem('story_world', elements.inputWorld.value);
  localStorage.setItem('story_power', elements.inputPower.value);
  localStorage.setItem('settings_model', elements.selectModel.value);
  localStorage.setItem('settings_chunk_size', elements.inputChunkSize.value);
  localStorage.setItem('settings_concurrency', elements.inputConcurrency.value);
  
  // Save toggles
  localStorage.setItem('toggle_tone_not_required', elements.toggleToneNotRequired.checked);
  localStorage.setItem('toggle_world_not_required', elements.toggleWorldNotRequired.checked);
  localStorage.setItem('toggle_power_not_required', elements.togglePowerNotRequired.checked);
  localStorage.setItem('toggle_character_not_required', elements.toggleCharacterNotRequired.checked);
}

function loadFromLocalStorage() {
  try {
    const keys = localStorage.getItem('gemini_api_keys');
    if (keys) {
      state.apiKeys = JSON.parse(keys).map(k => ({
        ...k,
        status: 'idle',
        cooldownUntil: 0,
        lastUsed: 0,
        consecutiveRateLimits: 0
      }));
      renderKeys();
    }
    
    const prompt = localStorage.getItem('base_system_prompt');
    if (prompt) {
      elements.inputBasePrompt.value = prompt;
    }
    
    elements.inputCharacter.value = localStorage.getItem('story_character_descriptions') || "";
    elements.inputTone.value = localStorage.getItem('story_tone') || "Dark fantasy, intense, high-stakes, epic action";
    elements.inputWorld.value = localStorage.getItem('story_world') || "";
    elements.inputPower.value = localStorage.getItem('story_power') || "";
    
    elements.selectModel.value = localStorage.getItem('settings_model') || "gemini-2.5-flash";
    elements.inputChunkSize.value = localStorage.getItem('settings_chunk_size') || "10";
    elements.inputConcurrency.value = localStorage.getItem('settings_concurrency') || "3";

    // Load toggles
    elements.toggleToneNotRequired.checked = localStorage.getItem('toggle_tone_not_required') === 'true';
    elements.toggleWorldNotRequired.checked = localStorage.getItem('toggle_world_not_required') === 'true';
    elements.togglePowerNotRequired.checked = localStorage.getItem('toggle_power_not_required') === 'true';
    elements.toggleCharacterNotRequired.checked = localStorage.getItem('toggle_character_not_required') === 'true';
    
    // Apply visual disabled states
    applyToggleState('tone', elements.toggleToneNotRequired.checked);
    applyToggleState('world', elements.toggleWorldNotRequired.checked);
    applyToggleState('power', elements.togglePowerNotRequired.checked);
    applyToggleState('character', elements.toggleCharacterNotRequired.checked);
  } catch (e) {
    console.error("Failed to load local storage configurations", e);
  }
}

// ==========================================
// INTERFACE CONTROLS & LISTENERS
// ==========================================
function setupEventListeners() {
  // Settings Drawer Toggle
  elements.btnToggleSettings.addEventListener('click', () => {
    elements.settingsPanel.classList.toggle('hidden');
  });
  elements.btnCloseSettings.addEventListener('click', () => {
    elements.settingsPanel.classList.add('hidden');
  });
  
  // API Key Management
  elements.btnAddKey.addEventListener('click', addApiKey);
  elements.inputApiKey.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addApiKey();
  });
  
  // Save settings on input blur
  const autoSaveSelectors = [
    elements.inputTone, elements.inputWorld, elements.inputPower, elements.inputCharacter,
    elements.inputBasePrompt, elements.selectModel, elements.inputChunkSize, elements.inputConcurrency
  ];
  autoSaveSelectors.forEach(el => {
    el.addEventListener('blur', saveToLocalStorage);
    el.addEventListener('change', saveToLocalStorage);
  });
  
  // Generate Event
  elements.btnGenerate.addEventListener('click', startGeneration);
  elements.btnCancelGeneration.addEventListener('click', cancelGeneration);
  
  // Results Actions
  elements.btnCopyAll.addEventListener('click', copyAllPromptsToClipboard);
  elements.btnDownloadTxt.addEventListener('click', downloadTXTFile);
  elements.btnDownloadCsv.addEventListener('click', downloadCSVFile);
  elements.inputSearchPrompts.addEventListener('input', filterResultsTable);
  
  // Retry Actions
  elements.btnRetryFailed.addEventListener('click', retryFailedChunks);
  elements.btnRetryFailedResults.addEventListener('click', retryFailedChunks);
  
  // Modals close
  elements.btnCloseModal.addEventListener('click', () => elements.hookModal.classList.add('hidden'));
  window.addEventListener('click', (e) => {
    if (e.target === elements.hookModal) elements.hookModal.classList.add('hidden');
  });
  
  // Hook Buttons
  elements.btnHookThumbnail.addEventListener('click', generateThumbnailPrompts);
  elements.btnHookSeo.addEventListener('click', generateYoutubeSEO);
  
  // Toggles event listeners
  ['tone', 'world', 'power', 'character'].forEach(type => {
    const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
    const toggleEl = elements[`toggle${capitalized}NotRequired`];
    if (toggleEl) {
      toggleEl.addEventListener('change', () => {
        applyToggleState(type, toggleEl.checked);
        saveToLocalStorage();
      });
    }
  });
}

// Visual state toggler helper
function applyToggleState(type, isNotRequired) {
  if (type === 'tone') {
    elements.inputTone.disabled = isNotRequired;
  } else if (type === 'world') {
    elements.inputWorld.disabled = isNotRequired;
  } else if (type === 'power') {
    elements.inputPower.disabled = isNotRequired;
  } else if (type === 'character') {
    elements.inputCharacter.disabled = isNotRequired;
  }
}

// ==========================================
// API KEY MANAGER FUNCTIONS
// ==========================================
function addApiKey() {
  const key = elements.inputApiKey.value.trim();
  if (!key) return;
  
  // Check duplicates
  if (state.apiKeys.some(item => item.key === key)) {
    alert("This API key has already been added.");
    return;
  }
  
  // Label key for display (partially obscured)
  const label = key.slice(0, 6) + '...' + key.slice(-4);
  state.apiKeys.push({
    key: key,
    label: label,
    status: 'idle',
    cooldownUntil: 0,
    lastUsed: 0,
    consecutiveRateLimits: 0
  });
  
  elements.inputApiKey.value = '';
  renderKeys();
  saveToLocalStorage();
}

function removeApiKey(index) {
  state.apiKeys.splice(index, 1);
  renderKeys();
  saveToLocalStorage();
}

function toggleKeyStatus(index) {
  const key = state.apiKeys[index];
  key.status = key.status === 'failed' ? 'idle' : 'failed';
  renderKeys();
}

function renderKeys() {
  if (state.apiKeys.length === 0) {
    elements.keysContainer.innerHTML = `<div class="no-keys-alert">No API keys added yet. Add at least one key to start generating.</div>`;
    return;
  }
  
  elements.keysContainer.innerHTML = state.apiKeys.map((key, i) => {
    const statusClass = key.status === 'active' ? 'active' : key.status === 'rate-limited' ? 'rate-limited' : key.status === 'failed' ? 'failed' : '';
    const statusText = key.status.toUpperCase();
    return `
      <div class="key-badge">
        <span class="key-status-dot ${statusClass}" title="Status: ${statusText}"></span>
        <span class="key-text" title="${key.key}">${key.label}</span>
        <button class="btn-toggle-key-active btn-text-action" style="font-size:0.75rem; color: var(--color-muted);" onclick="window.toggleKeyActiveStatus(${i})">
          ${key.status === 'failed' ? 'Enable' : 'Disable'}
        </button>
        <button class="btn-delete-key" onclick="window.removeKeyIndex(${i})">&times;</button>
      </div>
    `;
  }).join('');
}

// Attach helpers to window scope for HTML inline calls
window.removeKeyIndex = removeApiKey;
window.toggleKeyActiveStatus = toggleKeyStatus;

// ==========================================
// CHARACTER EDITOR DYNAMICS (REPLACED BY SIMPLE TEXTAREA)
// ==========================================

// ==========================================
// SRT & TXT SUBTITLE PARSING
// ==========================================
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    elements.inputScript.value = evt.target.result;
    parseScriptInput();
  };
  reader.readAsText(file);
}

function parseScriptInput() {
  const text = elements.inputScript.value.trim();
  if (!text) {
    state.parsedLines = [];
    return;
  }
  
  // Check if content matches SRT format: starts with number followed by timestamp
  const isSrt = /^\d+\r?\n\d{2}:\d{2}:\d{2}/.test(text);
  
  if (isSrt) {
    state.parsedLines = parseSRT(text);
  } else {
    state.parsedLines = parsePlainText(text);
  }
}

function parseSRT(data) {
  // Regex to split SRT subtitle blocks
  // Format: [Index]\n[Timestamp Range]\n[Text block]\n\n
  const regex = /^\d+\r?\n(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/gm;
  let matches;
  const results = [];
  
  while ((matches = regex.exec(data)) !== null) {
    const timestamp = `${matches[1]} --> ${matches[2]}`;
    // Clean text lines
    const text = matches[3]
      .replace(/<[^>]*>/g, '') // remove HTML styling tags if present
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join(' ');
      
    if (text) {
      results.push({
        index: results.length + 1,
        timestamp: timestamp,
        text: text
      });
    }
  }
  
  // Fallback in case regex matching fails completely but file is SRT structured
  if (results.length === 0) {
    return parsePlainText(data);
  }
  
  return results;
}

function parsePlainText(data) {
  return data
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, i) => {
      return {
        index: i + 1,
        timestamp: null,
        text: line
      };
    });
}

// ==========================================
// CHUNKING AND PARALLEL PROCESSING QUEUE
// ==========================================
function startGeneration() {
  if (state.isGenerating) return;
  
  // Parse script first to capture recent text changes
  parseScriptInput();
  
  if (state.apiKeys.filter(k => k.status !== 'failed').length === 0) {
    alert("Please add and enable at least one Gemini API key in the settings drawer.");
    elements.settingsPanel.classList.remove('hidden');
    return;
  }
  
  if (state.parsedLines.length === 0) {
    alert("Please paste a script or upload an SRT file to generate prompts.");
    return;
  }
  
  // Read parameters
  const chunkSize = Math.max(1, Math.min(50, parseInt(elements.inputChunkSize.value) || 10));
  const maxConcurrency = Math.max(1, Math.min(10, parseInt(elements.inputConcurrency.value) || 3));
  
  // Prep UI
  state.isGenerating = true;
  elements.btnGenerate.disabled = true;
  elements.btnGenerate.innerHTML = `<span class="loading-dots">Generating Prompts</span>`;
  
  elements.dashboardSection.classList.remove('hidden');
  elements.resultsSection.classList.remove('hidden'); // Show results table immediately
  
  // Split parsedLines into chunks
  state.generationQueue = [];
  for (let i = 0; i < state.parsedLines.length; i += chunkSize) {
    const chunkLines = state.parsedLines.slice(i, i + chunkSize);
    state.generationQueue.push({
      chunkIndex: state.generationQueue.length,
      lines: chunkLines,
      retries: 0,
      rateLimitRetries: 0,
      status: 'pending'
    });
  }
  
  // Init Metrics & Array to store outputs
  state.results = new Array(state.parsedLines.length);
  state.metrics = {
    totalLines: state.parsedLines.length,
    totalChunks: state.generationQueue.length,
    completedChunks: 0,
    retries: 0,
    failures: 0
  };
  
  // Render placeholders immediately
  renderResultsTable();
  updateDashboardUI();
  updateRetryButtonsVisibility();
  
  // Launch workers
  state.runningWorkers = 0;
  const workersToLaunch = Math.min(maxConcurrency, state.generationQueue.length);
  
  for (let w = 0; w < workersToLaunch; w++) {
    state.runningWorkers++;
    processNextQueueItem();
  }
}

async function processNextQueueItem() {
  if (!state.isGenerating) {
    state.runningWorkers--;
    checkGenerationCompletion();
    return;
  }
  
  // Find first pending chunk
  const chunk = state.generationQueue.find(c => c.status === 'pending');
  if (!chunk) {
    state.runningWorkers--;
    checkGenerationCompletion();
    return;
  }
  
  chunk.status = 'generating';
  
  // Update UI rows for these lines to show generating state
  chunk.lines.forEach(line => {
    if (elements.inputSearchPrompts.value.trim() !== '') {
      renderResultsTable();
    } else {
      updateRowDOM(line.index);
    }
  });
  
  updateDashboardUI();
  updateRetryButtonsVisibility();
  
  // Pick active API key (load balanced & paced)
  const apiKeyObj = getAvailableApiKey();
  if (!apiKeyObj) {
    // Wait for a key to cool down or pace and try again
    chunk.status = 'pending';
    
    // Update UI rows back to pending status
    chunk.lines.forEach(line => {
      if (elements.inputSearchPrompts.value.trim() !== '') {
        renderResultsTable();
      } else {
        updateRowDOM(line.index);
      }
    });
    
    updateDashboardUI();
    updateRetryButtonsVisibility();
    
    // Re-check after a brief pause
    setTimeout(() => {
      if (state.isGenerating && state.runningWorkers < parseInt(elements.inputConcurrency.value)) {
        state.runningWorkers++;
        processNextQueueItem();
      }
    }, 2000);
    
    state.runningWorkers--;
    return;
  }
  
  // Mark key as active in dashboard key visual grid
  apiKeyObj.status = 'active';
  renderKeyActivityDashboard();
  
  try {
    const generatedPrompts = await callGeminiAPI(chunk, apiKeyObj);
    apiKeyObj.consecutiveRateLimits = 0; // reset consecutive rate limits on success
    
    // Validate output structure matches length of chunk
    if (!Array.isArray(generatedPrompts) || generatedPrompts.length !== chunk.lines.length) {
      throw new Error(`API returned invalid count: got ${generatedPrompts ? generatedPrompts.length : 0}, expected ${chunk.lines.length}`);
    }
    
    // Store outputs matching original global line indices
    chunk.lines.forEach((line, indexInChunk) => {
      const generated = generatedPrompts[indexInChunk];
      const globalIndex = line.index - 1; // 0-indexed position
      
      state.results[globalIndex] = {
        index: line.index,
        timestamp: line.timestamp,
        scriptLine: line.text,
        shotType: generated.shotType || "Medium Shot",
        promptText: generated.promptText
      };
    });
    
    chunk.status = 'completed';
    state.metrics.completedChunks++;
    apiKeyObj.status = 'idle';
    
    // Update completed rows immediately
    chunk.lines.forEach(line => {
      if (elements.inputSearchPrompts.value.trim() !== '') {
        renderResultsTable();
      } else {
        updateRowDOM(line.index);
      }
    });
    
  } catch (err) {
    console.error(`Error processing chunk ${chunk.chunkIndex}:`, err);
    state.metrics.retries++;
    
    const isRateLimit = err.status === 429 || (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('Quota')));
    
    // Cooldown API key on 429 rate limit or general block
    if (isRateLimit) {
      chunk.rateLimitRetries = (chunk.rateLimitRetries || 0) + 1;
      apiKeyObj.status = 'rate-limited';
      apiKeyObj.consecutiveRateLimits = (apiKeyObj.consecutiveRateLimits || 0) + 1;
      // Exponential backoff, up to 10 minutes (600,000ms) to allow recovery from TPM/RPM limits
      const penalty = err.retryAfter || (Math.min(600, 15 * Math.pow(2, apiKeyObj.consecutiveRateLimits - 1)) * 1000);
      apiKeyObj.cooldownUntil = Date.now() + penalty;
      console.warn(`Key ${apiKeyObj.label} rate limited. Cooling down for ${penalty / 1000}s...`);
    } else {
      chunk.retries = (chunk.retries || 0) + 1;
      apiKeyObj.status = 'idle'; // Generic error
    }
    
    if ((chunk.retries || 0) >= 4 || (chunk.rateLimitRetries || 0) >= 100) {
      // Chunk permanently failed
      chunk.status = 'failed';
      state.metrics.failures++;
      
      // Fill results spot with error placeholder so sequence isn't broken
      chunk.lines.forEach(line => {
        state.results[line.index - 1] = {
          index: line.index,
          timestamp: line.timestamp,
          scriptLine: line.text,
          shotType: "Failed",
          promptText: `[FAILED TO GENERATE PROMPT: Rate limits exceeded or API blocked response for this line]`
        };
      });
    } else {
      // Re-queue
      chunk.status = 'pending';
    }
    
    // Update failed rows immediately
    chunk.lines.forEach(line => {
      if (elements.inputSearchPrompts.value.trim() !== '') {
        renderResultsTable();
      } else {
        updateRowDOM(line.index);
      }
    });
  }
  
  renderKeyActivityDashboard();
  updateDashboardUI();
  updateRetryButtonsVisibility();
  
  // Continue processing queue
  processNextQueueItem();
}

function getAvailableApiKey() {
  const activeKeys = state.apiKeys.filter(k => k.status !== 'failed');
  if (activeKeys.length === 0) return null;
  
  const now = Date.now();
  // Filter out rate-limited keys that are still in cooldown
  const availableKeys = activeKeys.filter(k => {
    if (k.cooldownUntil > 0 && k.cooldownUntil > now) {
      return false;
    }
    // reset status if cooldown over
    if (k.status === 'rate-limited' && k.cooldownUntil <= now) {
      k.status = 'idle';
      k.cooldownUntil = 0;
    }
    return true;
  });
  
  if (availableKeys.length === 0) return null;
  
  // Sort available keys by lastUsed (ascending) so the one used longest ago is chosen first
  availableKeys.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
  
  const bestKey = availableKeys[0];
  
  // Pacing: enforce 4500ms delay between requests on the same key (safe margin for 15 RPM)
  const minDelay = 4500;
  const timeSinceLastUse = now - (bestKey.lastUsed || 0);
  if (timeSinceLastUse < minDelay) {
    return null;
  }
  
  bestKey.lastUsed = now;
  return bestKey;
}

// ==========================================
// GEMINI API FETCH CALL
// ==========================================
async function callGeminiAPI(chunk, apiKeyObj) {
  const apiKey = apiKeyObj.key;
  let systemPrompt = elements.inputBasePrompt.value;
  const tone = elements.inputTone.value;
  const world = elements.inputWorld.value;
  const power = elements.inputPower.value;
  const character = elements.inputCharacter.value;
  
  const toneNotRequired = elements.toggleToneNotRequired.checked;
  const worldNotRequired = elements.toggleWorldNotRequired.checked;
  const powerNotRequired = elements.togglePowerNotRequired.checked;
  const characterNotRequired = elements.toggleCharacterNotRequired.checked;
  
  // Dynamic system prompt cleaning: strip instructions matching disabled modules
  if (characterNotRequired) {
    // Drop Character Consistency section (Section 2)
    systemPrompt = systemPrompt.replace(/## 2\.\s+Character Consistency Rule[\s\S]*?(?=(## 3\.)|#|$)/i, "");
    // Remove characters from prompt structure definition in Section 4
    systemPrompt = systemPrompt.replace(/\[Verbatim Character Descriptions[^\]]*\]\s*/gi, "");
  }
  
  // Map lines list to prompt request block
  const linesPayload = chunk.lines.map((l, i) => `Line ${i + 1} (Global Sequence #${l.index}): "${l.text}"`).join('\n');
  
  let promptBody = `STORY CONTEXT SETUP:\n`;
  if (!toneNotRequired) {
    promptBody += `- Overall Tone/Vibe: ${tone}\n`;
  }
  if (!worldNotRequired) {
    promptBody += `- World Setting Rules: ${world}\n`;
  }
  if (!powerNotRequired) {
    promptBody += `- Power System Visuals: ${power}\n`;
  }
  if (!characterNotRequired) {
    promptBody += `- Character Descriptions: ${character}\n`;
  }
  
  promptBody += `\nGENERATE DETAILED MIDJOURNEY PROMPTS FOR THESE SCRIPT LINES:\n${linesPayload}\n\n`;
  promptBody += `Generate exactly ${chunk.lines.length} prompts matching the order of the lines above.\n`;
  promptBody += `Ensure every prompt starts with the exact style prefix: "Modern manhwa illustration style, dynamic anime digital art, ".\n`;
  
  if (!characterNotRequired) {
    promptBody += `Incorporate verbatim matching character description elements into promptText when characters are active.\n`;
  }
  
  promptBody += `Ensure promptText is 40-60 words long (excluding Midjourney parameters).\n`;
  promptBody += `Make sure to append parameters "--ar 16:9 --style anime" at the end of every prompt.\n`;

  const model = elements.selectModel.value;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  // Define Schema rules for strict output parsing
  const requestBody = {
    contents: [{
      parts: [{
        text: systemPrompt + "\n\n" + promptBody
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          prompts: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                sequenceNumber: { type: "INTEGER", description: "The index of this line inside this chunk (1 to " + chunk.lines.length + ")" },
                scriptLine: { type: "STRING" },
                shotType: { type: "STRING" },
                promptText: { type: "STRING" }
              },
              required: ["sequenceNumber", "scriptLine", "shotType", "promptText"]
            }
          }
        },
        required: ["prompts"]
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let retryAfter = null;
    try {
      const retryAfterHeader = response.headers.get('retry-after');
      if (retryAfterHeader) {
        if (/^\d+$/.test(retryAfterHeader)) {
          retryAfter = parseInt(retryAfterHeader) * 1000;
        } else {
          const parsedDate = Date.parse(retryAfterHeader);
          if (!isNaN(parsedDate)) {
            retryAfter = Math.max(0, parsedDate - Date.now());
          }
        }
      }
    } catch (headerErr) {
      console.warn("Failed to parse retry-after header", headerErr);
    }
    
    const errorText = await response.text();
    const err = new Error(`Gemini API Error: Status ${response.status} - ${errorText}`);
    err.status = response.status;
    err.retryAfter = retryAfter;
    throw err;
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
    throw new Error("Invalid structure returned by Gemini API (missing content fields)");
  }
  
  const textResponse = data.candidates[0].content.parts[0].text;
  const parsedJSON = JSON.parse(textResponse);
  
  if (!parsedJSON.prompts || !Array.isArray(parsedJSON.prompts)) {
    throw new Error("Missing 'prompts' array in JSON response");
  }
  
  // Sort returned prompts by sequenceNumber to ensure we match the chunk sequence
  parsedJSON.prompts.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  
  return parsedJSON.prompts;
}

// ==========================================
// RESULTS DISPLAY & MANAGEMENT
// ==========================================
function updateDashboardUI() {
  // Update progress bar
  const total = state.metrics.totalChunks;
  const completed = state.metrics.completedChunks;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  elements.progressBarFill.style.width = `${percent}%`;
  elements.progressTextPercent.textContent = `${percent}%`;
  
  const processedLinesCount = state.results.filter(r => r !== undefined).length;
  elements.progressTextFraction.textContent = `${processedLinesCount} / ${state.metrics.totalLines} Prompts Processed`;
  
  elements.statTotalLines.textContent = state.metrics.totalLines;
  elements.statTotalChunks.textContent = state.metrics.totalChunks;
  elements.statCompleted.textContent = completed;
  elements.statRetries.textContent = state.metrics.retries;
  elements.statFailures.textContent = state.metrics.failures;
}

function renderKeyActivityDashboard() {
  elements.keyActivityGrid.innerHTML = state.apiKeys.map(key => {
    let keyStatusClass = 'cooling-down';
    let activityText = 'Idle';
    
    if (key.status === 'active') {
      keyStatusClass = 'generating';
      activityText = 'Generating chunk...';
    } else if (key.status === 'failed') {
      keyStatusClass = 'cooling-down';
      activityText = 'Disabled';
    } else if (key.status === 'rate-limited') {
      keyStatusClass = 'cooling-down';
      const timeLeft = Math.max(0, Math.round((key.cooldownUntil - Date.now()) / 1000));
      activityText = `Cooldown: ${timeLeft}s`;
    }
    
    return `
      <div class="key-activity-card">
        <span class="key-status-dot ${key.status === 'active' ? 'active' : key.status === 'rate-limited' ? 'rate-limited' : ''}"></span>
        <div>
          <span style="font-weight:600; display:block;">${key.label}</span>
          <span class="key-activity-status ${keyStatusClass}">${activityText}</span>
        </div>
      </div>
    `;
  }).join('');
}

function cancelGeneration() {
  if (!state.isGenerating) return;
  state.isGenerating = false;
  elements.btnGenerate.disabled = false;
  elements.btnGenerate.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Generate Bulk Prompts`;
  elements.dashboardStatusText.textContent = "Run cancelled by user.";
  
  // Reset active workers to pending
  state.generationQueue.forEach(chunk => {
    if (chunk.status === 'generating') {
      chunk.status = 'pending';
    }
  });
  
  renderResultsTable();
  updateRetryButtonsVisibility();
}

function checkGenerationCompletion() {
  if (state.runningWorkers === 0) {
    state.isGenerating = false;
    elements.btnGenerate.disabled = false;
    elements.btnGenerate.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Generate Bulk Prompts`;
    
    // Display result dashboard
    elements.dashboardStatusText.textContent = "Prompt generation run complete!";
    elements.resultsSection.classList.remove('hidden');
    
    renderResultsTable();
    updateRetryButtonsVisibility();
  }
}

function renderResultsTable() {
  const filteredQuery = elements.inputSearchPrompts.value.toLowerCase();
  elements.resultsTableBody.innerHTML = '';
  
  let validResultsCount = 0;
  
  state.parsedLines.forEach((line, i) => {
    const res = state.results[i];
    const scriptText = line.text;
    const promptText = res ? res.promptText : '';
    const indexStr = line.index.toString();
    
    const matchSearch = scriptText.toLowerCase().includes(filteredQuery) || 
                        promptText.toLowerCase().includes(filteredQuery) ||
                        indexStr.includes(filteredQuery);
                        
    if (!matchSearch) return;
    
    validResultsCount++;
    
    const tr = document.createElement('tr');
    tr.id = `result-row-${line.index}`;
    elements.resultsTableBody.appendChild(tr);
    
    updateRowDOM(line.index);
  });
  
  elements.resultsMetaText.textContent = `Displaying ${validResultsCount} of ${state.parsedLines.length} order-locked, strictly sequential prompts.`;
}

function filterResultsTable() {
  renderResultsTable();
}

function updateRowDOM(lineIndex) {
  const rowEl = document.getElementById(`result-row-${lineIndex}`);
  if (!rowEl) return;
  
  const res = state.results[lineIndex - 1];
  const line = state.parsedLines[lineIndex - 1];
  if (!line) return;
  
  const chunk = state.generationQueue.find(c => c.lines.some(l => l.index === lineIndex));
  const chunkStatus = chunk ? chunk.status : 'pending';
  
  const formattedIndex = String(lineIndex).padStart(3, '0');
  
  let shotTypeHtml = '';
  let promptHtml = '';
  let actionHtml = '';
  
  if (chunkStatus === 'completed' && res) {
    shotTypeHtml = res.shotType;
    promptHtml = `<div class="prompt-cell" id="prompt-text-${lineIndex}">${res.promptText}</div>`;
    actionHtml = `
      <button class="btn-icon-only btn-copy" onclick="window.copyPromptToClipboard(${lineIndex})" title="Copy Prompt">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
    `;
  } else if (chunkStatus === 'failed') {
    shotTypeHtml = `<span class="badge badge-danger">Failed</span>`;
    const errMsg = res ? res.promptText : '[FAILED TO GENERATE PROMPT: Rate limits exceeded or API blocked response for this line]';
    promptHtml = `<div class="prompt-cell failed">${errMsg}</div>`;
    actionHtml = `
      <button class="btn-icon-only btn-retry-inline" onclick="window.retryLineChunk(${lineIndex})" title="Retry Line Chunk" style="border-color: var(--color-warning);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
      </button>
    `;
  } else if (chunkStatus === 'generating') {
    shotTypeHtml = `<span class="loading-dots" style="color: var(--color-accent);">Generating</span>`;
    promptHtml = `<div class="prompt-cell" style="border-color: var(--color-accent-glow);"><span class="loading-dots" style="color: var(--color-accent);">Processing on key...</span></div>`;
    actionHtml = ``;
  } else {
    shotTypeHtml = `<span style="color: var(--color-muted);">In Queue</span>`;
    promptHtml = `<div class="prompt-cell" style="opacity: 0.5; font-style: italic; color: var(--color-muted);">Waiting in queue...</div>`;
    actionHtml = ``;
  }
  
  rowEl.innerHTML = `
    <td class="index-cell">${formattedIndex}</td>
    <td class="script-cell">
      <div>${line.text}</div>
      ${line.timestamp ? `<div class="timestamp-text">${line.timestamp}</div>` : ''}
    </td>
    <td class="shot-cell">${shotTypeHtml}</td>
    <td>${promptHtml}</td>
    <td class="text-center">${actionHtml}</td>
  `;
}

function retryFailedChunks() {
  let rescheduledCount = 0;
  
  state.generationQueue.forEach(chunk => {
    if (chunk.status === 'failed') {
      chunk.status = 'pending';
      chunk.retries = 0;
      chunk.rateLimitRetries = 0;
      
      // Clear failed results
      chunk.lines.forEach(line => {
        state.results[line.index - 1] = undefined;
        updateRowDOM(line.index);
      });
      rescheduledCount++;
    }
  });
  
  if (rescheduledCount === 0) return;
  
  state.metrics.failures = Math.max(0, state.metrics.failures - rescheduledCount);
  
  // Boot up worker pool
  if (!state.isGenerating) {
    state.isGenerating = true;
    elements.btnGenerate.disabled = true;
    elements.btnGenerate.innerHTML = `<span class="loading-dots">Generating Prompts</span>`;
    
    const maxConcurrency = Math.max(1, Math.min(10, parseInt(elements.inputConcurrency.value) || 3));
    state.runningWorkers = 0;
    const workersToLaunch = Math.min(maxConcurrency, state.generationQueue.filter(c => c.status === 'pending').length);
    
    for (let w = 0; w < workersToLaunch; w++) {
      state.runningWorkers++;
      processNextQueueItem();
    }
  } else {
    const maxConcurrency = Math.max(1, Math.min(10, parseInt(elements.inputConcurrency.value) || 3));
    if (state.runningWorkers < maxConcurrency) {
      state.runningWorkers++;
      processNextQueueItem();
    }
  }
  
  updateDashboardUI();
  updateRetryButtonsVisibility();
}

function updateRetryButtonsVisibility() {
  const hasFailures = state.generationQueue.some(c => c.status === 'failed');
  const showRetry = hasFailures && !state.isGenerating;
  
  if (elements.btnRetryFailed) {
    if (showRetry) {
      elements.btnRetryFailed.classList.remove('hidden');
    } else {
      elements.btnRetryFailed.classList.add('hidden');
    }
  }
  if (elements.btnRetryFailedResults) {
    if (showRetry) {
      elements.btnRetryFailedResults.classList.remove('hidden');
    } else {
      elements.btnRetryFailedResults.classList.add('hidden');
    }
  }
}

window.retryLineChunk = function(lineIndex) {
  const chunk = state.generationQueue.find(c => c.lines.some(l => l.index === lineIndex));
  if (!chunk) return;
  
  if (chunk.status === 'generating') return;
  
  chunk.status = 'pending';
  chunk.retries = 0;
  chunk.rateLimitRetries = 0;
  
  chunk.lines.forEach(line => {
    state.results[line.index - 1] = undefined;
    updateRowDOM(line.index);
  });
  
  if (state.metrics.failures > 0) {
    state.metrics.failures--;
  }
  
  if (!state.isGenerating) {
    state.isGenerating = true;
    elements.btnGenerate.disabled = true;
    elements.btnGenerate.innerHTML = `<span class="loading-dots">Generating Prompts</span>`;
    
    const maxConcurrency = Math.max(1, Math.min(10, parseInt(elements.inputConcurrency.value) || 3));
    state.runningWorkers = 0;
    const workersToLaunch = Math.min(maxConcurrency, state.generationQueue.filter(c => c.status === 'pending').length);
    
    for (let w = 0; w < workersToLaunch; w++) {
      state.runningWorkers++;
      processNextQueueItem();
    }
  } else {
    const maxConcurrency = Math.max(1, Math.min(10, parseInt(elements.inputConcurrency.value) || 3));
    if (state.runningWorkers < maxConcurrency) {
      state.runningWorkers++;
      processNextQueueItem();
    }
  }
  
  updateDashboardUI();
  updateRetryButtonsVisibility();
};

// ==========================================
// EXPORTS AND CLIPBOARD OPERATIONS
// ==========================================
function copyPromptToClipboard(index) {
  const promptEl = document.getElementById(`prompt-text-${index}`);
  if (!promptEl) return;
  
  navigator.clipboard.writeText(promptEl.textContent).then(() => {
    // Visual success indicator
    const btn = promptEl.closest('tr').querySelector('.btn-copy');
    const originalSvg = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => {
      btn.innerHTML = originalSvg;
    }, 1500);
  }).catch(e => console.error("Clipboard copy failed", e));
}

window.copyPromptToClipboard = copyPromptToClipboard;

function copyAllPromptsToClipboard() {
  // Aggregate all prompts into standard numbered list
  const textContent = state.parsedLines.map((line, i) => {
    const res = state.results[i];
    const formattedIndex = String(line.index).padStart(3, '0');
    const promptText = res ? res.promptText : '[PENDING GENERATION]';
    return `${formattedIndex}\nScript: ${line.text}\nPrompt: ${promptText}\n`;
  }).join('\n');
  
  navigator.clipboard.writeText(textContent).then(() => {
    const originalText = elements.btnCopyAll.innerHTML;
    elements.btnCopyAll.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    setTimeout(() => {
      elements.btnCopyAll.innerHTML = originalText;
    }, 2000);
  }).catch(e => console.error("Clipboard copy failed", e));
}

function downloadTXTFile() {
  const textContent = state.parsedLines.map((line, i) => {
    const res = state.results[i];
    const formattedIndex = String(line.index).padStart(3, '0');
    const shotType = res ? res.shotType : 'Pending';
    const promptText = res ? res.promptText : '[PENDING GENERATION]';
    return `${formattedIndex}
Script: ${line.text}
Shot Type: ${shotType}
Prompt: ${promptText}
`;
  }).join('\n' + '='.repeat(40) + '\n\n');
  
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recap_prompts_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSVFile() {
  // Safe CSV cell wrapper
  const escapeCsv = (str) => {
    if (!str) return '""';
    return '"' + str.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  };
  
  let csvContent = 'Number,Script Line,Shot Type,Prompt Text\n';
  state.parsedLines.forEach((line, i) => {
    const res = state.results[i];
    const formattedIndex = String(line.index).padStart(3, '0');
    const shotType = res ? res.shotType : 'Pending';
    const promptText = res ? res.promptText : '[PENDING GENERATION]';
    csvContent += `${escapeCsv(formattedIndex)},${escapeCsv(line.text)},${escapeCsv(shotType)},${escapeCsv(promptText)}\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recap_prompts_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================================
// POST-GENERATION AUTOMATION HOOK ACTIONS
// ==========================================
async function callSingleAPIRequest(promptText, schema) {
  // Find first active, idle key
  const apiKeyObj = state.apiKeys.find(k => k.status !== 'failed' && k.cooldownUntil < Date.now());
  if (!apiKeyObj) {
    throw new Error("No active API keys available for call. Please check settings.");
  }
  
  const model = elements.selectModel.value;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeyObj.key}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: promptText }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  const textResponse = data.candidates[0].content.parts[0].text;
  return JSON.parse(textResponse);
}

async function generateThumbnailPrompts() {
  elements.modalTitle.textContent = "YouTube Thumbnail Prompt Suite";
  elements.modalBodyContent.innerHTML = `<div class="flex-center" style="height:150px;"><span class="loading-dots">Drafting high-CTR clickbaity Thumbnail Prompts</span></div>`;
  elements.hookModal.classList.remove('hidden');
  
  try {
    const tone = elements.inputTone.value;
    const world = elements.inputWorld.value;
    const power = elements.inputPower.value;
    const character = elements.inputCharacter.value;
    
    const toneNotRequired = elements.toggleToneNotRequired.checked;
    const worldNotRequired = elements.toggleWorldNotRequired.checked;
    const powerNotRequired = elements.togglePowerNotRequired.checked;
    const characterNotRequired = elements.toggleCharacterNotRequired.checked;
    
    // Use summary of first few lines of script
    const scriptSnippet = state.parsedLines.slice(0, 10).map(l => l.text).join(' ');

    let specs = '';
    if (!toneNotRequired) specs += `- Tone: ${tone}\n`;
    if (!worldNotRequired) specs += `- World: ${world}\n`;
    if (!powerNotRequired) specs += `- Power Indicators: ${power}\n`;
    if (!characterNotRequired) specs += `- Key Characters: ${character}\n`;
    specs += `- Story backdrop: ${scriptSnippet}`;

    const promptText = `
You are an expert designer of YouTube thumbnails for high-performing anime/manhwa recap channels.
Based on the following script backdrop and story rules, design 3 clickbait, highly-clickable thumbnail visual layouts.

STORY SPECS:
${specs}

DESIGN RULES:
- Style Lock (Verbatim): "In a dynamic cinematic manhwa illustration style, high-saturation complementary color grading,"
- Composition: Split-focus layout (e.g. left side features a close-up of character's face filled with glowing emotions; right side shows character performing a devastating glowing power attack).
- Label/Text Overlay: Must feature bold yellow block-letter labels on the graphic.
- Indicator Marks: Include sharp red hand-drawn arrows pointing at key anomalies.
- Parameter Lock (Verbatim): "--ar 16:9 --style raw"

Generate exactly 3 thumbnail layouts. Return them strictly as a JSON object with this schema:
{
  "thumbnails": [
    {
      "title": "Thumbnail Concept Title",
      "overlayText": "Yellow text overlay words (e.g. 'OVERPOWERED', 'TRAITOR!')",
      "visualDescription": "Detailed split-composition layout plan",
      "promptText": "The actual Midjourney prompt including style lock, split-composition visual action, yellow text description, red hand-drawn arrow description, and parameter lock."
    }
  ]
}
`;

    const schema = {
      type: "OBJECT",
      properties: {
        thumbnails: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              overlayText: { type: "STRING" },
              visualDescription: { type: "STRING" },
              promptText: { type: "STRING" }
            },
            required: ["title", "overlayText", "visualDescription", "promptText"]
          }
        }
      },
      required: ["thumbnails"]
    };

    const output = await callSingleAPIRequest(promptText, schema);
    
    // Render Modal UI
    elements.modalBodyContent.innerHTML = `
      <p class="card-subtitle" style="margin-bottom:15px;">Generated utilizing cinematic split-focus composition, neon accents, and red indicator marks:</p>
      <div class="thumbnail-prompts-container">
        ${output.thumbnails.map((thumb, idx) => `
          <div class="thumb-card">
            <div class="thumb-card-header">
              <span>Concept ${idx + 1}: ${thumb.title}</span>
              <span class="badge badge-accent">CTR Text: "${thumb.overlayText}"</span>
            </div>
            <div style="font-size:0.8rem; color:var(--color-muted); margin-bottom:8px; line-height:1.4;">
              <strong>Layout:</strong> ${thumb.visualDescription}
            </div>
            <div class="prompt-cell" id="thumb-prompt-${idx}">${thumb.promptText}</div>
            <div style="text-align:right; margin-top:8px;">
              <button class="btn btn-secondary btn-icon-only" onclick="window.copyToClipboard('thumb-prompt-${idx}')" title="Copy Prompt">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

  } catch (err) {
    console.error(err);
    elements.modalBodyContent.innerHTML = `<div style="color:var(--color-danger); padding:20px; text-align:center;">Failed to generate thumbnail prompts: ${err.message}</div>`;
  }
}

async function generateYoutubeSEO() {
  elements.modalTitle.textContent = "YouTube SEO Metadata Generator";
  elements.modalBodyContent.innerHTML = `<div class="flex-center" style="height:150px;"><span class="loading-dots">Generating optimized Video SEO Title, Tags & Description</span></div>`;
  elements.hookModal.classList.remove('hidden');
  
  try {
    // Aggregate parts of the script to avoid exceeding window but keep full context
    const firstLines = state.parsedLines.slice(0, 15).map(l => l.text).join(' ');
    const lastLines = state.parsedLines.slice(-15).map(l => l.text).join(' ');
    const scriptExcerpt = `START: ${firstLines}\n\nEND: ${lastLines}`;

    const promptText = `
You are a professional YouTube growth strategist and SEO copywriter for recap channels.
Generate high-performing SEO elements for a video based on this script excerpt:
---
${scriptExcerpt}
---

Create:
1. 3 High-CTR Title choices (Clickbaity but accurate, incorporating hooks like "OVERPOWERED", "REINCARNATED", "LEVEL 999", etc.)
2. A detailed Description template containing:
   - A captivating summary hook paragraph (intro)
   - Story context (body)
   - Timestamps placeholders
   - Suggested search terms
3. A comma-separated list of 15 optimized Tags.

Return strictly as a JSON object matching this schema:
{
  "titles": ["Title option 1", "Title option 2", "Title option 3"],
  "description": "Full HTML-clean, well spaced YouTube description text with timestamps placeholder",
  "tags": "manhwa, manhwa recap, manga recap, ..."
}
`;

    const schema = {
      type: "OBJECT",
      properties: {
        titles: { type: "ARRAY", items: { type: "STRING" } },
        description: { type: "STRING" },
        tags: { type: "STRING" }
      },
      required: ["titles", "description", "tags"]
    };

    const output = await callSingleAPIRequest(promptText, schema);
    
    // Render Modal UI
    elements.modalBodyContent.innerHTML = `
      <div class="seo-output-container">
        <!-- Title options -->
        <div class="seo-card">
          <div class="seo-card-header">Click-through Titles (CTR optimized)</div>
          <div class="form-group" style="gap:8px;">
            ${output.titles.map((t, i) => `
              <div class="flex-between" style="background:rgba(255,255,255,0.02); padding:8px 10px; border-radius:6px; font-weight:600; font-size:0.85rem;">
                <span id="seo-title-${i}">${t}</span>
                <button class="btn btn-secondary btn-icon-only" onclick="window.copyToClipboard('seo-title-${i}')" title="Copy Title">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Description Box -->
        <div class="seo-card">
          <div class="seo-card-header">
            <span>Video Description</span>
            <button class="btn btn-secondary btn-icon-only" onclick="window.copyToClipboard('seo-desc-content')" style="padding:4px 8px; font-size:0.75rem;">
              Copy Description
            </button>
          </div>
          <div class="seo-box" id="seo-desc-content">${output.description}</div>
        </div>

        <!-- Tags box -->
        <div class="seo-card">
          <div class="seo-card-header">
            <span>Optimized Video Tags</span>
            <button class="btn btn-secondary btn-icon-only" onclick="window.copyToClipboard('seo-tags-content')" style="padding:4px 8px; font-size:0.75rem;">
              Copy Tags
            </button>
          </div>
          <div class="seo-box" id="seo-tags-content" style="max-height:80px; font-size:0.8rem;">${output.tags}</div>
        </div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    elements.modalBodyContent.innerHTML = `<div style="color:var(--color-danger); padding:20px; text-align:center;">Failed to generate YouTube SEO: ${err.message}</div>`;
  }
}

// Global copy utility helper inside modal views
window.copyToClipboard = function(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const text = el.textContent || el.value;
  navigator.clipboard.writeText(text).then(() => {
    alert("Copied content successfully to clipboard!");
  }).catch(e => console.error("Copy failed", e));
};
