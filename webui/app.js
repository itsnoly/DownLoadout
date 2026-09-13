document.addEventListener("DOMContentLoaded", function () {
  const DEFAULT_RULES = [
    { id:'images', name:'Images', folder:'! - Images', icon:'ic-image', exts:['jpg','jpeg','png','gif','webp','svg','heic','bmp'] },
    { id:'documents', name:'Documents', folder:'! - Documents', icon:'ic-doc', exts:['pdf','doc','docx','txt','md','rtf'] },
    { id:'spreadsheets', name:'Spreadsheets', folder:'! - Spreadsheets', icon:'ic-sheet', exts:['xls','xlsx','csv','numbers'] },
    { id:'presentations', name:'Presentations', folder:'! - Presentations', icon:'ic-doc', exts:['ppt','pptx','key'] },
    { id:'videos', name:'Videos', folder:'! - Videos', icon:'ic-video', exts:['mp4','mov','avi','mkv','webm'] },
    { id:'audio', name:'Audio', folder:'! - Audio', icon:'ic-music', exts:['mp3','wav','flac','m4a','ogg'] },
    { id:'archives', name:'Archives', folder:'! - Archives', icon:'ic-archive', exts:['zip','rar','7z','tar','gz','bz2','xz','iso','tgz'] },
    { id:'installers', name:'Installers', folder:'Installers', icon:'ic-box', exts:['exe','msi','dmg','pkg','deb','apk'] },
    { id:'code', name:'Code & Scripts', folder:'! - Code', icon:'ic-code', exts:['js','html','css','py','json','ts','php','cpp'] },
    { id:'design', name:'Design Files', folder:'! - Design', icon:'ic-image', exts:['psd','ai','fig','sketch','xd','blend'] },
    { id:'ebooks', name:'eBooks', folder:'! - eBooks', icon:'ic-doc', exts:['epub','mobi','azw3','djvu'] }
  ];

  const DEFAULT_ACTIVE_IDS = ['images', 'documents', 'spreadsheets', 'videos', 'audio', 'archives'];

  let configData = {
    target_folder: '/storage/emulated/0/Download',
    schedule_hours: 0,
    custom_interval: '',
    include_subdirs: false,
    show_console_logs: true,
    active_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    last_run: 0,
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES.filter(r => DEFAULT_ACTIVE_IDS.includes(r.id))))
  };

  let scannedTotalFiles = 0;
  let organizedFilesCount = 0;
  let renameDebounceTimers = {};

  const el = id => document.getElementById(id);
  const statusPill = el('statusPill'), statusRing = el('statusRing'), statusText = el('statusText');
  const scheduleStatusBadge = el('scheduleStatusBadge');
  const scanBtn = el('scanBtn'), organizeBtn = el('organizeBtn');
  const lanesScroll = el('lanesScroll');
  const consoleHead = el('consoleHead'), consoleBody = el('consoleBody'), consoleChev = el('consoleChev'), consoleRing = el('consoleRing'), consoleInner = el('consoleInner'), consoleSection = el('consoleSection');
  const consoleExpandBtn = el('consoleExpandBtn'), consoleExpandIcon = el('consoleExpandIcon');
  const dialProgress = el('dialProgress'), dialPct = el('dialPct');
  const sFiles = el('sFiles'), sCats = el('sCats'), sDone = el('sDone');
  const menuBtn = el('menuBtn'), menuDropdown = el('menuDropdown'), toggleSubdirsBtn = el('toggleSubdirsBtn'), subdirsSwitch = el('subdirsSwitch');
  const toggleLogsBtn = el('toggleLogsBtn'), logsSwitch = el('logsSwitch'), resetDefaultsBtn = el('resetDefaultsBtn');
  const hoursTabs = el('hoursTabs'), daysTabs = el('daysTabs');
  const customIntervalInput = el('customIntervalInput'), applyCustomIntervalBtn = el('applyCustomIntervalBtn');
  
  const resetConfirmCard = el('resetConfirmCard'), closeResetCardBtn = el('closeResetCardBtn'), cancelResetBtn = el('cancelResetBtn'), confirmResetBtn = el('confirmResetBtn');
  const addCategoryCard = el('addCategoryCard'), closeAddCatCardBtn = el('closeAddCatCardBtn'), presetGrid = el('presetGrid'), predefinedSection = el('predefinedSection');
  const CIRC = 264;

  // Settings live in their own dedicated directory (public, under Download),
  // replacing the old hidden /sdcard/.down-loadout dot-folder.
  const SETTINGS_DIR = '/storage/emulated/0/Download/DownLoadout';
  const LEGACY_SETTINGS_DIR = '/storage/emulated/0/.down-loadout';
  const FOLDER_SAFE_RE = /^[A-Za-z0-9 _,.!-]*$/;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Folder names become shell arguments; restrict to a safe charset.
  function safeFolderName(v) {
    return String(v || '').trim().replace(/[\/\\]/g, '_').replace(/[^A-Za-z0-9 _,.!-]/g, '_');
  }

  // Extension tokens become shell + config tokens; restrict to [a-z0-9_].
  function safeExt(v) {
    return String(v || '').trim().toLowerCase().replace(/^\./, '').replace(/[^a-z0-9_]/g, '');
  }

  function iconSvg(name, catId) {
    const safeIcon = /^ic-[a-z0-9-]+$/.test(name || '') ? name : 'ic-file';
    const safeCat = String(catId || 'file').replace(/[^A-Za-z0-9_-]+/g, '');
    const colorClass = catId ? `cat-${safeCat}` : safeIcon;
    return `<svg class="icon ${colorClass}"><use href="#${safeIcon}"/></svg>`;
  }

  function log(msg, type) {
    if (!consoleInner || !consoleBody) return;
    const cleanMsg = String(msg).replace(/\r/g, '');
    const lines = cleanMsg.split('\n');
    lines.forEach(line => {
      if (!line.trim() && lines.length > 1) return;
      const wrap = document.createElement('div');
      wrap.className = 'log-line ' + (type || 'info');
      const t = new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
      const iconName = type === 'ok' ? 'ic-check' : type === 'err' ? 'ic-alert' : 'ic-file';
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = `<svg class="icon sm" aria-hidden="true"><use href="#${iconName}"/></svg>`;
      const tSpan = document.createElement('span');
      tSpan.className = 't';
      tSpan.textContent = t;
      const txtSpan = document.createElement('span');
      txtSpan.className = 'txt';
      txtSpan.textContent = line; // textContent: shell output (filenames) must never be parsed as HTML
      wrap.appendChild(iconSpan);
      wrap.appendChild(tSpan);
      wrap.appendChild(txtSpan);
      consoleInner.appendChild(wrap);
    });
    consoleBody.classList.add('open');
    if (consoleChev) consoleChev.classList.add('open');
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  if (consoleHead) {
    consoleHead.onclick = () => {
      // While fullscreen, the header chevron is inert; only the expand/restore button exits.
      if (consoleSection && consoleSection.classList.contains('expanded')) return;
      if (consoleBody) consoleBody.classList.toggle('open');
      if (consoleChev) consoleChev.classList.toggle('open');
    };
  }

  // Fullscreen log console (expand / restore with diagonal arrows icon)
  if (consoleExpandBtn) {
    let wasBodyOpen = true;
    consoleExpandBtn.onclick = (e) => {
      e.stopPropagation();
      const expanded = consoleSection.classList.toggle('expanded');
      if (expanded) {
        wasBodyOpen = consoleBody ? consoleBody.classList.contains('open') : true;
        if (consoleBody) {
          consoleBody.classList.add('open');
          requestAnimationFrame(() => { consoleBody.scrollTop = consoleBody.scrollHeight; });
        }
      } else if (!wasBodyOpen && consoleBody) {
        consoleBody.classList.remove('open');
      }
      if (consoleExpandIcon) consoleExpandIcon.setAttribute('href', expanded ? '#ic-collapse' : '#ic-expand');
      consoleExpandBtn.setAttribute('aria-expanded', String(expanded));
      consoleExpandBtn.setAttribute('aria-label', expanded ? 'Exit full screen logs' : 'Expand logs full screen');
      consoleExpandBtn.setAttribute('title', expanded ? 'Exit full screen logs' : 'Expand logs full screen');
    };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && consoleSection.classList.contains('expanded')) consoleExpandBtn.click();
    });
  }

  function shellExec(cmd) {
    if (!window.Shizuku) {
      log('Shizuku Shell bridge is unavailable.', 'err');
      return { ok: false, stdout: '', stderr: 'No Shizuku bridge' };
    }
    try {
      const fullCmd = `export TMPDIR=/data/local/tmp; ${cmd}`;
      const res = JSON.parse(window.Shizuku.exec(fullCmd));
      if (res && typeof res.ok === 'undefined') {
        res.ok = (res.exitCode === 0);
      }
      return res;
    } catch(err) {
      log('Shell execution error: ' + err.message, 'err');
      return { ok: false, stdout: '', stderr: err.message };
    }
  }

  function getModulePath() {
    if (!window.Shizuku) return '';
    try {
      const infoStr = window.Shizuku.getModuleInfo();
      if (infoStr) {
        const info = JSON.parse(infoStr);
        // Shevery's bridge reports the install dir as `moduleDir`
        // (older builds used `path`); accept either.
        if (info && (info.path || info.moduleDir)) return info.path || info.moduleDir;
      }
    } catch (e) {
      // Fallback
    }
    return '/data/local/tmp/shevery/modules/downloadout';
  }

  // Stage a runnable copy of action.sh next to the settings so the
  // Organize flow never depends on the legacy hidden dot-folder.
  // Runs on WebUI load and before every Organize; idempotent.
  async function stageActionScript() {
    const modulePath = getModulePath();
    const target = SETTINGS_DIR + '/action.sh';
    // Preferred path: shell cp straight from the module dir. Works when the
    // device is rooted (su shim) because shell can read app-private storage.
    if (modulePath) {
      const res = shellExec(`mkdir -p ${SETTINGS_DIR} && if [ -f \"${modulePath}/action.sh\" ]; then cp -f \"${modulePath}/action.sh\" ${target} && echo STAGED; else echo NO_SOURCE; fi`);
      if (res && res.ok && (res.stdout || '').includes('STAGED')) {
        log('Action script staged to ' + target, 'info');
        return true;
      }
    }
    // Fallback: on unrooted devices shell cannot read the app-private module
    // dir, so cp above fails. Read the script here instead (the trusted
    // WebView may fetch files from the module dir) and write it out through
    // the shell bridge (writing to Download works for shell).
    try {
      const resp = await fetch('../action.sh');
      if (!resp.ok) throw new Error('fetch failed: HTTP ' + resp.status);
      const text = await resp.text();
      const b64 = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(text)));
      const res = shellExec(`mkdir -p ${SETTINGS_DIR} && echo '${b64}' | base64 -d > ${target} && echo STAGED`);
      if (res && res.ok && (res.stdout || '').includes('STAGED')) {
        log('Action script staged to ' + target + ' (app-side copy)', 'info');
        return true;
      }
      log('Staging action.sh failed; place a copy manually at ' + target, 'err');
    } catch (err) {
      log('Could not stage action.sh: ' + err.message + '; place a copy manually at ' + target, 'err');
    }
    return false;
  }

  function parseCustomInterval(inputStr) {
    if (!inputStr) return null;
    const trimmed = inputStr.trim().toLowerCase();
    const match = trimmed.match(/^([1-9]\d*)(s|m|h)$/);
    if (!match) return null;
    return { value: parseInt(match[1], 10), unit: match[2], formatted: match[1] + match[2] };
  }

  function updateTogglesUI() {
    if (subdirsSwitch) {
      if (configData.include_subdirs) subdirsSwitch.classList.add('active');
      else subdirsSwitch.classList.remove('active');
    }
    if (logsSwitch) {
      if (configData.show_console_logs !== false) logsSwitch.classList.add('active');
      else logsSwitch.classList.remove('active');
    }
    if (consoleSection) {
      consoleSection.style.display = (configData.show_console_logs !== false) ? 'block' : 'none';
    }
  }

  if (menuBtn && menuDropdown) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle('open');
    };
    document.addEventListener('click', () => menuDropdown.classList.remove('open'));
  }

  if (toggleSubdirsBtn) {
    toggleSubdirsBtn.onclick = (e) => {
      e.stopPropagation();
      configData.include_subdirs = !configData.include_subdirs;
      updateTogglesUI();
      autoSaveConfig();
      log(`Subdirectory search: ${configData.include_subdirs ? 'ENABLED' : 'DISABLED'}`, 'info');
    };
  }

  if (toggleLogsBtn) {
    toggleLogsBtn.onclick = (e) => {
      e.stopPropagation();
      configData.show_console_logs = !(configData.show_console_logs !== false);
      updateTogglesUI();
      autoSaveConfig();
    };
  }

  if (resetDefaultsBtn && resetConfirmCard) {
    resetDefaultsBtn.onclick = () => {
      if (menuDropdown) menuDropdown.classList.remove('open');
      resetConfirmCard.style.display = 'flex';
      resetConfirmCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  }

  if (closeResetCardBtn) closeResetCardBtn.onclick = () => resetConfirmCard.style.display = 'none';
  if (cancelResetBtn) cancelResetBtn.onclick = () => resetConfirmCard.style.display = 'none';

  if (confirmResetBtn) {
    confirmResetBtn.onclick = () => {
      configData.rules = JSON.parse(JSON.stringify(DEFAULT_RULES.filter(r => DEFAULT_ACTIVE_IDS.includes(r.id))));
      configData.schedule_hours = 0;
      configData.custom_interval = '';
      configData.include_subdirs = false;
      configData.show_console_logs = true;
      configData.active_days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      configData.target_folder = '/storage/emulated/0/Download';
      if (customIntervalInput) customIntervalInput.value = '';
      
      autoSaveConfig();
      renderHoursTabs();
      renderDaysTabs();
      renderLanes();
      updateStats();
      resetConfirmCard.style.display = 'none';
      log('Reset settings to default values.', 'ok');
    };
  }

  function renderHoursTabs() {
    if (!hoursTabs) return;
    hoursTabs.querySelectorAll('.hour-tab').forEach(btn => {
      const h = parseInt(btn.dataset.hour, 10);
      if (configData.schedule_hours === h && !configData.custom_interval) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.onclick = () => {
        configData.schedule_hours = h;
        configData.custom_interval = '';
        renderHoursTabs();
        autoSaveConfig();
      };
    });

    if (scheduleStatusBadge) {
      if (configData.custom_interval) {
        scheduleStatusBadge.textContent = `${configData.custom_interval} Active`;
        scheduleStatusBadge.classList.add("active");
      } else if (configData.schedule_hours > 0) {
        scheduleStatusBadge.textContent = `${configData.schedule_hours}h Active`;
        scheduleStatusBadge.classList.add("active");
      } else {
        scheduleStatusBadge.textContent = "Disabled";
        scheduleStatusBadge.classList.remove("active");
      }
    }
  }

  if (applyCustomIntervalBtn && customIntervalInput) {
    applyCustomIntervalBtn.onclick = () => {
      const parsed = parseCustomInterval(customIntervalInput.value);
      if (!parsed) {
        log('Invalid interval! Supported formats: 1s, 20s, 30m, 1h, 10h', 'err');
        return;
      }
      configData.custom_interval = parsed.formatted;
      configData.schedule_hours = 0;
      renderHoursTabs();
      autoSaveConfig();
      log(`Custom interval updated to ${parsed.formatted}.`, 'ok');
    };
  }

  function renderDaysTabs() {
    if (!daysTabs) return;
    daysTabs.querySelectorAll('.day-tab').forEach(btn => {
      const day = btn.dataset.day;
      if (configData.active_days && configData.active_days.includes(day)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.onclick = () => {
        if (!configData.active_days) configData.active_days = [];
        if (configData.active_days.includes(day)) {
          configData.active_days = configData.active_days.filter(d => d !== day);
        } else {
          configData.active_days.push(day);
        }
        renderDaysTabs();
        autoSaveConfig();
      };
    });
  }

  function setStatus(mode, text) {
    if (!statusPill) return;
    statusPill.className = 'status-pill' + (mode === 'on' ? ' on' : mode === 'busy' ? ' busy' : '');
    if (statusRing) statusRing.className = 'ring' + (mode === 'busy' ? ' live' : '');
    if (statusText) statusText.textContent = text;
  }

  function autoSaveConfig() {
    configData.target_folder = '/storage/emulated/0/Download';
    updateTogglesUI();

    const jsonStr = JSON.stringify(configData, null, 2);
    const escapedJson = jsonStr.replace(/'/g, "'\\''");
    const saveCmd = `mkdir -p ${SETTINGS_DIR} && printf %s '${escapedJson}' > ${SETTINGS_DIR}/conveyor_config.json && rm -f ${LEGACY_SETTINGS_DIR}/conveyor_config.json`;
    
    setTimeout(() => {
      const res = shellExec(saveCmd);
      if (res && res.ok) {
        log('Configuration saved to ' + SETTINGS_DIR + '/conveyor_config.json', 'info');
      } else {
        log('Auto-save warning: ' + (res ? res.stderr : 'Execution failed'), 'err');
      }
    }, 10);
  }

  function loadModuleConfigAsync() {
    setTimeout(() => {
      // Keep a runnable action.sh next to the settings on every load.
      stageActionScript();
      // Settings live in their own directory under Download; migrate the
      // legacy hidden dot-folder location on first load (mirrors action.sh).
      const loadCmd = `M=${SETTINGS_DIR}/conveyor_config.json; L=${LEGACY_SETTINGS_DIR}/conveyor_config.json; if [ -f "$M" ]; then echo "CONF=$M"; cat "$M"; elif [ -f "$L" ]; then mkdir -p ${SETTINGS_DIR} 2>/dev/null; if mv "$L" "$M" 2>/dev/null; then echo "CONF=$M"; cat "$M"; else echo "CONF=$L"; cat "$L"; fi; fi`;
      try {
        const res = shellExec(loadCmd);
        // loadCmd prints a "CONF=<path>" header line before the JSON,
        // so slice from the first '{' instead of requiring it at offset 0.
        const raw = (res && res.stdout ? res.stdout : '').trim();
        const jsonStart = raw.indexOf('{');
        if (res && res.ok && jsonStart >= 0) {
          const loadedData = JSON.parse(raw.slice(jsonStart));
          if (loadedData && Array.isArray(loadedData.rules)) {
            loadedData.rules = loadedData.rules.filter(r => r.id !== 'others');
            configData = loadedData;
            configData.target_folder = '/storage/emulated/0/Download';
            if (customIntervalInput && configData.custom_interval) {
              customIntervalInput.value = configData.custom_interval;
            }
            log('Configuration loaded from ' + SETTINGS_DIR + '/', 'ok');
            updateTogglesUI();
            renderHoursTabs();
            renderDaysTabs();
            renderLanes();
            updateStats();
            performScan();
            return;
          }
        }
        log('Initial setup: Initializing config at ' + SETTINGS_DIR + '/', 'info');
        autoSaveConfig();
        performScan();
      } catch(e) {
        autoSaveConfig();
      }
    }, 50);
  }

  function updateStats() {
    if (sFiles) sFiles.textContent = scannedTotalFiles;
    if (sCats) sCats.textContent = configData.rules.length;
    if (sDone) sDone.textContent = organizedFilesCount;
    
    const pct = scannedTotalFiles > 0 ? Math.min(100, Math.round((organizedFilesCount / scannedTotalFiles) * 100)) : 0;
    if (dialPct) dialPct.textContent = pct + '%';
    if (dialProgress) {
      const offset = CIRC - (CIRC * pct) / 100;
      dialProgress.setAttribute('stroke-dashoffset', offset);
    }
  }

  function handleFolderRename(catId, newFolderVal) {
    const cat = configData.rules.find(c => c.id === catId);
    if (!cat || !newFolderVal.trim()) return;
    
    const oldFolder = cat.folder;
    const cleanNewFolder = safeFolderName(newFolderVal);

    // Old names from a tampered config are interpolated into the mv/cd command,
    // so they must pass validation too.
    if (cleanNewFolder && !FOLDER_SAFE_RE.test(oldFolder || '')) {
      log('Rename skipped: current folder name contains unsupported characters.', 'err');
      return;
    }

    if (oldFolder && cleanNewFolder && oldFolder !== cleanNewFolder) {
      const targetDir = '/storage/emulated/0/Download';
      const renameCmd = `
cd "${targetDir}" || exit 0
if [ -d "${oldFolder}" ]; then
  if [ ! -d "${cleanNewFolder}" ]; then
    mv "${oldFolder}" "${cleanNewFolder}"
  else
    mv "${oldFolder}"/* "${cleanNewFolder}/" 2>/dev/null
  fi
fi
`;
      shellExec(renameCmd);
      cat.folder = cleanNewFolder;
      autoSaveConfig();
      renderLanes();
      log(`Renamed category folder "${oldFolder}" -> "${cleanNewFolder}".`, 'ok');
    }
  }

  function renderLanes() {
    if (!lanesScroll) return;
    lanesScroll.innerHTML = '';
    configData.rules.forEach(cat => {
      const lane = document.createElement('div');
      lane.className = 'lane';
      const chipsHtml = cat.exts.length
        ? cat.exts.map(e => {
            const safeExt = esc(e);
            const safeCatId = esc(cat.id);
            return `<div class="lane-chip">${iconSvg(cat.icon || 'ic-file', cat.id)}<span>.${safeExt}</span><span class="rm" role="button" aria-label="Remove extension ${safeExt}" data-del-ext="${safeCatId}:${safeExt}"><svg class="icon sm"><use href="#ic-x"/></svg></span></div>`;
          }).join('')
        : `<div class="lane-empty">no extensions configured</div>`;
      
      const safeName = esc(cat.name);
      const safeFolder = esc(cat.folder);
      const safeCatId2 = esc(cat.id);
      lane.innerHTML = `
        <div class="lane-head">
          ${iconSvg(cat.icon || 'ic-file', cat.id)}
          <span class="name">${safeName}</span>
          <span class="del" role="button" aria-label="Delete category ${safeName}" data-del-cat="${safeCatId2}"><svg class="icon sm"><use href="#ic-trash"/></svg></span>
        </div>
        <div class="lane-folder-edit">
          <span class="prefix">/</span>
          <input type="text" value="${safeFolder}" data-folder-edit="${safeCatId2}" placeholder="Folder Name">
        </div>
        <div class="lane-chips">${chipsHtml}</div>
        <div class="lane-add-row">
          <input placeholder="+ extension" data-quick-input="${safeCatId2}">
          <button aria-label="Add extension" data-quick-add="${safeCatId2}"><svg class="icon sm"><use href="#ic-plus"/></svg></button>
        </div>
      `;
      lanesScroll.appendChild(lane);
    });

    const addLane = document.createElement('div');
    addLane.className = 'lane-new';
    addLane.setAttribute('role', 'button');
    addLane.setAttribute('aria-label', 'Add category');
    addLane.innerHTML = '<svg class="icon"><use href="#ic-plus"/></svg><span>Add Category</span>';
    addLane.onclick = () => openAddCategoryInlineCard();
    lanesScroll.appendChild(addLane);

    lanesScroll.querySelectorAll('[data-folder-edit]').forEach(inp => {
      const catId = inp.dataset.folderEdit;
      inp.oninput = () => {
        clearTimeout(renameDebounceTimers[catId]);
        renameDebounceTimers[catId] = setTimeout(() => {
          handleFolderRename(catId, inp.value);
        }, 800);
      };
      inp.onblur = () => {
        clearTimeout(renameDebounceTimers[catId]);
        handleFolderRename(catId, inp.value);
      };
      inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
    });

    lanesScroll.querySelectorAll('[data-del-ext]').forEach(b => b.onclick = () => {
      const [id, ext] = b.dataset.delExt.split(':');
      const cat = configData.rules.find(c => c.id === id);
      if (cat) cat.exts = cat.exts.filter(e => e !== ext);
      autoSaveConfig();
      renderLanes();
      performScan();
    });

    lanesScroll.querySelectorAll('[data-del-cat]').forEach(b => b.onclick = () => {
      configData.rules = configData.rules.filter(c => c.id !== b.dataset.delCat);
      autoSaveConfig();
      renderLanes();
      updateStats();
      performScan();
    });

    lanesScroll.querySelectorAll('[data-quick-add]').forEach(b => b.onclick = () => {
      const id = b.dataset.quickAdd;
      const input = lanesScroll.querySelector(`[data-quick-input="${id}"]`);
      if (input) {
        const val = safeExt(input.value);
        if (val) {
          const cat = configData.rules.find(c => c.id === id);
          if (cat && !cat.exts.includes(val)) cat.exts.push(val);
          input.value = '';
          autoSaveConfig();
          renderLanes();
          performScan();
        }
      }
    });

    lanesScroll.querySelectorAll('[data-quick-input]').forEach(inp => {
      inp.onkeydown = e => { if (e.key === 'Enter') lanesScroll.querySelector(`[data-quick-add="${inp.dataset.quickInput}"]`).click(); };
    });
  }

  function renderPresetsInInlineCard() {
    const activeIds = configData.rules.map(c => c.id);
    const availablePresets = DEFAULT_RULES.filter(p => !activeIds.includes(p.id));

    if (availablePresets.length > 0 && predefinedSection && presetGrid) {
      predefinedSection.style.display = 'block';
      presetGrid.innerHTML = '';
      availablePresets.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'preset-card';
        card.innerHTML = `
          <div class="preset-card-top">${iconSvg(preset.icon || 'ic-file', preset.id)}${esc(preset.name)}</div>
          <div class="preset-card-sub">/${esc(preset.folder)} · .${esc(preset.exts.slice(0,3).join(', .'))}</div>
        `;
        card.onclick = () => {
          const newCat = JSON.parse(JSON.stringify(preset));
          configData.rules.push(newCat);

          autoSaveConfig();
          renderLanes();
          updateStats();
          performScan();
          if (addCategoryCard) addCategoryCard.style.display = 'none';
          log(`Predefined category "${preset.name}" added.`, 'ok');
        };
        presetGrid.appendChild(card);
      });
    } else if (predefinedSection) {
      predefinedSection.style.display = 'none';
    }
  }

  function openAddCategoryInlineCard() {
    renderPresetsInInlineCard();
    if (addCategoryCard) {
      addCategoryCard.style.display = 'flex';
      addCategoryCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (el('newCatName')) el('newCatName').focus();
  }

  if (closeAddCatCardBtn) closeAddCatCardBtn.onclick = () => addCategoryCard.style.display = 'none';

  if (el('createCatBtn')) {
    el('createCatBtn').onclick = () => {
      const name = el('newCatName') ? el('newCatName').value.trim() : '';
      let folder = el('newCatFolder') ? el('newCatFolder').value.trim() || name : name;
      if (!folder.startsWith('! - ')) folder = '! - ' + folder;
      folder = safeFolderName(folder);
      const exts = el('newCatExts') ? el('newCatExts').value.split(',').map(s => safeExt(s)).filter(Boolean) : [];
      if (!name) return;
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + Math.random().toString(36).slice(2,6);
      configData.rules.push({ id, name, folder, exts, icon: 'ic-file' });
      if (el('newCatName')) el('newCatName').value = ''; 
      if (el('newCatFolder')) el('newCatFolder').value = ''; 
      if (el('newCatExts')) el('newCatExts').value = '';
      if (addCategoryCard) addCategoryCard.style.display = 'none';
      autoSaveConfig();
      renderLanes();
      updateStats();
      performScan();
      log(`Custom category "${name}" created with target folder /${folder}.`, 'ok');
    };
  }

  function performScan() {
    setStatus('busy', 'scanning…');
    if (consoleRing) consoleRing.classList.add('live');
    log('Scanning Download directory...', 'info');

    const validExts = new Set();
    const destFolders = [];

    configData.rules.forEach(r => {
      if (r.folder && FOLDER_SAFE_RE.test(r.folder)) destFolders.push(r.folder);
      r.exts.forEach(e => validExts.add(e.toLowerCase()));
    });

    const folder = '/storage/emulated/0/Download';
    const pruneExpr = destFolders.map(df => `-name "${df}"`).join(' -o ');
    const pruneCmd = pruneExpr ? `\\( -name ".?*" -o ${pruneExpr} \\) -prune -o` : `\\( -name ".?*" \\) -prune -o`;
    
    const findCmd = configData.include_subdirs 
      ? `find "${folder}" ${pruneCmd} -type f -print`
      : `find "${folder}" -maxdepth 1 -type f -print`;

    const res = shellExec(findCmd);
    if (res && res.ok && res.stdout) {
      const lines = res.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      let count = 0;

      lines.forEach(filepath => {
        const filename = filepath.split('/').pop();
        if (/^\./.test(filename)) return;
        if (/\.(crdownload|part|tmp|download|aria2|ubdownload|gdownload|!ut)$/i.test(filename)) return;

        const extMatch = filename.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : '';
        
        let effectiveExt = ext;
        if (ext === 'bak') {
          const stemMatch = filename.replace(/\.bak$/i, '').match(/\.([^.]+)$/);
          if (stemMatch) effectiveExt = stemMatch[1].toLowerCase();
        }

        if (validExts.has(effectiveExt)) {
          count++;
        }
      });

      scannedTotalFiles = count;
      log(`Found ${scannedTotalFiles} valid organizeable file(s).`, 'ok');
    } else {
      scannedTotalFiles = 0;
      log('Scan error or directory empty.', 'info');
    }

    if (consoleRing) consoleRing.classList.remove('live');
    setStatus('on', 'ready');
    updateStats();
  }

  if (scanBtn) scanBtn.onclick = performScan;

  if (organizeBtn) {
    organizeBtn.onclick = async () => {
      autoSaveConfig();
      log('=== Starting Organize Execution ===', 'info');
      
      setStatus('busy', 'organizing…');
      if (consoleRing) consoleRing.classList.add('live');
      log('Applying rules and moving files via action engine...', 'info');

      const modulePath = getModulePath();
      await stageActionScript();
      const actionCmd = `sh "${modulePath}/action.sh" 2>&1 || sh /storage/emulated/0/Download/DownLoadout/action.sh 2>&1`;
      
      log(`[DEBUG] Target Module Path: ${modulePath}`, 'info');
      log(`[DEBUG] Executing command: ${actionCmd}`, 'info');

      const res = shellExec(actionCmd);

      if (res) {
        log(`[DEBUG] Shizuku Exit Code: ${res.exitCode}`, res.ok ? 'info' : 'err');
        if (res.stdout) {
          log('[DEBUG] --- stdout start ---', 'info');
          log(res.stdout, 'info');
          log('[DEBUG] --- stdout end ---', 'info');
        }
        if (res.stderr) {
          log('[DEBUG] --- stderr start ---', 'err');
          log(res.stderr, 'err');
          log('[DEBUG] --- stderr end ---', 'err');
        }
      } else {
        log('[DEBUG] Critical Error: Received null response from Shizuku Bridge.', 'err');
      }

      if (res && res.ok) {
        let count = 0;
        const match = (res.stdout || "").match(/SUCCESS_MOVED_COUNT:(\d+)/);
        if (match) count = parseInt(match[1], 10) || 0;

        organizedFilesCount = count;
        log(`[SUCCESS] Organized ${count} file(s) into category folders.`, 'ok');
        performScan();
      } else {
        const errMsg = res ? (res.stderr || 'Shell execution failed. See details in debug block above.') : 'Execution failed';
        log('Organization error: ' + errMsg, 'err');
        if (consoleRing) consoleRing.classList.remove('live');
        setStatus('on', 'ready');
      }
    };
  }

  updateTogglesUI();
  renderHoursTabs();
  renderDaysTabs();
  renderLanes();
  updateStats();
  loadModuleConfigAsync();
});