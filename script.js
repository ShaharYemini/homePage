// ==== CONFIG ====
const CLIENT_ID = '171375698400-erqrftseqjqalhf2rv73cpn8vcdorock.apps.googleusercontent.com';

let accessToken = null;
let tokenClient;

// ==== DOM ELEMENTS ====
const signinBtn = document.getElementById('signin-btn');
const taskListEl = document.getElementById('task-list');
const shortcutsEl = document.getElementById('shortcuts');
const settingsPanel = document.getElementById('settingsPanel');

// ==== AUTH ====
function gsiLoaded() {
  // Setup token client with the proper scope and callback
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/tasks',
    callback: (tokenResponse) => {
      accessToken = tokenResponse.access_token;
      localStorage.setItem('accessToken', accessToken);
      signinBtn.textContent = '🚪 Sign out';
      listTasks();
    },
  });

  loadShortcuts();

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    setColorTheme(savedTheme);
  }
  const savedDir = localStorage.getItem('dir');
  if (savedDir) {
    setDirection(savedDir);
  }
  const savedIconSize = localStorage.getItem('iconSize');
  if (savedIconSize) {
    setShortcutIcon(savedIconSize);
    console.log('iconSize', savedIconSize);
  }
  // If there's a saved token, try to use it
  const savedToken = localStorage.getItem('accessToken');
  if (savedToken) {
    accessToken = savedToken;
    signinBtn.textContent = '🚪 Sign out';

    // Try listing tasks, if it fails, refresh the token
    listTasks().catch(err => {
      console.warn('Saved token invalid, requesting new token...', err);
      tokenClient.requestAccessToken(); // Request a new token
    });
  }
}


signinBtn.onclick = () => {
  if (accessToken) {
    signOut();
  } else {
    tokenClient.requestAccessToken();
  }
};

function signOut() {
  accessToken = null;
  localStorage.removeItem('accessToken');
  taskListEl.innerHTML = '';
  signinBtn.textContent = '🔐 Sign in';
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

    // Sort: incomplete first, then completed
    visibleTasks.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      return 0;
    });

    taskListEl.innerHTML = '';
    visibleTasks.forEach((task) => {
      if (!task.hidden) {
        const li = document.createElement('li');
        li.className = 'task-item';
        if (task.status === 'completed') {
          li.classList.add('completed');
        }
      
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.status === 'completed';

        checkbox.addEventListener('change', async () => {
          const newStatus = checkbox.checked ? 'completed' : 'needsAction';
          li.classList.toggle('completed', checkbox.checked);

          // Move visually
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

        const label = document.createElement('span');
        label.textContent = task.title;
        li.appendChild(checkbox);
        li.appendChild(label);
        if (task.notes) {
          const desc = document.createElement('span');
          desc.className = 'task-desc';
          desc.textContent = task.notes;
          li.appendChild(desc);
        }
        taskListEl.appendChild(li);
      }
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

  const add = document.createElement('div');
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
    removeBtn.textContent = '×';
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
  console.log('hello', sizeMode);
  localStorage.setItem('iconSize', sizeMode);
}

const themes = {
  bright: {
    '--bg-color': '#f5f7fa',
    '--items-color': 'white',
    '--text-color': '#333',
    '--accent-color': '#a8dadc',
    '--special-color': '#83c5be'
  },
  dark: {
    '--bg-color': '#1e1e1e',
    '--items-color': '#2c2c2c',
    '--text-color': '#eee',
    '--accent-color': '#ff9800',
    '--special-color': '#03dac6'
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

document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target) && !e.target.classList.contains('settings-btn')) {
    settingsPanel.classList.remove('open');
  }
});

document.getElementById('show-new-task-form').addEventListener('click', (event) => {
  const form = document.querySelector('.new-task-form');
  form.style.display = 'flex';
  event.target.style.display = 'none';
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

    // Clear input
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-notes').value = '';

    // Reload the task list
    listTasks();
  } catch (err) {
    console.error('Error adding task:', err);
    alert('Failed to add task.');
  }
  document.querySelector('.new-task-form').style.display = 'none';
  document.getElementById('show-new-task-form').style.display = 'flex';
});
