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
  characters: [], // { id: string, name: string, description: string }
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
  btnAddCharacter: document.getElementById('btn-add-character'),
  characterBlocksContainer: document.getElementById('character-blocks-container'),
  toggleToneNotRequired: document.getElementById('toggle-tone-not-required'),
  toggleWorldNotRequired: document.getElementById('toggle-world-not-required'),
  togglePowerNotRequired: document.getElementById('toggle-power-not-required'),
  toggleCharsNotRequired: document.getElementById('toggle-chars-not-required'),
  
  fileUpload: document.getElementById('file-upload'),
  inputScript: document.getElementById('input-script'),
  btnResetPrompt: document.getElementById('btn-reset-prompt'),
  inputBasePrompt: document.getElementById('input-base-prompt'),
  btnGenerate: document.getElementById('btn-generate'),
  
  dashboardSection: document.getElementById('dashboard-section'),
  dashboardStatusText: document.getElementById('dashboard-status-text'),
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

  // Add initial character block if none exist
  if (state.characters.length === 0) {
    addCharacterBlock();
  } else {
    renderCharacterBlocks();
  }
  
  // Re-apply character toggle state on load to ensure block forms are greyed out if loaded as Not Required
  applyToggleState('chars', elements.toggleCharsNotRequired.checked);
});

// ==========================================
// LOCAL STORAGE & PERSISTENCE
// ==========================================
function saveToLocalStorage() {
  localStorage.setItem('gemini_api_keys', JSON.stringify(state.apiKeys));
  localStorage.setItem('base_system_prompt', elements.inputBasePrompt.value);
  
  // Collect characters
  const charBlocks = document.querySelectorAll('.character-block');
  const chars = Array.from(charBlocks).map(block => {
    return {
      id: block.dataset.id,
      name: block.querySelector('.char-name').value,
      description: block.querySelector('.char-desc').value
    };
  });
  localStorage.setItem('story_characters', JSON.stringify(chars));
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
  localStorage.setItem('toggle_chars_not_required', elements.toggleCharsNotRequired.checked);
}

function loadFromLocalStorage() {
  try {
    const keys = localStorage.getItem('gemini_api_keys');
    if (keys) {
      state.apiKeys = JSON.parse(keys).map(k => ({
        ...k,
        status: 'idle',
        cooldownUntil: 0
      }));
      renderKeys();
    }
    
    const prompt = localStorage.getItem('base_system_prompt');
    if (prompt) {
      elements.inputBasePrompt.value = prompt;
    }
    
    const chars = localStorage.getItem('story_characters');
    if (chars) {
      state.characters = JSON.parse(chars);
    }
    
    elements.inputTone.value = localStorage.getItem('story_tone') || "Dark fantasy, intense, high-stakes, epic action";
    elements.inputWorld.value = localStorage.getItem('story_world') || "";
    elements.inputPower.value = localStorage.getItem('story_power') || "";
    
    elements.selectModel.value = localStorage.getItem('settings_model') || "gemini-2.5-flash";
    elements.inputChunkSize.value = localStorage.getItem('settings_chunk_size') || "5";
    elements.inputConcurrency.value = localStorage.getItem('settings_concurrency') || "3";

    // Load toggles
    elements.toggleToneNotRequired.checked = localStorage.getItem('toggle_tone_not_required') === 'true';
    elements.toggleWorldNotRequired.checked = localStorage.getItem('toggle_world_not_required') === 'true';
    elements.togglePowerNotRequired.checked = localStorage.getItem('toggle_power_not_required') === 'true';
    elements.toggleCharsNotRequired.checked = localStorage.getItem('toggle_chars_not_required') === 'true';
    
    // Apply visual disabled states
    applyToggleState('tone', elements.toggleToneNotRequired.checked);
    applyToggleState('world', elements.toggleWorldNotRequired.checked);
    applyToggleState('power', elements.togglePowerNotRequired.checked);
    applyToggleState('chars', elements.toggleCharsNotRequired.checked);
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
  
  // Character Blocks Management
  elements.btnAddCharacter.addEventListener('click', () => addCharacterBlock());
  
  // Reset Prompt Template
  elements.btnResetPrompt.addEventListener('click', () => {
    if (confirm("Are you sure you want to reset the base system instructions? Any modifications will be lost.")) {
      elements.inputBasePrompt.value = DEFAULT_SYSTEM_PROMPT;
      saveToLocalStorage();
    }
  });
  
  // SRT/TXT File Upload
  elements.fileUpload.addEventListener('change', handleFileUpload);
  
  // Save settings on input blur
  const autoSaveSelectors = [
    elements.inputTone, elements.inputWorld, elements.inputPower,
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
  
  // Modals close
  elements.btnCloseModal.addEventListener('click', () => elements.hookModal.classList.add('hidden'));
  window.addEventListener('click', (e) => {
    if (e.target === elements.hookModal) elements.hookModal.classList.add('hidden');
  });
  
  // Hook Buttons
  elements.btnHookThumbnail.addEventListener('click', generateThumbnailPrompts);
  elements.btnHookSeo.addEventListener('click', generateYoutubeSEO);
  
  // Toggles event listeners
  ['tone', 'world', 'power', 'chars'].forEach(type => {
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
  } else if (type === 'chars') {
    elements.btnAddCharacter.disabled = isNotRequired;
    if (isNotRequired) {
      elements.characterBlocksContainer.classList.add('disabled');
    } else {
      elements.characterBlocksContainer.classList.remove('disabled');
    }
    const inputs = elements.characterBlocksContainer.querySelectorAll('input, textarea, button');
    inputs.forEach(input => {
      input.disabled = isNotRequired;
    });
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
    cooldownUntil: 0
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
// CHARACTER EDITOR DYNAMICS
// ==========================================
function addCharacterBlock(name = "", desc = "") {
  const id = 'char_' + Date.now() + Math.random().toString(36).substr(2, 5);
  state.characters.push({ id, name, description: desc });
  
  const blockHtml = document.createElement('div');
  blockHtml.className = 'character-block';
  blockHtml.dataset.id = id;
  blockHtml.innerHTML = `
    <div class="character-block-header">
      <input type="text" class="form-input char-name" placeholder="Character Name / ID (e.g. Sung Jin-Woo)" value="${name}">
      <button class="btn-remove-character" title="Delete block">&times;</button>
    </div>
    <textarea class="form-input char-desc textarea-small" placeholder="Describe outfit, hair, age, appearance verbatim...">${desc}</textarea>
  `;
  
  // Set up listeners for the input and textarea
  const nameInput = blockHtml.querySelector('.char-name');
  const descInput = blockHtml.querySelector('.char-desc');
  const deleteBtn = blockHtml.querySelector('.btn-remove-character');
  
  // Respect the "Not Required" toggle state on character addition
  if (elements.toggleCharsNotRequired && elements.toggleCharsNotRequired.checked) {
    nameInput.disabled = true;
    descInput.disabled = true;
    deleteBtn.disabled = true;
  }
  
  const saveAction = () => {
    const chars = state.characters.find(c => c.id === id);
    if (chars) {
      chars.name = nameInput.value;
      chars.description = descInput.value;
    }
    saveToLocalStorage();
  };
  
  nameInput.addEventListener('blur', saveAction);
  descInput.addEventListener('blur', saveAction);
  
  deleteBtn.addEventListener('click', () => {
    blockHtml.remove();
    state.characters = state.characters.filter(c => c.id !== id);
    saveToLocalStorage();
    
    // Always keep at least one block
    if (state.characterBlocksContainer.children.length === 0) {
      addCharacterBlock();
    }
  });
  
  state.characterBlocksContainer.appendChild(blockHtml);
}

function renderCharacterBlocks() {
  elements.characterBlocksContainer.innerHTML = '';
  state.characters.forEach(char => {
    addCharacterBlock(char.name, char.description);
  });
}

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
  const chunkSize = Math.max(1, Math.min(20, parseInt(elements.inputChunkSize.value) || 5));
  const maxConcurrency = Math.max(1, Math.min(10, parseInt(elements.inputConcurrency.value) || 3));
  
  // Prep UI
  state.isGenerating = true;
  elements.btnGenerate.disabled = true;
  elements.btnGenerate.innerHTML = `<span class="loading-dots">Generating Prompts</span>`;
  
  elements.dashboardSection.classList.remove('hidden');
  elements.resultsSection.classList.add('hidden');
  
  // Split parsedLines into chunks
  state.generationQueue = [];
  for (let i = 0; i < state.parsedLines.length; i += chunkSize) {
    const chunkLines = state.parsedLines.slice(i, i + chunkSize);
    state.generationQueue.push({
      chunkIndex: state.generationQueue.length,
      lines: chunkLines,
      retries: 0,
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
  
  updateDashboardUI();
  
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
  updateDashboardUI();
  
  // Pick active API key (load balanced)
  const apiKeyObj = getAvailableApiKey();
  if (!apiKeyObj) {
    // Wait for a key to cool down and try again
    chunk.status = 'pending';
    updateDashboardUI();
    
    // Re-check after a brief pause
    setTimeout(() => {
      if (state.runningWorkers < parseInt(elements.inputConcurrency.value)) {
        state.runningWorkers++;
        processNextQueueItem();
      }
    }, 3000);
    
    state.runningWorkers--;
    return;
  }
  
  // Mark key as active in dashboard key visual grid
  apiKeyObj.status = 'active';
  renderKeyActivityDashboard();
  
  try {
    const generatedPrompts = await callGeminiAPI(chunk, apiKeyObj.key);
    
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
    
  } catch (err) {
    console.error(`Error processing chunk ${chunk.chunkIndex}:`, err);
    state.metrics.retries++;
    chunk.retries++;
    
    // Cooldown API key on 429 rate limit or general block
    if (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')) {
      apiKeyObj.status = 'rate-limited';
      apiKeyObj.cooldownUntil = Date.now() + 45000; // 45 seconds penalty
      console.warn(`Key ${apiKeyObj.label} rate limited. Cooling down...`);
    } else {
      apiKeyObj.status = 'idle'; // Generic error, might just be output mismatch
    }
    
    if (chunk.retries >= 4) {
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
  }
  
  renderKeyActivityDashboard();
  updateDashboardUI();
  
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
  
  // Round-robin selection
  state.currentActiveKeyIndex = (state.currentActiveKeyIndex + 1) % availableKeys.length;
  return availableKeys[state.currentActiveKeyIndex];
}

// ==========================================
// GEMINI API FETCH CALL
// ==========================================
async function callGeminiAPI(chunk, apiKey) {
  let systemPrompt = elements.inputBasePrompt.value;
  const tone = elements.inputTone.value;
  const world = elements.inputWorld.value;
  const power = elements.inputPower.value;
  
  const toneNotRequired = elements.toggleToneNotRequired.checked;
  const worldNotRequired = elements.toggleWorldNotRequired.checked;
  const powerNotRequired = elements.togglePowerNotRequired.checked;
  const charsNotRequired = elements.toggleCharsNotRequired.checked;
  
  // Dynamic system prompt cleaning: strip instructions matching disabled modules
  if (charsNotRequired) {
    // Drop Character Consistency section (Section 2)
    systemPrompt = systemPrompt.replace(/## 2\.\s+Character Consistency Rule[\s\S]*?(?=(## 3\.)|#|$)/i, "");
    // Remove characters from prompt structure definition in Section 4
    systemPrompt = systemPrompt.replace(/\[Verbatim Character Descriptions[^\]]*\]\s*/gi, "");
  }
  
  // Accumulate active character definitions
  let activeChars = '';
  if (!charsNotRequired) {
    const charBlocks = document.querySelectorAll('.character-block');
    activeChars = Array.from(charBlocks).map(block => {
      const name = block.querySelector('.char-name').value.trim();
      const desc = block.querySelector('.char-desc').value.trim();
      if (name) return `- **${name}**: ${desc}`;
      return null;
    }).filter(c => c !== null).join('\n');
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
  
  if (!charsNotRequired) {
    promptBody += `\nACTIVE CHARACTER SPECIFIC DESCRIPTIONS:\n${activeChars || 'No specific character descriptions defined.'}\n`;
  }
  
  promptBody += `\nGENERATE DETAILED MIDJOURNEY PROMPTS FOR THESE SCRIPT LINES:\n${linesPayload}\n\n`;
  promptBody += `Generate exactly ${chunk.lines.length} prompts matching the order of the lines above.\n`;
  promptBody += `Ensure every prompt starts with the exact style prefix: "Modern manhwa illustration style, dynamic anime digital art, ".\n`;
  
  if (!charsNotRequired) {
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
    const errorText = await response.text();
    throw new Error(`Gemini API Error: Status ${response.status} - ${errorText}`);
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
}

function checkGenerationCompletion() {
  if (state.runningWorkers === 0) {
    state.isGenerating = false;
    elements.btnGenerate.disabled = false;
    elements.btnGenerate.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Generate Bulk Prompts`;
    
    // Display result dashboard
    elements.dashboardStatusText.textContent = "Prompt generation run complete!";
    elements.resultsSection.classList.remove('hidden');
    
    // Sort and re-assemble
    renderResultsTable();
  }
}

function renderResultsTable() {
  const filteredQuery = elements.inputSearchPrompts.value.toLowerCase();
  elements.resultsTableBody.innerHTML = '';
  
  let validResultsCount = 0;
  
  state.results.forEach((res, i) => {
    if (!res) return; // safety check
    
    const matchSearch = res.scriptLine.toLowerCase().includes(filteredQuery) || 
                        res.promptText.toLowerCase().includes(filteredQuery) ||
                        res.index.toString().includes(filteredQuery);
                        
    if (!matchSearch) return;
    
    validResultsCount++;
    const formattedIndex = String(res.index).padStart(3, '0');
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="index-cell">${formattedIndex}</td>
      <td class="script-cell">
        <div>${res.scriptLine}</div>
        ${res.timestamp ? `<div class="timestamp-text">${res.timestamp}</div>` : ''}
      </td>
      <td class="shot-cell">${res.shotType}</td>
      <td>
        <div class="prompt-cell" id="prompt-text-${res.index}">${res.promptText}</div>
      </td>
      <td class="text-center">
        <button class="btn-icon-only btn-copy" onclick="window.copyPromptToClipboard(${res.index})" title="Copy Prompt">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </td>
    `;
    elements.resultsTableBody.appendChild(tr);
  });
  
  elements.resultsMetaText.textContent = `Displaying ${validResultsCount} of ${state.results.length} order-locked, strictly sequential prompts.`;
}

function filterResultsTable() {
  renderResultsTable();
}

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
  const textContent = state.results.map(res => {
    const formattedIndex = String(res.index).padStart(3, '0');
    return `${formattedIndex}\nScript: ${res.scriptLine}\nPrompt: ${res.promptText}\n`;
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
  const textContent = state.results.map(res => {
    const formattedIndex = String(res.index).padStart(3, '0');
    return `${formattedIndex}
Script: ${res.scriptLine}
Shot Type: ${res.shotType}
Prompt: ${res.promptText}
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
  state.results.forEach(res => {
    const formattedIndex = String(res.index).padStart(3, '0');
    csvContent += `${escapeCsv(formattedIndex)},${escapeCsv(res.scriptLine)},${escapeCsv(res.shotType)},${escapeCsv(res.promptText)}\n`;
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
    
    const toneNotRequired = elements.toggleToneNotRequired.checked;
    const worldNotRequired = elements.toggleWorldNotRequired.checked;
    const powerNotRequired = elements.togglePowerNotRequired.checked;
    const charsNotRequired = elements.toggleCharsNotRequired.checked;
    
    // Accumulate active character definitions
    let activeChars = '';
    if (!charsNotRequired) {
      const charBlocks = document.querySelectorAll('.character-block');
      activeChars = Array.from(charBlocks).map(block => {
        const name = block.querySelector('.char-name').value.trim();
        const desc = block.querySelector('.char-desc').value.trim();
        if (name) return `${name}: ${desc}`;
        return null;
      }).filter(c => c !== null).join(', ');
    }

    // Use summary of first few lines of script
    const scriptSnippet = state.results.slice(0, 10).map(r => r.scriptLine).join(' ');

    let specs = '';
    if (!toneNotRequired) specs += `- Tone: ${tone}\n`;
    if (!worldNotRequired) specs += `- World: ${world}\n`;
    if (!powerNotRequired) specs += `- Power Indicators: ${power}\n`;
    if (!charsNotRequired) specs += `- Key Characters: ${activeChars}\n`;
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
    const firstLines = state.results.slice(0, 15).map(r => r.scriptLine).join(' ');
    const lastLines = state.results.slice(-15).map(r => r.scriptLine).join(' ');
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
