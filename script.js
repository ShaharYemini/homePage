// ==== CONFIG ====
const CLIENT_ID = '171375698400-erqrftseqjqalhf2rv73cpn8vcdorock.apps.googleusercontent.com';

let accessToken = null;
let tokenClient;

// ==== DOM ELEMENTS ====
const signinBtn = document.getElementById('signin-btn');
const taskListEl = document.getElementById('task-list');
const shortcutsEl = document.getElementById('shortcuts');
const settingsPanel = document.getElementById('settingsPanel');
const newTaskForm = document.querySelector('.new-task-form');

// ==== INIT ====
function gsiLoaded() {
  // Initialize the token client with the default callback
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/tasks',
    callback: handleTokenResponse,
  });


  const language = localStorage.getItem('language') || 'en';
  setLanguage(language);

  loadShortcuts();

  const shortcutListTheme = localStorage.getItem('theme');
  if (shortcutListTheme) {
    setColorTheme(shortcutListTheme);
  }

  const shortcutListKeyboardShortcutsEnabled = localStorage.getItem('keyboardShortcutsEnabled');
  if (shortcutListKeyboardShortcutsEnabled) {
    setKeyboardShortcutsEnabled(shortcutListKeyboardShortcutsEnabled);
  }

  const documentDirection = localStorage.getItem('dir');
  if (documentDirection) {
    setDirection(documentDirection);
  }
  // const savedIconSize = localStorage.getItem('iconSize');
  // if (savedIconSize) {
  //   setShortcutIcon(savedIconSize);
  // }
  // If there's a shortcutList token, try to use it
  const shortcutListToken = localStorage.getItem('accessToken');
  if (shortcutListToken) { // might be a aproblem, the code does nothing if there's no token
    accessToken = shortcutListToken;
    setLocalizedText(signinBtn, 'Sign out 🚪', 'התנתק 🚪');

    // Try listing tasks, if it fails, refresh the token
    listTasks().catch(err => {
      console.warn('Saved token invalid, requesting new token...', err);
      tokenClient.requestAccessToken(); // Request a new token
    });

  }
  setInterval(updateTasks, 30000); // 30000 ms = 30 seconds
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    listTasks();
  }
});

// Universal token response handler
function handleTokenResponse(tokenResponse) {
  if (tokenResponse.error) {
    // Silent sign-in failed — fallback to interactive
    tokenClient.callback = handleTokenResponse; // restore the handler
    tokenClient.requestAccessToken(); // interactive prompt
    return;
  }

  accessToken = tokenResponse.access_token;
  const expiresIn = tokenResponse.expires_in || 3600;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('expiresAt', Date.now() + expiresIn * 1000);
  setLocalizedText(signinBtn, 'Sign out 🚪', 'התנתק 🚪');
  listTasks();
}

signinBtn.onclick = () => {
  if (accessToken) {
    signOut();
  } else {
    const savedToken = localStorage.getItem('accessToken');
    const expiresAt = localStorage.getItem('expiresAt');
    if (savedToken && expiresAt && Date.now() < Number(expiresAt)) {
      accessToken = savedToken;
      setLocalizedText(signinBtn, 'Sign out 🚪', 'התנתק 🚪');
      listTasks();
    } else {
      // Silent sign-in first
      tokenClient.callback = handleTokenResponse;
      tokenClient.requestAccessToken({ prompt: 'none' });
    }
  }
};

function signOut() {
  accessToken = null;
  localStorage.removeItem('accessToken');
  taskListEl.innerHTML = '';
  setLocalizedText(signinBtn, 'Sign in 🔐', 'התחבר 🔐');
}

const timeFilterMap = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}


// ==== TASKS ====
async function fetchTasksData() {
  try {
    const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listsRes.ok) {
      throw new Error(`HTTP ${listsRes.status}`);
    }

    const listsData = await listsRes.json();
    if (!listsData.items || listsData.items.length === 0) {
      throw new Error('No task lists found');
    }

    const taskListId = listsData.items[0].id;

    const tasksRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!tasksRes.ok) {
      throw new Error(`HTTP ${tasksRes.status}`);
    }

    const tasksData = await tasksRes.json();
    return { tasksData, taskListId };
  } catch (err) {
    console.error('Error fetching tasks:', err);
    throw err;
  }
}

function extractRelevantTasks(tasksData) {
  // Filter out hidden tasks
  const visibleTasks = tasksData.items.filter(task => !task.hidden);

  const now = new Date();
  const timeFilter = localStorage.getItem('timeFilter') || '24h';
  const timeRange = timeFilterMap[timeFilter];
  const relevantTasks = visibleTasks.filter(task =>
    !task.completed || now - new Date(task.completed) < timeRange
  );
  // Here I tried to actually set tasks to be hidden if they are completed more than 24h ago, but it didn't work. The line above is a workaround.

  // Sort: incomplete first, then completed
  relevantTasks.sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return 0;
  });
  return relevantTasks;
}

async function updateTasks() {
  const { tasksData, taskListId } = await fetchTasksData();
  const relevantTasks = extractRelevantTasks(tasksData);

  // Here this functiion changes significantly from listTasks:

    const currentTasks = Array.from(taskListEl.querySelectorAll('.task-item'));
  relevantTasks.forEach((task) => {
    const existingTask = currentTasks.find(t => t.dataset.taskId === task.id);
    if (existingTask) {
      // Check if any changes are needed, and only if so, update the task
      const checkbox = existingTask.querySelector('.task-checkbox');
      const compareStatus = checkbox.checked === (task.status === 'completed');
      const compareTitle = (existingTask.querySelector('.task-title').textContent || '') === (task.title || '');
      const compareNotes = (existingTask.querySelector('.task-desc').textContent || '') === (task.notes || '');
      if (compareStatus && compareTitle && compareNotes) {
        // Remove the existing task from the list
        currentTasks.splice(currentTasks.indexOf(existingTask), 1);
        return; // No changes needed
      } else {
        taskListEl.removeChild(existingTask); // Remove the existing task that was changed from the list, so it can be recreated
      }
    }
    // else if the task is not in the list or was changed, create a new one
    const template = document.getElementById('task-template');
    const clone = template.content.cloneNode(true);
    const li = clone.querySelector('.task-item');
    li.dataset.taskId = task.id;

    const checkbox = li.querySelector('.task-checkbox');
    const titleSpan = li.querySelector('.task-title');
    const notesSpan = li.querySelector('.task-desc');
    const editBtn = li.querySelector('.edit-btn');

    if (task.status === 'completed') li.classList.add('completed');
    checkbox.checked = task.status === 'completed';
    checkbox.addEventListener('change', async () => {
      handleChecbox(checkbox, task, taskListId);
    });
    titleSpan.textContent = task.title;
    notesSpan.textContent = task.notes || '';

    editButtonActivation(editBtn, task, titleSpan, notesSpan, li, taskListId);

    taskListEl.appendChild(li);
  });
}

async function listTasks() {
  const { tasksData, taskListId } = await fetchTasksData();
  const relevantTasks = extractRelevantTasks(tasksData);

  taskListEl.innerHTML = '';
  relevantTasks.forEach((task) => {
    const template = document.getElementById('task-template');
    const clone = template.content.cloneNode(true);
    const li = clone.querySelector('.task-item');
    li.dataset.taskId = task.id;

    const checkbox = li.querySelector('.task-checkbox');
    const titleSpan = li.querySelector('.task-title');
    const notesSpan = li.querySelector('.task-desc');
    const editBtn = li.querySelector('.edit-btn');

    if (task.status === 'completed') li.classList.add('completed');
    checkbox.checked = task.status === 'completed';
    checkbox.addEventListener('change', async () => {
      handleChecbox(checkbox, task, taskListId);
    });
    titleSpan.textContent = task.title;
    notesSpan.textContent = task.notes || '';

    editButtonActivation(editBtn, task, li, taskListId);

    taskListEl.appendChild(li);
  });
}

async function handleChecbox(checkbox, task, taskListId) {
  const li = checkbox.parentNode;
  const newStatus = checkbox.checked ? 'completed' : 'needsAction';
  li.classList.toggle('completed', checkbox.checked);
  checkbox.checked ? taskListEl.appendChild(li) : taskListEl.prepend(li);

  try {
    await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: newStatus,
        completed: checkbox.checked ? new Date().toISOString() : null
      })
    });
  } catch (err) {
    console.error('Failed to update task status:', err);
  }
}

function editButtonActivation(editBtn, task, li, taskListId) {
  const titleSpan = li.querySelector('.task-title');
  const notesSpan = li.querySelector('.task-desc');

  const titleInput = li.querySelector('.edit-title');
  const notesInput = li.querySelector('.edit-notes');

  let editing = false;

  editBtn.onclick = async () => {
    if (!editing) {
      titleInput.value = task.title;
      notesInput.value = task.notes || '';

      li.classList.toggle('editing');
      
      editBtn.innerHTML = '💾';
      editing = true;
    } else {
      // Save mode
      const newTitle = titleInput.value.trim();
      const newNotes = notesInput.value.trim() || '';

      try {
        await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${task.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...task,
            title: newTitle,
            notes: newNotes
          })
        });

        task.title = newTitle;
        task.notes = newNotes;

        titleSpan.textContent = newTitle;
        notesSpan.textContent = newNotes;

        li.classList.toggle('editing');
        // li.replaceChild(titleSpan, li.querySelector('input[type="text"]'));
        // const notesInputEl = li.querySelector('.notes-input');
        // if (notesInputEl) {
        //   li.replaceChild(notesSpan, notesInputEl);
        // }

        editBtn.innerHTML = '✏️';
        editing = false;
      } catch (err) {
        console.error('Failed to update task:', err);
      }
    }
  };
}

function addShortcutForm() {
  const AddShortcutForm = document.getElementById('add-shortcut-form');
  AddShortcutForm.classList.toggle('hidden');
  if (AddShortcutForm.classList.contains('hidden')) {
    setLocalizedText(document.getElementById('show-add-shortcut-form'), '➕ Add Shortcut', '➕ הוסף קיצור דרך');
  } else {
    setLocalizedText(document.getElementById('show-add-shortcut-form'), 'Close ↪', 'סגור ↪');
  }
  document.getElementById('show-add-shortcut-form').classList.toggle('showing');
}

// ==== SHORTCUTS ====
function loadShortcuts() {
  const defaults = [
    { name: 'Google', url: 'https://www.google.com' },
    { name: 'YouTube', url: 'https://youtube.com' },
    { name: 'Gmail', url: 'https://mail.google.com' },
    { name: 'Calendar', url: 'https://calendar.google.com' },
  ];
  let shortcutList = JSON.parse(localStorage.getItem('shortcuts'));
  if (!shortcutList) {
    localStorage.setItem('shortcuts', JSON.stringify(defaults));
    shortcutList = defaults;
    return;
  }
  shortcutsEl.innerHTML = '';
  shortcutList.forEach(sc => {
    const a = document.createElement('a');
    a.href = sc.url;
    a.target = '_blank';
    a.className = 'shortcut';
    a.innerHTML = `
      <img 
        src="https://logo.clearbit.com/${sc.url}" 
        onerror="this.onerror=null; this.src='images/fallback_shortcut_icon.png';"
        alt="Navigate to ${sc.name}"
      >
      <span>${sc.name}</span>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '❌';
    removeBtn.onclick = (e) => {
      e.preventDefault();
      removeShortcut(sc.url);
    };
    a.appendChild(removeBtn);
    shortcutsEl.appendChild(a);
  });

  const savedIconSize = localStorage.getItem('iconSize');
  if (savedIconSize) {
    setShortcutIcon(savedIconSize);
  } else {
    setShortcutIcon('small');
  }
}

function addShortcut() {
  const nameElement = document.getElementById('shortcut-name');
  const urlElement = document.getElementById('shortcut-url');
  const name = nameElement.value.trim();
  let url = urlElement.value.trim();
  if (!name || !url) {
    alert('Please enter a shortcut name and URL.');
    return;
  }
  if (!url.startsWith('http')) url = 'https://' + url;
  nameElement.value = '';
  urlElement.value = '';
  addNewShortcut(name, url);
  addShortcutForm();
}


function addNewShortcut(name, url) {
  const list = JSON.parse(localStorage.getItem('shortcuts')) || [];
  list.push({ name, url });
  localStorage.setItem('shortcuts', JSON.stringify(list));
  loadShortcuts();
}

function removeShortcut(url) {
  const list = JSON.parse(localStorage.getItem('shortcuts')) || [];
  const updated = list.filter(sc => sc.url !== url);
  localStorage.setItem('shortcuts', JSON.stringify(updated));
  loadShortcuts();
}

// ==== SETTINGS ====
function toggleSettings() {
  settingsPanel.classList.toggle('open');
}

function setDirection(dir) {
  document.querySelector('.tasks-container').setAttribute('dir', dir);

  document.querySelectorAll('#dir-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === dir)
  );

  localStorage.setItem('dir', dir);
}

function setShortcutIcon(sizeMode) {
  document.querySelectorAll('#icon-size-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === sizeMode)
  );

  document.querySelectorAll('.shortcut img').forEach(icon => {
    icon.className = sizeMode;
  });

  localStorage.setItem('iconSize', sizeMode);
}

const themes = {
  // For the theme shortcut, the order here as to be the same as in the UI in the settings panel, from ledt to right.
  bright: {
    '--bg-color': '#f5f7fa',
    '--items-color': 'white',
    '--text-color': '#333',
    '--accent-color': '#a8dadc',
    '--special-color': '#83c5be'
  },
  warm: {
    '--bg-color': '#fff8f0',
    '--items-color': '#fff0e5',
    '--text-color': '#4b2e2e',
    '--accent-color': '#ff8a65',
    '--special-color': '#ffd180'
  },
  blossom: {
    '--bg-color': '#fff0f6',        // soft pink background
    '--items-color': '#ffe4ec',     // lighter pink for items
    '--text-color': '#4b2e39',      // deep rosewood for contrast
    '--accent-color': '#f78fb3',    // rosy accent
    '--special-color': '#cdb4db'    // lavender-pink, for sweet balance
  },
  dark: {
    '--bg-color': '#1e1e1e',
    '--items-color': '#2c2c2c',
    '--text-color': '#eee',
    '--accent-color': '#ff9800',
    '--special-color': '#cc7a00'
  }
};

function setColorTheme(themeName) {
  const theme = themes[themeName];
  if (!theme) return;

  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  document.querySelectorAll('#theme-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === themeName)
  );

  if (themeName === 'dark') {
    setShortcutIcon('hidden');
  }

  localStorage.setItem('theme', themeName);
}

function setKeyboardShortcutsEnabled(enabled) {
  document.body.classList.toggle('keyboard-shortcuts-enabled', enabled === 'enabled');

  document.querySelectorAll('.keyboard-shortcut-container').forEach(container =>
    container.classList.toggle('disabled', enabled !== 'enabled')
  );

  document.querySelectorAll('#keyboard-shortcuts-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === enabled)
  );

  localStorage.setItem('keyboardShortcutsEnabled', enabled);
}

function setTimeFilterTasks(range) {
  document.querySelectorAll('#time-filter-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === range)
  );

  localStorage.setItem('timeFilter', range);
  listTasks();
}

function applyLanguageToElement(el, lang = document.documentElement.lang) {
  if (el.dataset[lang]) {
    if ('placeholder' in el) el.placeholder = el.dataset[lang];
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.dataset[lang]);
    else el.textContent = el.dataset[lang];
  }
}

function setLanguage(lang) {
  document.querySelectorAll('#language-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === lang)
  );

  localStorage.setItem('language', lang);

  document.documentElement.lang = lang;

  document.querySelectorAll('[data-en][data-he]').forEach(el => {
    applyLanguageToElement(el, lang);
  });

  document.querySelector('#settingsPanel').setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
}

function setLocalizedText(el, enText, heText) {
  el.dataset.en = enText;
  el.dataset.he = heText;
  el.textContent = el.dataset[document.documentElement.lang];
}

const observer = new MutationObserver(mutations => {
  const lang = document.documentElement.lang;
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1) {
        applyLanguageToElement(node, lang);
        node.querySelectorAll('[data-en][data-he]').forEach(child => {
          applyLanguageToElement(child, lang);
        });
      }
    });
  });
});

observer.observe(document.body, { childList: true, subtree: true });


document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target) && !e.target.classList.contains('settings-btn')) {
    settingsPanel.classList.remove('open');
  }
});

function hideNewTaskForm() {
  newTaskForm.style.display = 'none';
  setLocalizedText(document.getElementById('show-new-task-form'), '📝 Add New Task', '📝 הוסף משימה חדשה');
  // Clear input
  document.getElementById('new-task-title').value = '';
  document.getElementById('new-task-notes').value = '';
  document.querySelector('.tasks-container').classList.remove('with-new-task-form');
}

function showNewTaskForm() {
  newTaskForm.style.display = 'flex';
  document.getElementById('new-task-title').focus();
  setLocalizedText(document.getElementById('show-new-task-form'), 'Close ↪', 'סגור ↪');
  document.querySelector('.tasks-container').classList.add('with-new-task-form');
}


document.getElementById('show-new-task-form').addEventListener('click', (event) => {
  switch (newTaskForm.style.display) {
    case 'flex':
      hideNewTaskForm();
      break;
    case 'none':
    case '':
      showNewTaskForm();
      break;
  }
});


document.getElementById('add-task-btn').addEventListener('click', async () => {
  handleAddTask();
});

async function handleAddTask() {
  const title = document.getElementById('new-task-title').value.trim();
  const notes = document.getElementById('new-task-notes').value.trim();

  if (!title) {
    alert('Please enter a task title.');
    return;
  }

  try {
    const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const taskListId = (await listsRes.json()).items[0].id;

    await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title,
        notes,
      }),
    });

    // Reload the task list
    listTasks();
  } catch (err) {
    console.error('Error adding task:', err);
    alert('Failed to add task.');
  }
  hideNewTaskForm();
}

// ==== KEYBOARD SHORTCUTS ====
// Have to call them "keyboard shortcuts" because "shortcuts" is already used in the code above.	
document.addEventListener('focusin', (event) => {
  if (['input', 'textarea'].includes(event.target.tagName.toLowerCase())) {
    document.body.classList.add('type-mode');
  }
});

document.addEventListener('focusout', (event) => {
  if (['input', 'textarea'].includes(event.target.tagName.toLowerCase())) {
    document.body.classList.remove('type-mode');
  }
});

// Default shortcut map
const defaultKeyboardShortcuts = {
  addTask: 'n',
  submitTask: 'e',
  switchTheme: 't',
  openSettings: 's'
};

const savedKeyboardShortcuts = localStorage.getItem('keyboard shortcuts');

if (savedKeyboardShortcuts) {
  try {
    const parsed = JSON.parse(savedKeyboardShortcuts);
    // Merge each key with fallback
    keyboardShortcutMap = {};

    for (const key in defaultKeyboardShortcuts) {
      const saved = parsed[key];
      keyboardShortcutMap[key] =
        typeof saved === 'string' && saved.trim() !== ''
          ? saved
          : defaultKeyboardShortcuts[key];
    }

    updateKeyboardShortcutsText();
  } catch (e) {
    console.warn('Invalid saved shortcuts, using defaults.');
    keyboardShortcutMap = { ...defaultKeyboardShortcuts };
  }
} else {
  keyboardShortcutMap = { ...defaultKeyboardShortcuts };
}


function updateKeyboardShortcutsText() {
  document.getElementById('new-task-shortcut-input').value = keyboardShortcutMap.addTask;
  document.getElementById('submit-task-shortcut-input').value = keyboardShortcutMap.submitTask;
  document.getElementById('theme-shortcut-input').value = keyboardShortcutMap.switchTheme;
  document.getElementById('settings-shortcut-input').value = keyboardShortcutMap.openSettings;
}

function handleKeyDown(event) {
  if (document.body.classList.contains('type-mode') || !document.body.classList.contains('keyboard-shortcuts-enabled')) return; // ignore shortcuts while typing

  switch (event.key) {
    case keyboardShortcutMap.addTask:
      event.preventDefault();
      showNewTaskForm();
      break;
    case keyboardShortcutMap.submitTask:
      event.preventDefault();
      handleAddTask();
      break;
    case keyboardShortcutMap.switchTheme:
      event.preventDefault();
      const savedTheme = localStorage.getItem('theme');
      const themesList = Object.keys(themes);
      const currentThemeIndex = themesList.indexOf(savedTheme);
      const nextThemeIndex = (currentThemeIndex + 1) % themesList.length;
      const nextTheme = themesList[nextThemeIndex];
      setColorTheme(nextTheme);
      break;
    case keyboardShortcutMap.openSettings:
      event.preventDefault();
      toggleSettings();
      break;
    default:
      break;
  }
}

document.addEventListener('keydown', handleKeyDown);

function updateShortcut(action, newKey) {
  if (newKey in keyboardShortcutMap || !newKey || newKey == ' ') {
    updateKeyboardShortcutsText();
    return;
  }
  keyboardShortcutMap[action] = newKey;
  localStorage.setItem('keyboard shortcuts', JSON.stringify(keyboardShortcutMap));
}

document.getElementById('new-task-shortcut-input').addEventListener('change', function (event) {
  updateShortcut('addTask', event.target.value);
});

document.getElementById('submit-task-shortcut-input').addEventListener('change', function (event) {
  updateShortcut('submitTask', event.target.value);
});

document.getElementById('theme-shortcut-input').addEventListener('change', function (event) {
  updateShortcut('switchTheme', event.target.value);
});

document.getElementById('settings-shortcut-input').addEventListener('change', function (event) {
  updateShortcut('openSettings', event.target.value);
});