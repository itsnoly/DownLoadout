document.addEventListener("DOMContentLoaded", async function () {
  // Asynchronously load external SVG icons sprite file into the DOM
  async function loadIcons() {
    try {
      const response = await fetch('icons/icons.svg');
      if (response.ok) {
        const svgText = await response.text();
        const container = document.createElement('div');
        container.style.display = 'none';
        container.innerHTML = svgText;
        document.body.insertBefore(container, document.body.firstChild);
      }
    } catch (e) {
      console.error('Failed to load icons sprite:', e);
    }
  }

  await loadIcons();

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
  const dialProgress = el('dialProgress'), dialPct = el('dialPct');
  const sFiles = el('sFiles'), sCats = el('sCats'), sDone = el('sDone');
  const menuBtn = el('menuBtn'), menuDropdown = el('menuDropdown'), toggleSubdirsBtn = el('toggleSubdirsBtn'), subdirsSwitch = el('subdirsSwitch');
  const toggleLogsBtn = el('toggleLogsBtn'), logsSwitch = el('logsSwitch'), resetDefaultsBtn = el('resetDefaultsBtn');
  const hoursTabs = el('hoursTabs'), daysTabs = el('daysTabs');
  const customIntervalInput = el('customIntervalInput'), applyCustomIntervalBtn = el('applyCustomIntervalBtn');
  
  const resetConfirmCard = el('resetConfirmCard'), closeResetCardBtn = el('closeResetCardBtn'), cancelResetBtn = el('cancelResetBtn'), confirmResetBtn = el('confirmResetBtn');
  const addCategoryCard = el('addCategoryCard'), closeAddCatCardBtn = el('closeAddCatCardBtn'), presetGrid = el('presetGrid'), predefinedSection = el('predefinedSection');
  const CIRC = 264;

  function iconSvg(name, catId) { 
    const colorClass = catId ? `cat-${catId}` : (name || 'ic-file');
    return `<svg class="icon ${colorClass}"><use href="#${name}"/></svg>`; 
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
      wrap.innerHTML = `<svg class="icon sm"><use href="#${iconName}"/></svg><span class="t">${t}</span><span class="txt">${line}</span>`;
      consoleInner.appendChild(wrap);
    });
    consoleBody.classList.add('open');
    if (consoleChev) consoleChev.classList.add('open');
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  if (consoleHead) {
    consoleHead.onclick = () => {
      if (consoleBody) consoleBody.classList.toggle('open');
      if (consoleChev) consoleChev.classList.toggle('open');
    };
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
        if (info && info.path) return info.path;
      }
    } catch (e) {
      // Fallback
    }
    return '/data/local/tmp/shevery/modules/downloadout';
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
    const saveCmd = `mkdir -p /storage/emulated/0/.down-loadout && printf %s '${escapedJson}' > /storage/emulated/0/.down-loadout/conveyor_config.json`;
    
    setTimeout(() => {
      const res = shellExec(saveCmd);
      if (res && res.ok) {
        log('Configuration saved to /storage/emulated/0/.down-loadout/conveyor_config.json', 'info');
      } else {
        log('Auto-save warning: ' + (res ? res.stderr : 'Execution failed'), 'err');
      }
    }, 10);
  }

  function loadModuleConfigAsync() {
    setTimeout(() => {
      const loadCmd = `cat /storage/emulated/0/.down-loadout/conveyor_config.json 2>/dev/null`;
      try {
        const res = shellExec(loadCmd);
        if (res && res.ok && res.stdout && res.stdout.trim().startsWith('{')) {
          const loadedData = JSON.parse(res.stdout);
          if (loadedData && Array.isArray(loadedData.rules)) {
            loadedData.rules = loadedData.rules.filter(r => r.id !== 'others');
            configData = loadedData;
            configData.target_folder = '/storage/emulated/0/Download';
            if (customIntervalInput && configData.custom_interval) {
              customIntervalInput.value = configData.custom_interval;
            }
            log('Configuration loaded from /storage/emulated/0/.down-loadout/', 'ok');
            updateTogglesUI();
            renderHoursTabs();
            renderDaysTabs();
            renderLanes();
            updateStats();
            performScan();
          }
        } else {
          log('Initial setup: Initializing config at /storage/emulated/0/.down-loadout/', 'info');
          autoSaveConfig();
          performScan();
        }
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
    const cleanNewFolder = newFolderVal.trim().replace(/[\/\\]/g, '_');
    
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
        ? cat.exts.map(e => `<div class="lane-chip">${iconSvg(cat.icon || 'ic-file', cat.id)}<span>.${e}</span><span class="rm" data-del-ext="${cat.id}:${e}"><svg class="icon sm"><use href="#ic-x"/></svg></span></div>`).join('')
        : `<div class="lane-empty">no extensions configured</div>`;
      
      lane.innerHTML = `
        <div class="lane-head">
          ${iconSvg(cat.icon || 'ic-file', cat.id)}
          <span class="name">${cat.name}</span>
          <span class="del" data-del-cat="${cat.id}"><svg class="icon sm"><use href="#ic-trash"/></svg></span>
        </div>
        <div class="lane-folder-edit">
          <span class="prefix">/</span>
          <input type="text" value="${cat.folder}" data-folder-edit="${cat.id}" placeholder="Folder Name">
        </div>
        <div class="lane-chips">${chipsHtml}</div>
        <div class="lane-add-row">
          <input placeholder="+ extension" data-quick-input="${cat.id}">
          <button data-quick-add="${cat.id}"><svg class="icon sm"><use href="#ic-plus"/></svg></button>
        </div>
      `;
      lanesScroll.appendChild(lane);
    });

    const addLane = document.createElement('div');
    addLane.className = 'lane-new';
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
        const val = input.value.trim().toLowerCase().replace(/^\./,'');
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
          <div class="preset-card-top">${iconSvg(preset.icon || 'ic-file', preset.id)}${preset.name}</div>
          <div class="preset-card-sub">/${preset.folder} · .${preset.exts.slice(0,3).join(', .')}</div>
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
      const exts = el('newCatExts') ? el('newCatExts').value.split(',').map(s => s.trim().toLowerCase().replace(/^\./,'')).filter(Boolean) : [];
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
      if (r.folder) destFolders.push(r.folder);
      r.exts.forEach(e => validExts.add(e.toLowerCase()));
    });

    const folder = '/storage/emulated/0/Download';
    const pruneExpr = destFolders.map(df => `-name "${df}"`).join(' -o ');
    const pruneCmd = pruneExpr ? `\\( -name ".*" -o ${pruneExpr} \\) -prune -o` : `\\( -name ".*" \\) -prune -o`;
    
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
    organizeBtn.onclick = () => {
      autoSaveConfig();
      log('=== Starting Organize Execution ===', 'info');
      
      setStatus('busy', 'organizing…');
      if (consoleRing) consoleRing.classList.add('live');
      log('Applying rules and moving files via action engine...', 'info');

      const modulePath = getModulePath();
      const actionCmd = `sh "${modulePath}/action.sh" 2>&1 || sh /storage/emulated/0/.down-loadout/action.sh 2>&1 || sh /sdcard/.down-loadout/action.sh 2>&1`;
      
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