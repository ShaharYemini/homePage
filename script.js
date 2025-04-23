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

    const savedToken = localStorage.getItem('accessToken');
    if (savedToken) {
        accessToken = savedToken;
        signinBtn.textContent = '🚪 Sign out';
        listTasks();
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
        const taskListId = (await listsRes.json()).items[0].id;

        const tasksRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const tasks = (await tasksRes.json()).items || [];
        taskListEl.innerHTML = '';
        // Filter out hidden tasks
        const visibleTasks = tasks; //.filter(task => !task.hidden);

        // Sort: incomplete first, then completed
        visibleTasks.sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return 1;
            if (a.status !== 'completed' && b.status === 'completed') return -1;
            return 0;
        });

        // Render tasks
        visibleTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item';
            if (task.status === 'completed') {
                li.classList.add('completed');
            }

            li.innerHTML = `
    <input type="checkbox" ${task.status === 'completed' ? 'checked' : ''}>
    <span>${task.title}</span>
    ${task.notes ? `<span class="task-desc">${task.notes}</span>` : ''}
  `;

            const checkbox = li.querySelector('input[type="checkbox"]');
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

            taskListEl.appendChild(li);
        });
    } catch (err) {
        console.error('Error loading tasks:', err);
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

    saved.forEach(sc => {
        const a = document.createElement('a');
        a.href = sc.url;
        a.target = '_blank';
        a.className = 'shortcut';
        a.innerHTML = `
      <span>${sc.name}</span>
      <img src="https://www.google.com/s2/favicons?sz=32&domain_url=${sc.url}" width="16" height="16">
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
    document.querySelectorAll('.toggle-option').forEach(opt =>
        opt.classList.toggle('active', opt.dataset.dir === dir)
    );
}

document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) && !e.target.classList.contains('settings-btn')) {
        settingsPanel.classList.remove('open');
    }
});

// ==== INIT ====
window.onload = () => {
    const savedToken = localStorage.getItem('accessToken');
    if (savedToken) {
        accessToken = savedToken;
        signinBtn.textContent = '🚪 Sign out';
        listTasks();
    }
    loadShortcuts();
};
