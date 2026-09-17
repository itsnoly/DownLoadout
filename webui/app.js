document.addEventListener("DOMContentLoaded", function () {
  const DEFAULT_RULES = [
    { id:'images', name:'Images', folder:'_Images', icon:'ic-image', exts:['jpg','jpeg','png','gif','webp','svg','heic','bmp'] },
    { id:'documents', name:'Documents', folder:'_Documents', icon:'ic-document', exts:['pdf','doc','docx','txt','md'] },
    { id:'videos', name:'Videos', folder:'_Videos', icon:'ic-video', exts:['mp4','mov','avi','mkv','webm'] },
    { id:'audio', name:'Audio', folder:'_Audio', icon:'ic-music', exts:['mp3','wav','flac','m4a','ogg'] },
    { id:'archives', name:'Archives', folder:'_Archives', icon:'ic-archive', exts:['zip','rar','7z','tar','gz','bz2','xz','iso','tgz'] },
    { id:'installers', name:'Installers', folder:'_Installers', icon:'ic-box', exts:['exe','msi','dmg','pkg','deb','apk','apks'] },
    { id:'code', name:'Code & Scripts', folder:'_Code', icon:'ic-code', exts:['js','html','css','py','json','ts','php','cpp'] },
    { id:'design', name:'Design Files', folder:'_Design', icon:'ic-image', exts:['psd','ai','fig','sketch','blend'] },
    { id:'ebooks', name:'eBooks', folder:'_eBooks', icon:'ic-doc', exts:['epub','azw3','djvu'] }
  ];

  const DEFAULT_ACTIVE_IDS = ['images', 'documents', 'videos', 'audio', 'archives', 'installers'];

  // Built-in category ids get their own branded SVG color (see style.css .icon.cat-*).
  // Any other id (custom, user-created categories) falls back to the dedicated
  // "cat-custom" color instead of an unmatched per-id class, which is what caused
  // custom categories to render with no color (an ugly plain white icon).
  const BUILTIN_CAT_IDS = new Set(DEFAULT_RULES.map(r => r.id));

  // Maps a file extension to the icon (and color) of the built-in category it
  // belongs to, so extension chips always show a file-type icon rather than
  // whatever icon the category happens to have.
  const EXT_ICON_MAP = {};
  DEFAULT_RULES.forEach(r => {
    r.exts.forEach(e => {
      if (!(e in EXT_ICON_MAP)) EXT_ICON_MAP[e] = { icon: r.icon, typeId: r.id };
    });
  });
  function iconForExt(ext) {
    return EXT_ICON_MAP[String(ext || '').toLowerCase()] || { icon: 'ic-file', typeId: null };
  }

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
  const moveToDownloadBtn = el('moveToDownloadBtn');
  const hoursTabs = el('hoursTabs'), daysTabs = el('daysTabs');
  const customIntervalInput = el('customIntervalInput'), applyCustomIntervalBtn = el('applyCustomIntervalBtn');
  
  const resetConfirmCard = el('resetConfirmCard'), closeResetCardBtn = el('closeResetCardBtn'), cancelResetBtn = el('cancelResetBtn'), confirmResetBtn = el('confirmResetBtn');
  const moveDownloadConfirmCard = el('moveDownloadConfirmCard'), closeMoveDownloadCardBtn = el('closeMoveDownloadCardBtn'), cancelMoveDownloadBtn = el('cancelMoveDownloadBtn'), confirmMoveDownloadBtn = el('confirmMoveDownloadBtn');
  const addCategoryCard = el('addCategoryCard'), closeAddCatCardBtn = el('closeAddCatCardBtn'), presetGrid = el('presetGrid'), predefinedSection = el('predefinedSection');
  const CIRC = 264;

  // Settings live in their own dedicated directory (public, under Download).
  const SETTINGS_DIR = '/storage/emulated/0/Download/DownTidy';
  const LEGACY_DL_DIR = '/storage/emulated/0/Download/DownTidy';
  const LEGACY_SETTINGS_DIR = '/storage/emulated/0/.downtidy';
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

  function assignExtensionToCategory(targetCatId, ext) {
    const cleanExt = safeExt(ext);
    if (!cleanExt) return;
    configData.rules.forEach(rule => {
      rule.exts = rule.exts.filter(e => e.toLowerCase() !== cleanExt);
    });
    const targetCat = configData.rules.find(c => c.id === targetCatId);
    if (targetCat) {
      if (!targetCat.exts.map(e => e.toLowerCase()).includes(cleanExt)) {
        targetCat.exts.push(cleanExt);
      }
    }
  }

  function iconSvg(name, catId) {
    let iconName = name;
    if (catId === 'documents' && (!iconName || iconName === 'ic-doc')) {
      iconName = 'ic-document';
    }
    const safeIcon = /^ic-[a-z0-9-]+$/.test(iconName || '') ? iconName : 'ic-file';
    let colorClass = safeIcon;
    if (catId) {
      const safeCat = String(catId).replace(/[^A-Za-z0-9_-]+/g, '');
      colorClass = BUILTIN_CAT_IDS.has(catId) ? `cat-${safeCat}` : 'cat-custom';
    }
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

  function showTrustBanner() {
    const banner = el('trustBanner');
    const dialCard = el('dialCard');
    if (dialCard) dialCard.style.display = 'none';
    if (banner) banner.style.display = 'flex';
  }

  function checkTrustStatus(silent = false) {
    const banner = el('trustBanner');
    const dialCard = el('dialCard');
    let isTrusted = false;

    if (window.Shizuku && typeof window.Shizuku.exec === 'function') {
      try {
        const testRes = JSON.parse(window.Shizuku.exec('echo ok'));
        if (testRes && (testRes.exitCode === 0 || (testRes.stdout && testRes.stdout.trim() === 'ok'))) {
          isTrusted = true;
        }
      } catch (e) {
        isTrusted = false;
      }
    }

    if (isTrusted) {
      if (banner) banner.style.display = 'none';
      if (dialCard) dialCard.style.display = 'flex';
      if (!silent) {
        log('Shevery Shell Bridge verified! Full Trust Mode is active.', 'ok');
      }
    } else {
      if (dialCard) dialCard.style.display = 'none';
      if (banner) banner.style.display = 'flex';
      if (!silent) {
        log('Shell Bridge unavailable. Please enable "Trust Module" in Shevery.', 'err');
      }
    }
    return isTrusted;
  }

  function shellExec(cmd) {
    if (!window.Shizuku) {
      log('Shizuku Shell bridge is unavailable.', 'err');
      showTrustBanner();
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
      showTrustBanner();
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
    return '/data/local/tmp/shevery/modules/downtidy';
  }

  // XHR-based file read for file:// module resources. fetch() cannot load
  // file:// URLs in Android WebView, XHR can (with allowFileAccessFromFileURLs
  // + module trusted in Shevery).
  function fetchModuleFile(relPath) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', relPath, true);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
        else reject(new Error('XHR failed: HTTP ' + xhr.status + ' for ' + relPath));
      };
      xhr.onerror = () => reject(new Error('XHR error for ' + relPath + ' (trust the module in Shevery?)'));
      xhr.send(null);
    });
  }

  // Stage a runnable copy of action.sh next to the settings so the
  // Organize flow never depends on the legacy hidden dot-folder.
  // Runs on WebUI load and before every Organize; idempotent.
  async function stageActionScript() {
    const modulePath = getModulePath();
    const targetAction = SETTINGS_DIR + '/action.sh';
    const targetService = SETTINGS_DIR + '/service.sh';

    if (modulePath) {
      const res = shellExec(`mkdir -p "${SETTINGS_DIR}" && cp -f "${modulePath}/action.sh" "${targetAction}" 2>/dev/null; cp -f "${modulePath}/service.sh" "${targetService}" 2>/dev/null; [ -f "${targetAction}" ] && echo STAGED`);
      if (res && res.ok && (res.stdout || '').includes('STAGED')) {
        log('Scripts staged to ' + SETTINGS_DIR, 'info');
        ensureBackgroundService();
        return true;
      }
    }

    try {
      const actionText = await fetchModuleFile('../action.sh');
      const b64Action = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(actionText)));
      let serviceText = '';
      try { serviceText = await fetchModuleFile('../service.sh'); } catch (_) {}
      const b64Service = serviceText ? btoa(String.fromCharCode.apply(null, new TextEncoder().encode(serviceText))) : '';

      const cmd = `mkdir -p "${SETTINGS_DIR}" && echo '${b64Action}' | base64 -d > "${targetAction}" && ` +
        (b64Service ? `echo '${b64Service}' | base64 -d > "${targetService}" && ` : '') +
        `[ -f "${targetAction}" ] && echo STAGED`;

      const res = shellExec(cmd);
      if (res && res.ok && (res.stdout || '').includes('STAGED')) {
        log('Action script staged to ' + targetAction + ' (WebUI bridge copy)', 'info');
        ensureBackgroundService();
        return true;
      }
    } catch (err) {
      log('Could not stage action.sh: ' + err.message, 'err');
    }

    ensureBackgroundService();
    return false;
  }

  function ensureBackgroundService(forceRestart = false) {
    const modulePath = getModulePath();
    const targetService = SETTINGS_DIR + '/service.sh';
    const cmd = `PID_FILE=/data/local/tmp/downtidy_service.pid; LEGACY_PID_FILE=/data/local/tmp/downtidy_service.pid; rm -f "$LEGACY_PID_FILE" 2>/dev/null; if [ "${forceRestart ? '1' : '0'}" = "1" ]; then OLD_PID=$(cat "$PID_FILE" 2>/dev/null); [ -n "$OLD_PID" ] && kill -9 "$OLD_PID" 2>/dev/null; rm -f "$PID_FILE" 2>/dev/null; fi; if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE" 2>/dev/null) 2>/dev/null; then echo "SERVICE_ALREADY_RUNNING"; else nohup sh -c 'if [ -f "${targetService}" ]; then sh "${targetService}"; elif [ -f "${modulePath}/service.sh" ]; then sh "${modulePath}/service.sh"; fi' >/dev/null 2>&1 & echo "SERVICE_STARTED"; fi`;
    shellExec(cmd);
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

  if (moveToDownloadBtn && moveDownloadConfirmCard) {
    moveToDownloadBtn.onclick = () => {
      if (menuDropdown) menuDropdown.classList.remove('open');
      moveDownloadConfirmCard.style.display = 'flex';
      moveDownloadConfirmCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  }

  if (closeMoveDownloadCardBtn) closeMoveDownloadCardBtn.onclick = () => moveDownloadConfirmCard.style.display = 'none';
  if (cancelMoveDownloadBtn) cancelMoveDownloadBtn.onclick = () => moveDownloadConfirmCard.style.display = 'none';

  if (confirmMoveDownloadBtn) {
    confirmMoveDownloadBtn.onclick = () => {
      moveDownloadConfirmCard.style.display = 'none';
      runActionEngine('move_to_download');
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
        ensureBackgroundService(true);
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
      const loadCmd = `M=${SETTINGS_DIR}/conveyor_config.json; O=${LEGACY_DL_DIR}/conveyor_config.json; L=${LEGACY_SETTINGS_DIR}/conveyor_config.json; if [ -f "$M" ]; then echo "CONF=$M"; cat "$M"; elif [ -f "$O" ]; then mkdir -p ${SETTINGS_DIR} 2>/dev/null; cp "$O" "$M" 2>/dev/null; echo "CONF=$M"; cat "$M"; elif [ -f "$L" ]; then mkdir -p ${SETTINGS_DIR} 2>/dev/null; if mv "$L" "$M" 2>/dev/null; then echo "CONF=$M"; cat "$M"; else echo "CONF=$L"; cat "$L"; fi; fi`;
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
            setTimeout(() => performScan(), 400);
            return;
          }
        }
        log('Initial setup: Initializing config at ' + SETTINGS_DIR + '/', 'info');
        autoSaveConfig();
        setTimeout(() => performScan(), 400);
      } catch(e) {
        autoSaveConfig();
        setTimeout(() => performScan(), 400);
      }
    }, 50);
  }

  function updateStats(overridePct = null) {
    if (sFiles) sFiles.textContent = scannedTotalFiles;
    if (sCats) sCats.textContent = configData.rules.length;
    if (sDone) sDone.textContent = organizedFilesCount;
    
    let pct = 0;
    if (overridePct !== null) {
      pct = Math.max(0, Math.min(100, overridePct));
    } else if (scannedTotalFiles === 0 && organizedFilesCount > 0) {
      pct = 100;
    } else if (scannedTotalFiles > 0) {
      const total = scannedTotalFiles + organizedFilesCount;
      pct = Math.round((organizedFilesCount / total) * 100);
    } else {
      pct = 0;
    }

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
            const typeInfo = iconForExt(e);
            return `<div class="lane-chip">${iconSvg(typeInfo.icon, typeInfo.typeId || cat.id)}<span>.${safeExt}</span><span class="rm" role="button" aria-label="Remove extension ${safeExt}" data-del-ext="${safeCatId}:${safeExt}"><svg class="icon sm"><use href="#ic-x"/></svg></span></div>`;
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
          <button type="button" class="lane-folder-save-btn" aria-label="Save folder name" title="Save folder name" data-folder-save="${safeCatId2}">
            <svg class="icon sm"><use href="#ic-check"/></svg>
          </button>
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

    lanesScroll.querySelectorAll('[data-folder-save]').forEach(btn => {
      btn.onclick = () => {
        const catId = btn.dataset.folderSave;
        const inp = lanesScroll.querySelector(`[data-folder-edit="${catId}"]`);
        if (inp) handleFolderRename(catId, inp.value);
      };
    });

    lanesScroll.querySelectorAll('[data-folder-edit]').forEach(inp => {
      const catId = inp.dataset.folderEdit;
      const cat = configData.rules.find(c => c.id === catId);
      const saveBtn = lanesScroll.querySelector(`[data-folder-save="${catId}"]`);

      inp.oninput = () => {
        if (!cat || !saveBtn) return;
        const currentVal = inp.value.trim();
        const initialVal = (cat.folder || '').trim();
        if (currentVal !== initialVal && currentVal.length > 0) {
          saveBtn.classList.add('visible');
        } else {
          saveBtn.classList.remove('visible');
        }
      };

      inp.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleFolderRename(catId, inp.value);
        }
      };
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
          assignExtensionToCategory(id, val);
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
          newCat.exts.forEach(ext => {
            const cleanExt = ext.toLowerCase();
            configData.rules.forEach(rule => {
              rule.exts = rule.exts.filter(e => e.toLowerCase() !== cleanExt);
            });
          });
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
      if (!folder.startsWith('_')) folder = '_' + folder;
      folder = safeFolderName(folder);
      const rawExts = el('newCatExts') ? el('newCatExts').value.split(',').map(s => safeExt(s)).filter(Boolean) : [];
      const exts = Array.from(new Set(rawExts));
      exts.forEach(cleanExt => {
        configData.rules.forEach(rule => {
          rule.exts = rule.exts.filter(e => e.toLowerCase() !== cleanExt);
        });
      });
      if (!name) return;
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + Math.random().toString(36).slice(2,6);
      configData.rules.push({ id, name, folder, exts, icon: 'ic-sparkles' });
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

  async function performScan(updateDial = true) {
    setStatus('busy', 'scanning…');
    if (consoleRing) consoleRing.classList.add('live');
    log('Scanning Download directory...', 'info');

    // Yield so the busy status paints smoothly without freezing the UI
    await new Promise(resolve => setTimeout(resolve, 30));

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
    if (updateDial) {
      updateStats();
    } else {
      if (sFiles) sFiles.textContent = scannedTotalFiles;
      if (sCats) sCats.textContent = configData.rules.length;
      if (sDone) sDone.textContent = organizedFilesCount;
    }
  }

  if (scanBtn) scanBtn.onclick = () => performScan(true);

  // shellExec() is a synchronous bridge call: the JS main thread is blocked
  // for the entire time the shell command takes to return. action.sh moves
  // real files and can run for several seconds, which is what froze the
  // whole WebUI on "Organize Now". To keep the UI responsive we launch
  // action.sh detached (returns almost immediately) and poll a log file
  // with short, non-blocking shellExec() calls instead of one long one.
  let organizeRunning = false;
  const ORGANIZE_LOG_FILE = `${SETTINGS_DIR}/action_run.log`;
  const ORGANIZE_DONE_MARKER = '___DONE_EXIT:';
  const ORGANIZE_POLL_MS = 500;
  const ORGANIZE_TIMEOUT_MS = 10 * 60 * 1000;

  function pollOrganizeLog(onLineCallback) {
    return new Promise(resolve => {
      let lastLen = 0;
      let fullOutput = '';
      const startedAt = Date.now();

      const poll = () => {
        const readRes = shellExec(`cat "${ORGANIZE_LOG_FILE}" 2>/dev/null`);
        const content = (readRes && readRes.stdout) || '';

        if (content.length > lastLen) {
          const chunk = content.slice(lastLen);
          lastLen = content.length;
          fullOutput = content;
          chunk.split('\n').forEach(line => {
            if (line && !line.startsWith(ORGANIZE_DONE_MARKER)) {
              log(line, 'info');
              if (onLineCallback) onLineCallback(line);
            }
          });
        }

        const doneIdx = content.indexOf(ORGANIZE_DONE_MARKER);
        if (doneIdx !== -1) {
          const exitCode = parseInt(content.slice(doneIdx + ORGANIZE_DONE_MARKER.length), 10);
          resolve({ timedOut: false, exitCode: isNaN(exitCode) ? -1 : exitCode, fullOutput });
          return;
        }

        if (Date.now() - startedAt > ORGANIZE_TIMEOUT_MS) {
          resolve({ timedOut: true, exitCode: -1, fullOutput });
          return;
        }

        setTimeout(poll, ORGANIZE_POLL_MS);
      };
      poll();
    });
  }

  async function runActionEngine(mode = 'organize') {
    if (organizeRunning) return;
    organizeRunning = true;

    autoSaveConfig();

    const isMoveToDownload = mode === 'move_to_download';
    if (isMoveToDownload) {
      log('=== Starting Move to Download Execution ===', 'info');
      setStatus('busy', 'moving…');
      if (consoleRing) consoleRing.classList.add('live');
      log('Moving category files back to Download folder...', 'info');
    } else {
      log('=== Starting Organize Execution ===', 'info');
      setStatus('busy', 'organizing…');
      if (consoleRing) consoleRing.classList.add('live');
      log('Applying rules and moving files via action engine...', 'info');
    }

    const modulePath = getModulePath();
    await stageActionScript();

    const argStr = isMoveToDownload ? 'move_to_download' : '';
    const launchCmd = `rm -f "${ORGANIZE_LOG_FILE}"; nohup sh -c 'if [ -f "${SETTINGS_DIR}/action.sh" ]; then sh "${SETTINGS_DIR}/action.sh" ${argStr} 2>&1; else sh "${modulePath}/action.sh" ${argStr} 2>&1; fi; echo ${ORGANIZE_DONE_MARKER}$?' > "${ORGANIZE_LOG_FILE}" 2>&1 & echo BG_STARTED`;

    log(`[DEBUG] Target Module Path: ${modulePath}`, 'info');
    log(`[DEBUG] Launching background action engine...`, 'info');

    const launchRes = shellExec(launchCmd);

    if (!launchRes || !launchRes.ok) {
      log('[DEBUG] Critical Error: Failed to launch background action engine.', 'err');
      const errMsg = launchRes ? (launchRes.stderr || 'Shell execution failed.') : 'Execution failed';
      log((isMoveToDownload ? 'Move to Download error: ' : 'Organization error: ') + errMsg, 'err');
      if (consoleRing) consoleRing.classList.remove('live');
      setStatus('on', 'ready');
      organizeRunning = false;
      return;
    }

    let currentOrganized = 0;
    const initialToOrganize = scannedTotalFiles;
    if (!isMoveToDownload && initialToOrganize > 0) {
      updateStats(0);
    }

    const onProgressLine = (line) => {
      if (line.startsWith('[OK] Moved:')) {
        currentOrganized++;
        organizedFilesCount = currentOrganized;
        if (!isMoveToDownload) {
          const totalTarget = Math.max(currentOrganized, initialToOrganize);
          const currentPct = totalTarget > 0 ? Math.min(99, Math.round((currentOrganized / totalTarget) * 100)) : 50;
          updateStats(currentPct);
        } else {
          if (sDone) sDone.textContent = currentOrganized;
        }
      }
    };

    const { timedOut, exitCode, fullOutput } = await pollOrganizeLog(onProgressLine);

    log(`[DEBUG] Shizuku Exit Code: ${exitCode}`, exitCode === 0 ? 'info' : 'err');

    if (!timedOut && exitCode === 0) {
      let count = 0;
      const match = fullOutput.match(/SUCCESS_MOVED_COUNT:(\d+)/);
      if (match) count = parseInt(match[1], 10) || 0;

      if (isMoveToDownload) {
        log(`[SUCCESS] Moved ${count} file(s) back to Download folder.`, 'ok');
        organizedFilesCount = 0;
        updateStats(0);
      } else {
        organizedFilesCount = count;
        log(`[SUCCESS] Organized ${count} file(s) into category folders.`, 'ok');
        updateStats(100);
      }
      organizeRunning = false;
      await performScan(false);
    } else {
      const errMsg = timedOut ? 'Timed out waiting for the action engine to finish.' : `action.sh exited with code ${exitCode}.`;
      log((isMoveToDownload ? 'Move to Download error: ' : 'Organization error: ') + errMsg, 'err');
      if (consoleRing) consoleRing.classList.remove('live');
      setStatus('on', 'ready');
      organizeRunning = false;
    }
  }

  if (organizeBtn) {
    organizeBtn.onclick = () => runActionEngine('organize');
  }

  // Automatically re-verify trust status whenever the user switches back from Shevery
  window.addEventListener('focus', () => checkTrustStatus(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkTrustStatus(true);
  });

  updateTogglesUI();
  renderHoursTabs();
  renderDaysTabs();
  renderLanes();
  updateStats();
  checkTrustStatus(true);
  loadModuleConfigAsync();
});