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

  loadShortcuts();

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    setColorTheme(savedTheme);
  }

  const savedKeyboardShortcutsEnabled = localStorage.getItem('keyboardShortcutsEnabled');
  if (savedKeyboardShortcutsEnabled) {
    setKeyboardShortcutsEnabled(savedKeyboardShortcutsEnabled);
  }

  const savedDir = localStorage.getItem('dir');
  if (savedDir) {
    setDirection(savedDir);
  }
  const savedIconSize = localStorage.getItem('iconSize');
  if (savedIconSize) {
    setShortcutIcon(savedIconSize);
  }
  // If there's a saved token, try to use it
  const savedToken = localStorage.getItem('accessToken');
  if (savedToken) { // might be a aproblem, the code does nothing if there's no token
    accessToken = savedToken;
    signinBtn.textContent = '🚪 Sign out';

    // Try listing tasks, if it fails, refresh the token
    listTasks().catch(err => {
      console.warn('Saved token invalid, requesting new token...', err);
      tokenClient.requestAccessToken(); // Request a new token
    });

  }
  setInterval(listTasks, 30000); // 30000 ms = 30 seconds
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
  signinBtn.textContent = '🚪 Sign out';
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
      signinBtn.textContent = '🚪 Sign out';
      listTasks();
    } else {
      // Silent sign-in first
      tokenClient.callback = handleTokenResponse;
      tokenClient.requestAccessToken({ prompt: '' });
    }
  }
};

function signOut() {
  accessToken = null;
  localStorage.removeItem('accessToken');
  taskListEl.innerHTML = '';
  signinBtn.textContent = '🔐 Sign in';
}

const timeFilterMap = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

// ==== TASKS ====
async function listTasks() {
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

    taskListEl.innerHTML = '';
    relevantTasks.forEach((task) => {
      const li = document.createElement('li');
      li.className = 'task-item';
      li.style.position = 'relative';
      if (task.status === 'completed') li.classList.add('completed');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.status === 'completed';

      checkbox.addEventListener('change', async () => {
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
      });

      const titleSpan = document.createElement('span');
      titleSpan.textContent = task.title;

      const notesSpan = document.createElement('span');
      notesSpan.className = 'task-desc';
      notesSpan.textContent = task.notes || '';

      // --- EDIT BUTTON ---
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '✏️';
      editBtn.className = 'edit-btn';
      let editing = false;

      editBtn.onclick = async () => {
        if (!editing) {
          // Edit mode
          const titleInput = document.createElement('input');
          titleInput.type = 'text';
          titleInput.value = task.title;
          titleInput.className = 'edit-input';

          const notesInput = document.createElement('textarea');
          notesInput.type = 'text';
          notesInput.value = task.notes || '';
          notesInput.className = 'edit-input notes-input';

          li.replaceChild(titleInput, titleSpan);
          if (task.notes || notesSpan.parentNode) {
            li.replaceChild(notesInput, notesSpan);
          } else {
            li.appendChild(notesInput);
          }

          editBtn.innerHTML = '💾';
          editing = true;
        } else {
          // Save mode
          const newTitle = li.querySelector('input[type="text"]').value.trim();
          const newNotes = li.querySelector('.notes-input')?.value.trim() || '';

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

            li.replaceChild(titleSpan, li.querySelector('input[type="text"]'));
            const notesInputEl = li.querySelector('.notes-input');
            if (notesInputEl) {
              li.replaceChild(notesSpan, notesInputEl);
            }

            editBtn.innerHTML = '✏️';
            editing = false;
          } catch (err) {
            console.error('Failed to update task:', err);
          }
        }
      };

      li.appendChild(checkbox);
      li.appendChild(titleSpan);
      if (task.notes) li.appendChild(notesSpan);
      li.appendChild(editBtn);
      taskListEl.appendChild(li);
    });

  } catch (err) {
    console.error('Error loading tasks:', err);
    throw err; // Let gsiLoaded() catch it and request a new token
  }
}



// ==== SHORTCUTS ====
function loadShortcuts() {
  const defaults = [
    { name: 'Google', url: 'https://www.google.com' },
    { name: 'YouTube', url: 'https://youtube.com' },
    { name: 'Gmail', url: 'https://mail.google.com' },
    { name: 'Calendar', url: 'https://calendar.google.com' },
  ];
  const saved = JSON.parse(localStorage.getItem('shortcuts')) || defaults;
  shortcutsEl.innerHTML = '';

  const add = document.createElement('button');
  add.className = 'shortcut add';
  add.textContent = '➕ Add Shortcut';
  add.onclick = () => {
    const name = prompt('Enter shortcut name:');
    let url = prompt('Enter shortcut URL:');
    if (name && url) {
      if (!url.startsWith('http')) url = 'https://' + url;
      addNewShortcut(name, url);
    }
  };
  shortcutsEl.appendChild(add);

  saved.forEach(sc => {
    const a = document.createElement('a');
    a.href = sc.url;
    a.target = '_blank';
    a.className = 'shortcut';
    a.innerHTML = `
        <img src="https://logo.clearbit.com/${sc.url}">
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
  document.documentElement.setAttribute('dir', dir);
  document.querySelectorAll('#dir-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === dir)
  );

  localStorage.setItem('dir', dir);
}

function setShortcutIcon(sizeMode) {
  document.querySelectorAll('#icon-size-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === sizeMode)
  );
  if (sizeMode === 'hidden') {
    document.querySelectorAll('.shortcut img').forEach(icon => {
      icon.style.display = 'none';
    });
    return;
  }
  const size = sizeMode === 'small' ? 20 : sizeMode === 'large' ? 100 : 20;
  document.querySelectorAll('.shortcut').forEach(icon => {
    icon.style.flexDirection = sizeMode === 'small' ? 'row-reverse' : 'column';
  });
  document.querySelectorAll('.shortcut img').forEach(icon => {
    icon.style.display = 'flex';
    icon.style.width = `${size}px`;
    icon.style.height = `${size}px`;
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

document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target) && !e.target.classList.contains('settings-btn')) {
    settingsPanel.classList.remove('open');
  }
});

function hideNewTaskForm() {
  newTaskForm.style.display = 'none';
  // Clear input
  document.getElementById('new-task-title').value = '';
  document.getElementById('new-task-notes').value = '';
}
  

document.getElementById('show-new-task-form').addEventListener('click', (event) => {
  switch (newTaskForm.style.display) {
    case 'flex':
      event.target.textContent = '📝 Add New Task';
      hideNewTaskForm();
      break;
    case 'none':
    case '':
      newTaskForm.style.display = 'flex';
      event.target.textContent = 'Close ↪';
      break;
  }
});


document.getElementById('add-task-btn').addEventListener('click', async () => {
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
});

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
  switchTheme: 't',
  openSettings: 's'
};

// Load saved shortcuts if available
let keyboardShortcutMap = { ...Keyboard };  // Start with defaults
const savedKeyboardShortcuts = localStorage.getItem('keyboard shortcuts');

if (savedKeyboardShortcuts) {
  try {
    const parsed = JSON.parse(savedKeyboardShortcuts);
    // Merge: keep saved values but fall back to defaults for missing keys
    keyboardShortcutMap = { ...Keyboard, ...parsed };
    updateKeyboardShortcutsText();
  } catch (e) {
    console.warn('Invalid saved shortcuts, using defaults.');
  }
}

function updateKeyboardShortcutsText() {
  document.getElementById('new-task-shortcut-input').value = keyboardShortcutMap.addTask;
  document.getElementById('theme-shortcut-input').value = keyboardShortcutMap.switchTheme;
  document.getElementById('settings-shortcut-input').value = keyboardShortcutMap.openSettings;
}

function handleKeyDown(event) {
  if (document.body.classList.contains('type-mode') || !document.body.classList.contains('keyboard-shortcuts-enabled')) return; // ignore shortcuts while typing

  switch (event.key) {
    case keyboardShortcutMap.addTask:
      event.preventDefault();
      newTaskForm.style.display = 'flex';
      document.getElementById('new-task-title').focus();
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

document.getElementById('theme-shortcut-input').addEventListener('change', function (event) {
  updateShortcut('switchTheme', event.target.value);
});

document.getElementById('settings-shortcut-input').addEventListener('change', function (event) {
  updateShortcut('openSettings', event.target.value);
});