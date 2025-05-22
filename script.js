// ==== CONFIG ====
const CLIENT_ID = '171375698400-erqrftseqjqalhf2rv73cpn8vcdorock.apps.googleusercontent.com';

let accessToken = null;
let tokenClient;
let keyboardShortcutMap;
let currentTabIndex = 0;
let chartMade = false;
let tasksChart;
let tasksChart2;

// ==== DOM ELEMENTS ====
// Should add here every dom element that appears constantly
const tasksContainer = document.getElementById('tasks-container');
const signinBtn = document.getElementById('signin-btn');
const taskListEl = document.getElementById('task-list');
const shortcutsEl = document.getElementById('shortcuts');
const settingsPanel = document.getElementById('settingsPanel');
const newTaskForm = document.getElementById('new-task-form');
const searchBar = document.getElementById('search-bar');
const chartSlider = document.getElementById('chart-slider');

// ==== CONSTS & MAPS ====
const timeFilterMap = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const encourageSentenceTemplates = [
  (num, timeEn, timeHe) => [`You've done ${num} tasks in the last ${timeEn}! Keep it up!`, `עשית ${num} משימות תוך ${timeHe}. תמשיך ככה!`],
  (num, timeEn, timeHe) => [`It's unbelievable! You've done ${num} tasks in the last ${timeEn}!`, `זה לא יאמן! עשית ${num} משימות תוך ${timeHe}!`],
  (num, timeEn, timeHe) => [`Wow! ${num} tasks in ${timeEn}? You're on fire!`, `וואו! ${num} משימות ב${timeHe}? אש אחי!`],
  (num, timeEn, timeHe) => [`You're crushing it — ${num} tasks completed in just ${timeEn}.`, `אתה אוכל את זה בלי מלח — ${num} משימות הושלמו תוך ${timeHe}.`],
  (num, timeEn, timeHe) => [`${num} tasks in ${timeEn}. That's real focus.`, `${num} משימות תוך ${timeHe}. זה מיקוד אמיתי.`],
  (num, timeEn, timeHe) => [`Impressive pace: ${num} tasks in ${timeEn}!`, `קצב מרשים: ${num} משימות תוך ${timeHe}!`],
  (num, timeEn, timeHe) => [`You’re building momentum — ${num} tasks in ${timeEn}!`, `אתה צובר תאוצה — ${num} משימות תוך-${timeHe}!`]
];

const weekdaysList = [
  { he: 'יום ראשון', en: 'Sunday' },
  { he: 'יום שני', en: 'Monday' },
  { he: 'יום שלישי', en: 'Tuesday' },
  { he: 'יום רביעי', en: 'Wednesday' },
  { he: 'יום חמישי', en: 'Thursday' },
  { he: 'יום שישי', en: 'Friday' },
  { he: 'שבת', en: 'Saturday' }
];

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

const weekdayCodes = [
  { he: 'א\'', en: 'Sun' },
  { he: 'ב\'', en: 'Mon' },
  { he: 'ג\'', en: 'Tue' },
  { he: 'ד\'', en: 'Wed' },
  { he: 'ה\'', en: 'Thu' },
  { he: 'ו\'', en: 'Fri' },
  { he: 'ש', en: 'Sat' }
];

// Default shortcut map
const defaultKeyboardShortcuts = {
  openSearchBar: ' ',
  addTask: 'n',
  submitTask: 'e',
  switchTheme: 't',
  openSettings: 's',
  switchView: 'v'
};

const tabList = {
  0: tasksContainer,
  1: document.getElementById('chart-container')
}

// ==== HELPER FUNCTIONS ====
function taskComparator(a, b) {
  if (a.status === 'completed' && b.status !== 'completed') return 1;
  if (a.status !== 'completed' && b.status === 'completed') return -1;
  return a.position.localeCompare(b.position);
}

function insertSorted(task, sortedTasks) {
  let low = 0, high = sortedTasks.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = taskComparator(task, sortedTasks[mid]);

    if (cmp < 0) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  sortedTasks.splice(low, 0, task); // Insert at found index
}

function insertSortedTaskToDOM(newTaskEl) {
  const ul = document.getElementById('task-list');
  const existingItems = Array.from(ul.querySelectorAll('li.task-item'));

  // Create a fake task object for comparison
  const newTask = {
    status: newTaskEl.classList.contains('completed') ? 'completed' : 'active',
    position: newTaskEl.dataset.position
  };

  let inserted = false;

  for (let li of existingItems) {
    const existingTask = {
      status: li.classList.contains('completed') ? 'completed' : 'active',
      position: li.dataset.position
    };

    if (taskComparator(newTask, existingTask) < 0) {
      ul.insertBefore(newTaskEl, li);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    ul.appendChild(newTaskEl);
  }
}

function isTyping() {
  const active = document.activeElement;
  const isTyping =
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.isContentEditable;

  return isTyping;
}

function getEncouragement(num, timeEn, timeHe) {
  // selects a template by the weekday
  const weekday = new Date().getDay();
  const template = encourageSentenceTemplates[weekday % encourageSentenceTemplates.length];
  return template(num, timeEn, timeHe);
}

// ==== INIT ====
function gsiLoaded() {
  // Initialize the token client with the default callback
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/tasks',
    callback: handleTokenResponse,
  });

  initKeyboardShortcuts();

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

  const taskCounterVisible = localStorage.getItem('taskCounterVisible');
  const checkbox = document.getElementById('show-task-counter');
  if (taskCounterVisible) {
    checkbox.checked = taskCounterVisible === 'visible';
  } else {
    checkbox.checked = true;
  }
  setTaskCounterVisibiity();

  const encouragementSentenceVisible = localStorage.getItem('encouragementSentenceVisible');
  const checkbox2 = document.getElementById('show-encouragement-sentence');
  if (encouragementSentenceVisible) {
    checkbox2.checked = encouragementSentenceVisible === 'visible';
  } else {
    checkbox2.checked = true;
  }
  setEncouragementSentenceVisibility();

  const listToggleDisplay = localStorage.getItem('listToggleDisplay');
  const checkbox3 = document.getElementById('show-list-toggle');
  if (listToggleDisplay) {
    checkbox3.checked = listToggleDisplay === 'homePage';
  } else {
    checkbox3.checked = true;
  }
  setListToggleDisplay();

  const bgChartVisible = localStorage.getItem('bgChartVisible');
  const checkbox4 = document.getElementById('show-bg-chart');
  if (bgChartVisible) {
    checkbox4.checked = bgChartVisible === 'visible';
  } else {
    checkbox4.checked = false;
  }
  setBGChartVisibility();

  loadWeekdaysCheckboxes();

  const chartSliderValue = localStorage.getItem('chartSliderValue');
  const chartSliderLabel = document.getElementById('chart-slider-label');
  if (chartSliderValue) {
    chartSlider.value = chartSliderValue;
    setLocalizedText(chartSliderLabel, `Time intervals: ${chartSliderValue} hours`, `פרקי זמן: ${chartSliderValue} שעות`);
  } else {
    chartSlider.value = 1;
    localStorage.setItem('chartSliderValue', 1);
    setLocalizedText(chartSliderLabel, `Time intervals: 1 hours`, `פרקי זמן: 1 שעות`);
  }


  const savedToken = localStorage.getItem('accessToken');
  const expiresAt = Number(localStorage.getItem('expiresAt'));

  if (savedToken && Date.now() < expiresAt) {
    accessToken = savedToken;
    setLocalizedText(signinBtn, 'Sign out 🚪', 'התנתק 🚪');
  } else {
    // Request token immediately if none or expired
    tokenClient.callback = handleTokenResponse;
    tokenClient.requestAccessToken(); // Will prompt user if needed
  }

  initTaskList().catch(err => {
    console.warn('Saved token invalid, requesting new token...', err);
    tokenClient.callback = handleTokenResponse;
    tokenClient.requestAccessToken(); // Request new token interactively
  });

  setInterval(updateTasks, 30000); // 30000 ms = 30 seconds
}

async function initTaskList() {
  const listsData = await fetchListsData();
  setListToggleSwitch(listsData.items, 'lists-toggle-switch');
  setListToggleSwitch(listsData.items, 'lists-toggle-switch-2');

  let taskListId = localStorage.getItem('taskListId');
  if (!taskListId) {
    taskListId = listsData.items[0].id;
    localStorage.setItem('taskListId', taskListId);
  }
  setCurrentList(taskListId);
  listTasks();
  updateTasks(); // to load faster, tasks are loaded in listTasks from local storage, only then an updates check is made.
}

// === API Logic ===
async function fetchListsData() {
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
    return listsData;
  } catch (err) {
    console.error('Error fetching task lists:', err);
    throw err;
  }
}

async function fetchTasksData(taskListId) {
  try {
    const tasksRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
    });

    if (!tasksRes.ok) {
      throw new Error(`HTTP ${tasksRes.status}`);
    }

    let tasksData = await tasksRes.json();
    let allItems = tasksData.items ? [...tasksData.items] : [];
    let nextPageToken = tasksData.nextPageToken;

    while (nextPageToken) {
      const nextRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?pageToken=${nextPageToken}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!nextRes.ok) {
        throw new Error(`HTTP ${nextRes.status}`);
      }
      const nextData = await nextRes.json();
      if (nextData.items) {
        allItems = allItems.concat(nextData.items);
      }
      nextPageToken = nextData.nextPageToken;
    }

    return allItems;
  } catch (err) {
    console.error('Error fetching tasks:', err);
    throw err;
  }
}

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
  initTaskList();
}

async function createTaskList(title) {
  const response = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  const data = await response.json();
  return data; // contains id, title, etc.
}

async function addTask() {
  let title = document.getElementById('new-task-title').value.trim();
  const notes = document.getElementById('new-task-notes').value.trim();
  const taskListId = localStorage.getItem('taskListId');
  const isRecurringTask = document.getElementById('show-reccuring-task-form').checked;

  if (!title) {
    alert('Please enter a task title.');
    return;
  }

  if (isRecurringTask) {
    // record the task title and notes, tasklistid, and days (future: time), and store in some format in the recurring tasks list
    let weekdays = [0, 1, 2, 3, 4, 5, 6];
    weekdays = weekdays.filter((n) => document.getElementById(`weekday-checkbox-number-${n}`).checked);
    const cycle = 'שבועי';
    const lang = document.documentElement.lang;
    const titleAddition = ` [${cycle}: ${weekdays.map(i => weekdayCodes[i][lang]).join(', ')}]`;
    title = title + titleAddition;
  }

  try {
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

  } catch (err) {
    console.error('Error adding task:', err);
    alert('Failed to add task.');
  }

  // Reload the task list
  updateTasks();
  hideNewTaskForm();
}

async function updateTaskStatus(task, taskListId, newStatus, completed = null) {
  try {
    await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: newStatus,
        completed: completed
      })
    });
  } catch (err) {
    console.error('Failed to update task status:', err);
  }
}

function handleSignBtnClick() {
  if (accessToken) {
    accessToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('expiresAt');
    localStorage.removeItem('taskListId');
    localStorage.removeItem('tasksData');

    taskListEl.innerHTML = '';
    setLocalizedText(signinBtn, 'Sign in 🔐', 'התחבר 🔐');
    document.getElementById('lists-toggle-switch').innerHTML = '';
  } else {
    // Silent sign-in first
    tokenClient.callback = handleTokenResponse;
    tokenClient.requestAccessToken({ prompt: 'none' });
  }
}

// ==== TASKS ====
function extractRelevantTasks(tasksData) {
  // Filter out hidden tasks
  const visibleTasks = tasksData;
  const now = new Date();
  const timeFilter = localStorage.getItem('timeFilter') || '24h';
  const timeRange = timeFilterMap[timeFilter];
  const relevantTasks1 = visibleTasks.filter(task =>
    !task.completed || now - new Date(task.completed) < timeRange
  );
  const relevantTasks2 = relevantTasks1.filter(task =>
    !task.title.includes('שבועי') || (task.title.includes(weekdayCodes[new Date().getDay()]['he']) || task.title.includes(weekdayCodes[new Date().getDay()]['en']))
  );
  now.setHours(0, 0, 0, 0);
  const taskListId = localStorage.getItem('taskListId');

  relevantTasks2.forEach((task) => {
    if (task.title.includes('שבועי') && new Date(task.completed) < now) {
      task.completed = null;
      updateTaskStatus(task, taskListId, 'needsAction');
    }
  });
  // Here I tried to actually set tasks to be hidden if they are completed more than 24h ago, but it didn't work. The line above is a workaround.

  relevantTasks2.sort((a, b) => { return taskComparator(a, b); });

  return relevantTasks2;
}

async function listTasks() {
  const taskListId = localStorage.getItem('taskListId');

  let tasksData = JSON.parse(localStorage.getItem('tasksData'));
  if (!tasksData) {
    tasksData = await fetchTasksData(taskListId);
  }
  updateTaskSentence(tasksData);
  const dataString = JSON.stringify(tasksData);
  localStorage.setItem('tasksData', dataString);
  const relevantTasks = extractRelevantTasks(tasksData);
  updateTasksCount(relevantTasks);

  taskListEl.innerHTML = '';
  relevantTasks.forEach((task) => {
    const li = createTaskElement(task, taskListId);
    taskListEl.appendChild(li);
  });

  if (!chartMade) {
    makeChart(relevantTasks);
  }
}

async function updateTasks() {
  const taskListId = localStorage.getItem('taskListId');
  const tasksData = await fetchTasksData(taskListId);
  updateTaskSentence(tasksData);
  const dataString = JSON.stringify(tasksData);
  localStorage.setItem('tasksData', dataString);

  const relevantTasks = extractRelevantTasks(tasksData);
  updateTasksCount(relevantTasks);

  // Here this functiion changes significantly from listTasks:
  let changed = false;
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
        currentTasks.splice(currentTasks.indexOf(existingTask), 1);
        changed = true;
      }
    } else {
      changed = true;
    }
    // else if the task is not in the list or was changed, create a new one
    const li = createTaskElement(task, taskListId);
    insertSortedTaskToDOM(li);
  });

  // Remove tasks that are no longer relevant
  currentTasks.forEach((taskIl) => {
    taskListEl.removeChild(taskIl);
    changed = true;
  })

  if (changed) {
    const { labels, data, completionsByHour, hourTasks } = processDataForChart(relevantTasks, chartSlider.value);
    updateChart(data, labels, completionsByHour, hourTasks);
  }
}

function createTaskElement(task, taskListId) {
  const template = document.getElementById('task-template');
  const clone = template.content.cloneNode(true);
  const li = clone.querySelector('.task-item');
  li.dataset.taskId = task.id;
  li.dataset.position = +task.position;


  const checkbox = li.querySelector('.task-checkbox');
  const titleSpan = li.querySelector('.task-title');
  const notesSpan = li.querySelector('.task-desc');
  const menuBtn = li.querySelector('.menu-btn');
  const editBtn = li.querySelector('.edit-btn');
  const discardBtn = li.querySelector('.discard-btn');
  const expandToggle = li.querySelector('.note-toggle');

  if (task.status === 'completed') li.classList.add('completed');
  checkbox.checked = task.status === 'completed';
  checkbox.addEventListener('change', async () => {
    handleCheckbox(checkbox, task, taskListId);
  });
  titleSpan.textContent = task.title;
  notesSpan.textContent = task.notes || '';

  menuBtnActivation(menuBtn, discardBtn, editBtn);
  discardBtnActivation(discardBtn, task, li, taskListId);
  editButtonActivation(editBtn, task, li, taskListId);

  if (notesSpan.textContent.length > 150) {
    expandToggle.classList.remove('hidden');
  }

  expandToggle.addEventListener('click', () => {
    notesSpan.classList.toggle('expanded');
    expandToggle.textContent = notesSpan.classList.contains('expanded') ? '⬇' : '⬆';
  });

  return li;
}

// == TASK COMPLETION ==
async function handleCheckbox(checkbox, task, taskListId) {
  const li = checkbox.parentNode;
  const newStatus = checkbox.checked ? 'completed' : 'needsAction';
  li.classList.toggle('completed', checkbox.checked);
  checkbox.checked ? taskListEl.appendChild(li) : taskListEl.prepend(li);
  const completed = checkbox.checked ? new Date().toISOString() : null;

  await updateTaskStatus(task, taskListId, newStatus, completed);

  updateTasksCount([], checkbox.checked ? -1 : 1);
}

function menuBtnActivation(menuBtn, discardBtn, editBtn) {
  menuBtn.onclick = () => {
    discardBtn.classList.toggle('hidden');
    editBtn.classList.toggle('hidden');
  }
}

function discardBtnActivation(discardBtn, task, li, taskListId) {
  discardBtn.onclick = async () => {
    const bilingualText = { he: 'האם אתה באמת רוצה למחוק את', en: 'Do you really want to delete' };
    const lang = document.documentElement.lang;
    const confirmDelete = confirm(`${bilingualText[lang]} "${task.title}"?`);
    if (!confirmDelete) return;
    try {
      await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${task.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      li.remove();
      updateTasks();
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Failed to delete task.');
    }
  };
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

        editBtn.innerHTML = '✏️';
        editing = false;
      } catch (err) {
        console.error('Failed to update task:', err);
      }
    }
  };
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
      removeShortcut(sc.url, a);
    };
    a.appendChild(removeBtn);
    shortcutsEl.appendChild(a);
  });

  const addShortcut2 = document.createElement('div');
  addShortcut2.id = "show-add-shortcut-form"
  addShortcut2.className = 'shortcut';
  addShortcut2.onclick = toggleAddShortcutForm;
  addShortcut2.innerHTML = `
    <img
      id="show-add-shortcut-form-img"
      src="images/house_icon.png" 
      onerror="this.onerror=null; this.src='images/fallback_shortcut_icon.png';"
      alt="Create New Shortcut"
    >
    <span id="show-add-shortcut-form-span" data-he="הוסף ↗" data-en="Add ↗"></span>
  `;
  shortcutsEl.appendChild(addShortcut2);

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
  toggleAddShortcutForm();
}

function addNewShortcut(name, url) {
  const list = JSON.parse(localStorage.getItem('shortcuts')) || [];
  list.push({ name, url });
  localStorage.setItem('shortcuts', JSON.stringify(list));
  loadShortcuts();
}

function removeShortcut(url, element) {
  const list = JSON.parse(localStorage.getItem('shortcuts')) || [];
  const updated = list.filter(sc => sc.url !== url);
  localStorage.setItem('shortcuts', JSON.stringify(updated));
  element.remove();
}

function loadWeekdaysCheckboxes() {
  const template = document.getElementById('weekday-checkbox-template');
  const container = document.getElementById('weekdays-checkboxes');

  weekdaysList.forEach(({ he, en }, index) => {
    const clone = template.content.cloneNode(true);
    const label = clone.querySelector('.custom-checkbox');
    const checkbox = label.querySelector('input');
    checkbox.id = `weekday-checkbox-number-${index}`;
    const textSpan = label.querySelector('.text-span-checkbox');
    setLocalizedText(textSpan, en, he);

    container.appendChild(label);
  })
}

// ==== SETTINGS ====
function toggleSettings() {
  settingsPanel.classList.toggle('open');
}

function setDirection(dir) {
  tasksContainer.setAttribute('dir', dir);

  document.querySelectorAll('#dir-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === dir)
  );

  localStorage.setItem('dir', dir);
}

function setShortcutIcon(sizeMode) {
  document.querySelectorAll('#icon-size-toggle .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.dir === sizeMode)
  );
  const sizeModes = ['large', 'small', 'hidden'];
  document.querySelectorAll('.shortcut img').forEach(icon => {
    sizeModes.forEach((modeClass) => {
      icon.classList.toggle(modeClass, modeClass == sizeMode);
    });
  });

  localStorage.setItem('iconSize', sizeMode);
}

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

  // if (themeName === 'dark') {
  //   setShortcutIcon('hidden');
  // }
  document.getElementById('show-add-shortcut-form-img').classList.toggle('black', themeName != 'dark');

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

function setListToggleDisplay() {
  const listToggle1 = document.getElementById('lists-toggle-switch');
  const listToggle2 = document.getElementById('lists-toggle-switch-2');
  const listToggle2Label = document.getElementById('lists-toggle-switch-2-label');

  const checkbox = document.getElementById('show-list-toggle');
  listToggle1.classList.toggle('hidden', !checkbox.checked);
  listToggle2.classList.toggle('hidden', checkbox.checked);
  listToggle2Label.classList.toggle('hidden', checkbox.checked);

  localStorage.setItem('listToggleDisplay', checkbox.checked ? 'homePage' : 'settings')
}

function setTaskCounterVisibiity() {
  const checkbox = document.getElementById('show-task-counter');
  const taskCounter = document.getElementById('tasks-counter');
  taskCounter.classList.toggle('hidden', !checkbox.checked);

  localStorage.setItem('taskCounterVisible', checkbox.checked ? 'visible' : 'hidden');
}

function setEncouragementSentenceVisibility() {
  const checkbox = document.getElementById('show-encouragement-sentence');
  const taskSentence = document.getElementById('task-sentence');
  taskSentence.classList.toggle('hidden', !checkbox.checked);

  localStorage.setItem('encouragementSentenceVisible', checkbox.checked ? 'visible' : 'hidden');
}

function setBGChartVisibility() {
  const checkbox = document.getElementById('show-bg-chart');
  const chartContainer = document.getElementById('chart-container-2');
  chartContainer.classList.toggle('hidden', !checkbox.checked);

  localStorage.setItem('bgChartVisible', checkbox.checked ? 'visible' : 'hidden');
}

// == LANGUAGE ==
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

  document.getElementById('settingsPanel').setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
}

function setLocalizedText(el, enText, heText) {
  el.dataset.en = enText;
  el.dataset.he = heText;
  el.textContent = el.dataset[document.documentElement.lang];
}

// == OTHER SETTERS ==
function setCurrentList(listId) {
  document.querySelectorAll('#lists-toggle-switch .toggle-option, #lists-toggle-switch-2 .toggle-option').forEach(opt =>
    opt.classList.toggle('active', opt.dataset.listId === listId)
  );
  localStorage.setItem('taskListId', listId);
  updateTasks();
}

function updateTasksCount(relevantTasks = [], num = 0) {
  if (num !== 0) {
    document.getElementById('tasks-counter').innerHTML = (+document.getElementById('tasks-counter').innerHTML || 0) + num;
  } else {
    // compute how many relevant tasks are not completed as a number
    const numRelevantTasks = relevantTasks.filter(task => task.status !== 'completed').length;
    document.getElementById('tasks-counter').innerHTML = numRelevantTasks;
  }
}

function updateTaskSentence(visibleTasks) {
  const taskSentence = document.getElementById('task-sentence');
  const now = new Date();
  const numTasks1h = visibleTasks.filter(task => task.completed && now - new Date(task.completed) < timeFilterMap['1h']).length;
  const numTasks4h = visibleTasks.filter(task => task.completed && now - new Date(task.completed) < timeFilterMap['4h']).length;
  const numTasks24h = visibleTasks.filter(task => task.completed && now - new Date(task.completed) < timeFilterMap['24h']).length;
  const numTasks7d = visibleTasks.filter(task => task.completed && now - new Date(task.completed) < timeFilterMap['7d']).length;
  const numTasks30d = visibleTasks.filter(task => task.completed && now - new Date(task.completed) < timeFilterMap['30d']).length;

  // I don't know what will encourage the user the most. Maybe I should lower the numbers for week and month.
  const arr = [numTasks1h * 6, numTasks4h * 3, numTasks24h, Math.floor(numTasks7d / 3), Math.floor(numTasks30d / 6)];
  const maxIndex = arr.indexOf(Math.max(...arr));
  let taskSentenceEn, taskSentenceHe;

  switch (maxIndex) {
    case 0:
      [taskSentenceEn, taskSentenceHe] = getEncouragement(numTasks1h, 'an hour', 'שעה');
      break;
    case 1:
      [taskSentenceEn, taskSentenceHe] = getEncouragement(numTasks4h, '4 hours', '4 שעות');
      break;
    case 2:
      [taskSentenceEn, taskSentenceHe] = getEncouragement(numTasks24h, '24 hours', '24 שעות');
      break;
    case 3:
      [taskSentenceEn, taskSentenceHe] = getEncouragement(numTasks7d, '7 days', 'שבוע');
      break;
    case 4:
      [taskSentenceEn, taskSentenceHe] = getEncouragement(numTasks30d, '30 days', 'חודש');
      break;
  }
  setLocalizedText(taskSentence, taskSentenceEn, taskSentenceHe);

}

function setListToggleSwitch(lists, toggleSwitchId) {
  const toggleSwitch = document.getElementById(toggleSwitchId);

  toggleSwitch.innerHTML = ''; // Clear existing options
  lists.forEach((list) => {
    if (list.title.includes('רשימת מערכת')) return; // Skip system lists
    const option = document.createElement('div');
    option.className = 'toggle-option list-toggle-option';
    option.dataset.listId = list.id;
    option.textContent = list.title;
    option.onclick = () => setCurrentList(list.id);

    toggleSwitch.appendChild(option);
  });
}

function hideNewTaskForm() {
  newTaskForm.style.display = 'none';
  document.getElementById('show-new-task-form').classList.remove('hidden');
  document.getElementById('close-new-task-form').classList.add('hidden');
  // Clear input
  document.getElementById('new-task-title').value = '';
  document.getElementById('new-task-notes').value = '';
  tasksContainer.classList.remove('with-new-task-form');
}

function showNewTaskForm() {
  newTaskForm.style.display = 'flex';
  document.getElementById('new-task-title').focus();
  document.getElementById('show-new-task-form').classList.add('hidden');
  document.getElementById('close-new-task-form').classList.remove('hidden');
  tasksContainer.classList.add('with-new-task-form');
}

// == UI TOGGLERS ==
function toggleRecurringTaskFormVisibility() {
  const checkbox = document.getElementById('show-reccuring-task-form');
  const form = document.getElementById('recurring-task-form');

  form.classList.toggle('hidden', !checkbox.checked);
}

function handleShowTaskForm() {
  switch (newTaskForm.style.display) {
    case 'flex':
      hideNewTaskForm();
      break;
    case 'none':
    case '':
      showNewTaskForm();
      break;
  }
}

function toggleAddShortcutForm() {
  const AddShortcutForm = document.getElementById('add-shortcut-form');
  AddShortcutForm.classList.toggle('hidden');
  if (AddShortcutForm.classList.contains('hidden')) {
    setLocalizedText(document.getElementById('show-add-shortcut-form-span'), 'Add ↗', 'הוסף ↗');
  } else {
    setLocalizedText(document.getElementById('show-add-shortcut-form-span'), 'Close ↪', 'סגור ↪');
  }
  document.getElementById('show-add-shortcut-form').classList.toggle('showing');
}

// == KEYBOARD SHORTCUTS ==
// Have to call them "keyboard shortcuts" because "shortcuts" is already used in the code above.	
function initKeyboardShortcuts() {
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
}

function updateKeyboardShortcutsText() {
  document.getElementById('new-task-shortcut-input').value = keyboardShortcutMap.addTask;
  document.getElementById('submit-task-shortcut-input').value = keyboardShortcutMap.submitTask;
  document.getElementById('theme-shortcut-input').value = keyboardShortcutMap.switchTheme;
  document.getElementById('settings-shortcut-input').value = keyboardShortcutMap.openSettings;
  document.getElementById('views-shortcut-input').value = keyboardShortcutMap.switchView
}

function handleKeyDown(event) {
  if (isTyping() || !document.body.classList.contains('keyboard-shortcuts-enabled')) return; // ignore shortcuts while typing

  switch (event.key) {
    case keyboardShortcutMap.openSearchBar:
      event.preventDefault();
      openSearchBar();
      break;
    case keyboardShortcutMap.addTask:
      event.preventDefault();
      showNewTaskForm();
      break;
    case keyboardShortcutMap.submitTask:
      event.preventDefault();
      addTask();
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
    case keyboardShortcutMap.switchView:
      event.preventDefault();
      changeTab();
      break;
    default:
      break;
  }
}

function updateShortcut(action, newKey) {
  if (newKey in keyboardShortcutMap || !newKey || newKey == ' ') {
    updateKeyboardShortcutsText();
    return;
  }
  keyboardShortcutMap[action] = newKey;
  localStorage.setItem('keyboard shortcuts', JSON.stringify(keyboardShortcutMap));
}

// SEARCH
function openSearchBar() {
  const overlay = document.getElementById('overlay');
  searchBar.classList.remove('hidden');
  overlay.classList.remove('hidden');
  searchBar.focus();
}

function handleSearchBarKeydown(e) {
  if (e.key === 'Enter') {
    const query = encodeURIComponent(e.target.value.trim());
    if (query) {
      window.open(`https://www.google.com/search?q=${query}`, '_blank');
      const overlay = document.getElementById('overlay');
      searchBar.classList.add('hidden');
      overlay.classList.add('hidden');
      searchBar.value = '';
    }
  }
  if (searchBar.value === '') {
    const overlay = document.getElementById('overlay');
    searchBar.classList.add('hidden');
    overlay.classList.add('hidden');
  }
}

// TABS
function changeTab() {
  const tabsNum = Object.keys(tabList).length;
  const currentTab = tabList[currentTabIndex];

  const nextTabIndex = (currentTabIndex + 1) % tabsNum;
  const nextTab = tabList[nextTabIndex]
  currentTabIndex = nextTabIndex;

  const chartContainer2 = document.getElementById('chart-container-2');
  chartContainer2.classList.toggle('hidden', currentTab != document.getElementById('chart-container') || localStorage.getItem('bgChartVisible') == 'hidden');

  currentTab.classList.remove('active-tab');
  nextTab.classList.add('active-tab');
}

// CHART
function processDataForChart(tasks, divisor) {
  const completionsByHour = {};
  const now = new Date();
  now.setMinutes(0, 0, 0); // Round to the full hour

  completionsByHour[new Date(now.getTime() - 24 * 60 * 60 * 1000)] = 0;
  const start = divisor * parseInt((24 / divisor), 10);
  for (let i = start; i > 0; i = i - divisor) {
    const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
    completionsByHour[hour] = 0;
  }
  completionsByHour[new Date()] = 0;

  const completionTimestamps = tasks.filter((task) => task.status === "completed").map((task) => task.completed);
  Object.keys(completionsByHour).forEach(hour => {
    completionsByHour[hour] = completionTimestamps.filter(ts => new Date(ts) < new Date(hour)).length;
  });

  const hourTasks = {};
  for (const hour in completionsByHour) {
    hourTasks[hour] = tasks
      .filter(task => {
        if (task.status !== "completed") return false;
        const completedDate = new Date(task.completed);
        const hourDate = new Date(hour);
        const lowerBound = new Date(hourDate.getTime() - divisor * 60 * 60 * 1000);
        return completedDate < hourDate && completedDate >= lowerBound;
      })
      .map(task => task.title || 'Unnamed Task');
  }

  const labels = Object.keys(completionsByHour).map(ts => new Date(ts).getHours());
  const data = Object.values(completionsByHour);

  return { labels, data, completionsByHour, hourTasks };
}

function makeChart(tasks) {
  const { labels, data, completionsByHour, hourTasks } = processDataForChart(tasks, chartSlider.value);

  brightTheme = themes.bright;
  const ctx = document.getElementById('tasksChart').getContext('2d');

  tasksChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'משימות שהושלמו ביממה האחרונה',
        data: data,
        pointBackgroundColor: brightTheme['--special-color'],
        pointRadius: 7,
        pointBorderWidth: 0,
        borderColor: brightTheme['--accent-color'],
        borderWidth: 7,
        tension: 0.2, // smooth curves
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: 'שעה' }
        },
        y: {
          beginAtZero: true,
          grid: { display: false },
          title: { display: true, text: 'משימות שהושלמו עד עתה' }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            afterBody: function (context) {
              const index = context[0].dataIndex;
              const hourKey = Object.keys(completionsByHour)[index];
              const tasksAtHour = hourTasks[hourKey];
              return tasksAtHour.length
                ? ['משימות שהושלמו בשעה זו:', ...tasksAtHour]
                : ['לא הושלמו משימות'];
            }
          }
        }
      }
    }
  });
  chartMade = true;

  const ctx2 = document.getElementById('tasksChart2').getContext('2d');
  tasksChart2 = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        // label: 'משימות שהושלמו לפי שעה',
        data: data,
        pointBackgroundColor: brightTheme['--special-color'],
        pointRadius: 7,
        pointBorderWidth: 0,
        borderColor: brightTheme['--accent-color'],
        borderWidth: 7,
        tension: 0.2, // smooth curves
      }]
    },
    options: {
      responsive: false,
      scales: {
        x: {
          display: false  // hides the entire X axis
        },
        y: {
          display: false  // hides the entire Y axis
        }
      },
      plugins: {
        legend: {
          display: false  // hides the dataset label
        },
        tooltip: {
          enabled: false  // optional: disable tooltips too
        }
      }
    }

  });
}

function updateChart(data, labels, completionsByHour, hourTasks) {
  tasksChart.data.labels = labels;
  tasksChart.data.datasets[0].data = data;
  tasksChart.options.plugins.tooltip.callbacks.afterBody = function (context) {
    const index = context[0].dataIndex;
    const hourKey = Object.keys(completionsByHour)[index];
    const tasksAtHour = hourTasks[hourKey];

    return tasksAtHour.length
      ? ['משימות שהושלמו בשעה זו:', ...tasksAtHour]
      : ['לא הושלמו משימות'];
  };
  tasksChart.update();

  tasksChart2.data.labels = labels;
  tasksChart2.data.datasets[0].data = data;
  tasksChart2.update();

}

function handleSliderInput(value) {
  const label = document.getElementById('chart-slider-label');
  setLocalizedText(label, `Time intervals: ${value} hours`, `פרקי זמן: ${value} שעות`);

  let tasksData = JSON.parse(localStorage.getItem('tasksData'));
  const relevantTasks = extractRelevantTasks(tasksData);
  const { labels, data, completionsByHour, hourTasks } = processDataForChart(relevantTasks, value);
  updateChart(data, labels, completionsByHour, hourTasks);
}

// ==== Event listeners ====

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateTasks();
  }
});

document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target) && !e.target.classList.contains('settings-btn')) {
    settingsPanel.classList.remove('open');
  }
});

document.addEventListener('keydown', handleKeyDown);

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

document.getElementById('views-shortcut-input').addEventListener('change', function (event) {
  updateShortcut('switchView', event.target.value);
});

chartSlider.addEventListener('input', () => {
  handleSliderInput(chartSlider.value);
  localStorage.setItem('chartSliderValue', chartSlider.value);
});

searchBar.addEventListener('keydown', (e) => {
  handleSearchBarKeydown(e);
});

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
