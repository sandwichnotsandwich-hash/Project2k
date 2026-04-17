// ===================== AUTH =====================

const AUTH_TOKEN_KEY = 'project2k_token';
const AUTH_USER_KEY = 'project2k_user';

function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getUser() { const u = localStorage.getItem(AUTH_USER_KEY); return u ? JSON.parse(u) : null; }

// Keys that hold per-user data. Clear these when the signed-in user changes
// (sign-out, or a different account signing in on the same browser) so one
// user's goals don't leak into another account. Welcome dismissal state
// lives on the server (users.welcome_dismissed) so it can't leak here.
const USER_SCOPED_KEYS = [
  'bulk_goal_weight',
  'bulk_goal_2k',
  'bulk_goal_weekly_erg',
  'bulk_welcome_dismissed'  // legacy localStorage flag — still cleared for safety
];
function clearUserScopedData() {
  USER_SCOPED_KEYS.forEach(k => localStorage.removeItem(k));
}

function setAuth(token, user) {
  const prev = getUser();
  if (prev && user && prev.id !== user.id) {
    // Different account signing in — wipe previous user's per-user data
    clearUserScopedData();
  }
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  clearUserScopedData();
}
function isLoggedIn() { return !!getToken(); }

async function authFetch(url, options = {}) {
  const token = getToken();
  if (!token) { showLogin(); throw new Error('Not authenticated'); }
  options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
  const res = await fetch(url, options);
  if (res.status === 401) { showLogin(); throw new Error('Session expired'); }
  return res;
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-wrapper').style.display = 'block';
  const user = getUser();
  if (user) {
    document.getElementById('user-name').textContent = user.name || user.email;
    const avatar = document.getElementById('user-avatar');
    if (user.picture) { avatar.src = user.picture; avatar.style.display = 'block'; }
    else { avatar.style.display = 'none'; }
  }
}

function showLogin() {
  clearAuth();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-wrapper').style.display = 'none';
}

// Google Sign-In callback (must be global)
window.handleGoogleSignIn = async function(response) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (data.token) {
      setAuth(data.token, data.user);
      showApp();
      fetchGoals();
      fetchWeights();
      fetchPractice();
      fetchErgTimes();
    } else {
      alert('Sign in failed. Please try again.');
    }
  } catch (err) {
    console.error('Auth error:', err);
    alert('Sign in failed. Please try again.');
  }
};

// Hamburger menu
document.getElementById('hamburger-btn').addEventListener('click', () => {
  document.getElementById('menu-overlay').classList.add('active');
});

document.getElementById('menu-close').addEventListener('click', () => {
  document.getElementById('menu-overlay').classList.remove('active');
});

document.getElementById('menu-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'menu-overlay') e.target.classList.remove('active');
});

// Sign out
document.getElementById('signout-btn').addEventListener('click', () => {
  document.getElementById('menu-overlay').classList.remove('active');
  showLogin();
});

// Initialize Google Sign-In button
async function initGoogleSignIn() {
  try {
    const res = await fetch('/api/auth/config');
    const { clientId } = await res.json();
    if (!clientId) return;

    // Wait for Google library to load
    function tryInit() {
      if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleSignIn
        });
        google.accounts.id.renderButton(
          document.getElementById('google-signin-btn'),
          { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', width: 280 }
        );
      } else {
        setTimeout(tryInit, 200);
      }
    }
    tryInit();
  } catch (err) {
    console.error('Failed to init Google Sign-In:', err);
  }
}

// ===================== SHARED UTILITIES =====================

const COLORS = {
  accent: '#FF375F',
  accentFade: 'rgba(255, 55, 95, 0.15)',
  green: '#30D158',
  red: '#FF375F',
  grid: 'rgba(84, 84, 88, 0.18)',
  border: 'rgba(84, 84, 88, 0.36)',
  textMuted: '#8E8E93',
  textLight: '#FFFFFF',
  cardBg: '#1C1C1E',
  tooltipBg: 'rgba(44, 44, 46, 0.95)',
  fontMono: "-apple-system, 'Helvetica Neue', sans-serif",
};

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year.slice(2)}`;
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}

function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `form-message ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'form-message'; }, 3000);
}

function calculateSMA(data, win = 7) {
  return data.map((_, i) => {
    if (i < win - 1) return null;
    let sum = 0;
    for (let j = i - win + 1; j <= i; j++) sum += data[j];
    return +(sum / win).toFixed(1);
  });
}

function filterByRange(entries, rangeDays) {
  if (rangeDays === 'all') return entries;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return entries.filter(e => e.date >= cutoffStr);
}

let weightRange = 'all';
let ergRange = 'all';

// Weight timeline toggle
document.querySelectorAll('#weight-timeline .tl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#weight-timeline .tl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    weightRange = btn.dataset.range === 'all' ? 'all' : parseInt(btn.dataset.range);
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    renderWeightChart();
  });
});

// Erg timeline toggle
document.querySelectorAll('#erg-timeline .tl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#erg-timeline .tl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ergRange = btn.dataset.range === 'all' ? 'all' : parseInt(btn.dataset.range);
    if (ergChart) { ergChart.destroy(); ergChart = null; }
    renderErgChart();
  });
});

// ===================== HERO STATS =====================

function getCurrentWeekMins() {
  // Get current calendar week total (Mon-Sun)
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  monday.setHours(0,0,0,0);
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
  const sundayEnd = new Date(monday);
  sundayEnd.setDate(monday.getDate() + 6);
  const sundayStr = `${sundayEnd.getFullYear()}-${String(sundayEnd.getMonth()+1).padStart(2,'0')}-${String(sundayEnd.getDate()).padStart(2,'0')}`;
  let total = 0;
  if (typeof practiceEntries !== 'undefined') {
    practiceEntries.forEach(e => {
      if (e.date >= mondayStr && e.date <= sundayStr) total += e.minutes;
    });
  }
  return Math.round(total);
}

function updateHeroStats() {
  const statsEl = document.getElementById('hero-stats');

  // Top row: Current Weight, Current Week, 2K PR
  const currentW = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight.toFixed(1) : '—';
  const weekMins = getCurrentWeekMins();
  const weekDisplay = weekMins > 0 ? weekMins + '' : '—';
  let best2k = '—';
  if (ergEntries.length > 0) {
    let best = Infinity;
    ergEntries.forEach(e => { if (e.time_seconds < best) best = e.time_seconds; });
    best2k = fmtTime(best);
  }

  // Target values now live in card-header badges, not the hero
  const goalWeight = localStorage.getItem('bulk_goal_weight');
  const goalWeeklyErg = localStorage.getItem('bulk_goal_weekly_erg');
  const goal2k = localStorage.getItem('bulk_goal_2k');

  statsEl.innerHTML = `
    <div class="hero-stats-row">
      <div class="hero-stat"><span class="hero-stat-value">${currentW}</span><span class="hero-stat-label">Current lbs</span></div>
      <div class="hero-stat"><span class="hero-stat-value">${weekDisplay}</span><span class="hero-stat-label">Weekly Mins</span></div>
      <div class="hero-stat"><span class="hero-stat-value">${best2k}</span><span class="hero-stat-label">2K PR</span></div>
    </div>
  `;

  // Update card-header target badges
  const setGoalBadge = (id, value, reached, display) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('goal-reached', !!reached);
    const valEl = el.querySelector('.goal-badge-value');
    if (!valEl) return;
    if (value == null) {
      valEl.textContent = 'Set';
      valEl.classList.add('goal-unset');
    } else {
      valEl.textContent = display;
      valEl.classList.remove('goal-unset');
    }
  };

  setGoalBadge(
    'goal-weight-badge',
    goalWeight,
    goalWeight && weightEntries.length > 0 && weightEntries[weightEntries.length - 1].weight >= parseFloat(goalWeight),
    goalWeight ? parseFloat(goalWeight).toFixed(0) : ''
  );

  setGoalBadge(
    'goal-weekly-erg-badge',
    goalWeeklyErg,
    goalWeeklyErg && weekMins >= parseFloat(goalWeeklyErg),
    goalWeeklyErg ? Math.round(parseFloat(goalWeeklyErg)) + '' : ''
  );

  let g2kDisplay = '';
  if (goal2k) {
    const s = parseFloat(goal2k);
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    g2kDisplay = `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }
  setGoalBadge(
    'goal-2k-badge',
    goal2k,
    goal2k && ergEntries.length > 0 && Math.min(...ergEntries.map(e => e.time_seconds)) <= parseFloat(goal2k),
    g2kDisplay
  );

  // Update W/KG badges on cards
  let wkgVal = '—';
  if (weightEntries.length > 0 && ergEntries.length > 0) {
    const latestWeight = weightEntries[weightEntries.length - 1].weight;
    const latestErg = ergEntries[ergEntries.length - 1].time_seconds;
    const weightKg = latestWeight * 0.453592;
    const watts = timeToWatts(latestErg);
    wkgVal = (watts / weightKg).toFixed(2);
    // Stash raw values for the breakdown modal
    window._wkgBreakdown = {
      watts: watts.toFixed(0),
      kg: weightKg.toFixed(1),
      lbs: latestWeight.toFixed(1),
      ergTime: fmtTime(latestErg),
      wkg: wkgVal
    };
  } else {
    window._wkgBreakdown = null;
  }
  document.querySelectorAll('.wkg-badge-value').forEach(el => { el.textContent = wkgVal; });
}

document.getElementById('wkg-modal').addEventListener('click', (e) => {
  if (e.target.id === 'wkg-modal') e.target.classList.remove('active');
});

window.openWkgModal = function() {
  const data = window._wkgBreakdown;
  const modal = document.getElementById('wkg-modal');
  if (!data) {
    document.getElementById('wkg-row-time').textContent = '—';
    document.getElementById('wkg-row-watts').textContent = '—';
    document.getElementById('wkg-row-weight').textContent = '—';
    document.getElementById('wkg-row-result').textContent = '—';
  } else {
    document.getElementById('wkg-row-time').textContent = data.ergTime;
    document.getElementById('wkg-row-watts').textContent = data.watts + ' W';
    document.getElementById('wkg-row-weight').textContent = data.lbs + ' lbs (' + data.kg + ' kg)';
    document.getElementById('wkg-row-result').textContent = data.wkg;
  }
  modal.classList.add('active');
};

// ===================== TAB SWITCHING =====================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ===================== WEIGHT TAB =====================

let weightEntries = [];
let weightChart = null;

const weightForm = document.getElementById('weight-form');
const dateInput = document.getElementById('date-input');
const weightInput = document.getElementById('weight-input');
const weightMsg = document.getElementById('form-message');
const weightTableBody = document.getElementById('table-body');
const weightTableEmpty = document.getElementById('table-empty');
const weightChartEmpty = document.getElementById('chart-empty');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const editIdInput = document.getElementById('edit-id');
const editDateDisplay = document.getElementById('edit-date-display');
const editWeightInput = document.getElementById('edit-weight');

dateInput.value = todayStr();

// Chart.js plugin: draws "Target" label above the target goal line
const targetLabelPlugin = {
  id: 'targetLabel',
  afterDatasetsDraw(chart) {
    const targetDs = chart.data.datasets.find(d => d.label === 'Target');
    if (!targetDs || !targetDs.data.length) return;
    const targetValue = targetDs.data[0];
    const yScale = chart.scales.y;
    if (!yScale) return;
    const y = yScale.getPixelForValue(targetValue);
    const xLeft = chart.chartArea.left;
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = '#FF9F0A';
    ctx.font = '600 10px -apple-system, Helvetica Neue, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('TARGET', xLeft + 4, y - 4);
    ctx.restore();
  }
};

// Server-reported welcome_dismissed flag for the current user.
let welcomeDismissedOnServer = false;

async function fetchGoals() {
  try {
    const res = await authFetch('/api/goals');
    const { goal_weight, goal_2k, goal_weekly_erg, welcome_dismissed } = await res.json();
    // Server is the source of truth — mirror whatever it returns into
    // localStorage, clearing stale values from other accounts.
    if (goal_weight != null) localStorage.setItem('bulk_goal_weight', goal_weight);
    else localStorage.removeItem('bulk_goal_weight');
    if (goal_2k != null) localStorage.setItem('bulk_goal_2k', goal_2k);
    else localStorage.removeItem('bulk_goal_2k');
    if (goal_weekly_erg != null) localStorage.setItem('bulk_goal_weekly_erg', goal_weekly_erg);
    else localStorage.removeItem('bulk_goal_weekly_erg');
    welcomeDismissedOnServer = !!welcome_dismissed;
    updateHeroStats();
    if (typeof weightChart !== 'undefined' && weightChart) { weightChart.destroy(); weightChart = null; renderWeightChart(); }
    if (typeof ergChart !== 'undefined' && ergChart) { ergChart.destroy(); ergChart = null; renderErgChart(); }
    if (typeof practiceChart !== 'undefined' && practiceChart) { practiceChart.destroy(); practiceChart = null; renderPracticeChart(); }
    maybeShowWelcome();
  } catch (err) { console.error('Failed to fetch goals:', err); }
}

// ===================== FIRST-TIME WELCOME MODAL =====================
async function dismissWelcomeOnServer() {
  welcomeDismissedOnServer = true;
  try {
    await authFetch('/api/welcome/dismiss', { method: 'POST' });
  } catch (err) {
    console.error('Failed to dismiss welcome:', err);
  }
}

function maybeShowWelcome() {
  // Server-reported flag is authoritative — can't be leaked between accounts.
  if (welcomeDismissedOnServer) return;
  document.getElementById('welcome-modal').classList.add('active');
}

document.getElementById('welcome-skip').addEventListener('click', () => {
  document.getElementById('welcome-modal').classList.remove('active');
  dismissWelcomeOnServer();
});

document.getElementById('welcome-save').addEventListener('click', () => {
  const wInput = document.getElementById('welcome-weight-input').value.trim();
  const wklyInput = document.getElementById('welcome-weekly-input').value.trim();
  let twokInput = document.getElementById('welcome-2k-input').value.trim();

  let anySaved = false;

  if (wInput) {
    const w = parseFloat(wInput);
    if (!isNaN(w) && w > 0) { localStorage.setItem('bulk_goal_weight', w); anySaved = true; }
  }
  if (wklyInput) {
    const m = parseFloat(wklyInput);
    if (!isNaN(m) && m > 0) { localStorage.setItem('bulk_goal_weekly_erg', Math.round(m)); anySaved = true; }
  }
  if (twokInput) {
    if (!twokInput.includes(':')) {
      const digits = twokInput.replace(/[^0-9]/g, '');
      if (digits) twokInput = formatGoalDigits(digits);
    }
    const sec = parseTime(twokInput);
    if (!isNaN(sec) && sec > 0) { localStorage.setItem('bulk_goal_2k', sec); anySaved = true; }
  }

  document.getElementById('welcome-modal').classList.remove('active');
  dismissWelcomeOnServer();

  if (anySaved) {
    updateHeroStats();
    if (typeof weightChart !== 'undefined' && weightChart) { weightChart.destroy(); weightChart = null; renderWeightChart(); }
    if (typeof ergChart !== 'undefined' && ergChart) { ergChart.destroy(); ergChart = null; renderErgChart(); }
    if (typeof practiceChart !== 'undefined' && practiceChart) { practiceChart.destroy(); practiceChart = null; renderPracticeChart(); }
    saveGoalsToServer();
  }
});

// Tap-outside-to-close is intentionally NOT wired: first-time users should
// explicitly choose Save or Skip so the server flag gets set.

async function saveGoalsToServer() {
  const gw = localStorage.getItem('bulk_goal_weight');
  const g2k = localStorage.getItem('bulk_goal_2k');
  const gwe = localStorage.getItem('bulk_goal_weekly_erg');
  try {
    await authFetch('/api/goals', {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        goal_weight: gw ? parseFloat(gw) : null,
        goal_2k: g2k ? parseFloat(g2k) : null,
        goal_weekly_erg: gwe ? parseFloat(gwe) : null
      })
    });
  } catch (err) { console.error('Failed to save goals:', err); }
}

async function fetchWeights() {
  weightEntries = await (await authFetch('/api/weights')).json();
  renderWeightTable();
  renderWeightChart();
  updateHeroStats();
}

weightForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = dateInput.value;
  const weight = parseFloat(weightInput.value);
  if (!date || isNaN(weight)) return showMsg(weightMsg, 'Enter a valid date and weight.', 'error');
  try {
    await authFetch('/api/weights', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({date, weight}) });
    await fetchWeights();
    showMsg(weightMsg, 'Weight logged!', 'success');
    weightInput.value = '';
    dateInput.value = todayStr();
  } catch (err) { showMsg(weightMsg, err.message, 'error'); }
});

function renderWeightTable() {
  if (!weightEntries.length) { weightTableEmpty.style.display = 'block'; weightTableBody.innerHTML = ''; return; }
  weightTableEmpty.style.display = 'none';
  const rev = [...weightEntries].reverse();
  weightTableBody.innerHTML = rev.map((e, idx) => {
    const oi = weightEntries.length - 1 - idx;
    let ch = '<span class="change-neutral">\u2014</span>';
    if (oi > 0) {
      const diff = e.weight - weightEntries[oi-1].weight;
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'change-positive' : diff < 0 ? 'change-negative' : 'change-neutral';
      ch = `<span class="${cls}">${sign}${diff.toFixed(1)}</span>`;
    }
    return `<tr><td>${formatDate(e.date)}</td><td>${e.weight.toFixed(1)}</td><td>${ch}</td><td><button class="btn-edit" onclick="openWeightEdit(${e.id},'${e.date}',${e.weight})">Edit</button></td></tr>`;
  }).join('');
}

function renderWeightChart() {
  if (!weightEntries.length) {
    weightChartEmpty.style.display = 'block';
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    return;
  }
  weightChartEmpty.style.display = 'none';
  const filtered = filterByRange(weightEntries, weightRange);
  if (!filtered.length) {
    weightChartEmpty.style.display = 'block';
    weightChartEmpty.textContent = 'No data in this range.';
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    return;
  }
  const labels = filtered.map(e => shortDate(e.date));
  const weights = filtered.map(e => e.weight);

  if (weightChart) { weightChart.destroy(); weightChart = null; }

  const ctx = document.getElementById('weight-chart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(10, 132, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(10, 132, 255, 0)');

  const datasets = [
    {
      label: 'Daily Weight',
      data: weights,
      borderColor: '#0A84FF',
      backgroundColor: gradient,
      borderWidth: 2.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: '#0A84FF',
      pointBorderColor: COLORS.cardBg,
      pointBorderWidth: 2,
      fill: true,
      tension: 0,
      segment: {
        borderColor: (ctx) => {
          const prev = ctx.p0.parsed.y;
          const curr = ctx.p1.parsed.y;
          return curr >= prev ? '#30D158' : '#FF375F';
        }
      }
    }
  ];

  // Target weight goal line
  const goalWeight = localStorage.getItem('bulk_goal_weight');
  if (goalWeight) {
    const target = parseFloat(goalWeight);
    datasets.push({
      label: 'Target',
      data: labels.map(() => target),
      borderColor: 'rgba(255, 159, 10, 0.8)',
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true
    });
  }

  const wOpts = chartOptions('lbs');
  // Make sure target line isn't flush with top/bottom
  wOpts.scales = wOpts.scales || {};
  wOpts.scales.y = wOpts.scales.y || {};
  wOpts.scales.y.grace = '15%';

  weightChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: wOpts,
    plugins: [targetLabelPlugin]
  });
}

// Weight edit modal
window.openWeightEdit = function(id, date, weight) {
  editIdInput.value = id;
  editDateDisplay.textContent = formatDate(date);
  editWeightInput.value = weight;
  editModal.classList.add('active');
  editWeightInput.focus();
};

document.getElementById('cancel-edit').addEventListener('click', () => editModal.classList.remove('active'));
editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = editIdInput.value, w = parseFloat(editWeightInput.value);
  await authFetch(`/api/weights/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({weight: w}) });
  editModal.classList.remove('active');
  await fetchWeights();
  showMsg(weightMsg, 'Entry updated.', 'success');
});

document.getElementById('delete-weight').addEventListener('click', async () => {
  const id = editIdInput.value;
  if (!confirm('Delete this weight entry?')) return;
  await authFetch(`/api/weights/${id}`, { method: 'DELETE' });
  editModal.classList.remove('active');
  await fetchWeights();
  showMsg(weightMsg, 'Entry deleted.', 'success');
});

// ===================== 2K ERG TAB =====================

let ergEntries = [];
let ergChart = null;
let ergChartUnit = 'split';
let ergTableUnit = 'split';

const ergForm = document.getElementById('erg-form');
const ergDateInput = document.getElementById('erg-date-input');
const ergTimeInput = document.getElementById('erg-time-input');
const ergMsg = document.getElementById('erg-form-message');
const ergTableBody = document.getElementById('erg-table-body');
const ergTableEmpty = document.getElementById('erg-table-empty');
const ergChartEmpty = document.getElementById('erg-chart-empty');
const ergEditModal = document.getElementById('erg-edit-modal');
const ergEditForm = document.getElementById('erg-edit-form');
const ergEditId = document.getElementById('erg-edit-id');
const ergEditDateDisplay = document.getElementById('erg-edit-date-display');
const ergEditTime = document.getElementById('erg-edit-time');
const ergMetricHeader = document.getElementById('erg-metric-header');

ergDateInput.value = todayStr();

// Live-format time input: only digits, auto-inserts : and .
// Format: M:SS.S — user types 4 digits, sees "6:30.0"
function formatTimeDigits(digits) {
  // digits is a string of pure numbers, max 4
  if (digits.length === 0) return '';
  if (digits.length === 1) return digits;                         // "6"
  if (digits.length === 2) return digits[0] + ':' + digits[1];    // "6:3"
  if (digits.length === 3) return digits[0] + ':' + digits.slice(1); // "6:30"
  return digits[0] + ':' + digits.slice(1, 3) + '.' + digits.slice(3); // "6:30.0"
}

ergTimeInput.addEventListener('keydown', function(e) {
  if (inputUnit === 'watts') return;
  // Allow: backspace, delete, tab, escape, enter, arrow keys
  if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const digits = this.value.replace(/[^0-9]/g, '');
      const newDigits = digits.slice(0, -1);
      this.value = formatTimeDigits(newDigits);
    }
    return;
  }
  // Block non-digit keys
  if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
  e.preventDefault();
  const digits = this.value.replace(/[^0-9]/g, '');
  if (digits.length >= 4) return; // max 4 digits: M SS S
  const newDigits = digits + e.key;
  this.value = formatTimeDigits(newDigits);
});

// Block paste of non-numeric content
ergTimeInput.addEventListener('paste', function(e) {
  if (inputUnit === 'watts') return;
  e.preventDefault();
  const pasted = (e.clipboardData || window.clipboardData).getData('text');
  const digits = pasted.replace(/[^0-9]/g, '').slice(0, 4);
  this.value = formatTimeDigits(digits);
});

function parseTime(str) {
  str = str.trim();
  const match = str.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!match) return NaN;
  const mins = parseInt(match[1]);
  const secs = parseInt(match[2]);
  const frac = match[3] ? parseInt(match[3]) / Math.pow(10, match[3].length) : 0;
  return mins * 60 + secs + frac;
}

function fmtTime(s) {
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

function toSplit(totalSec) { return totalSec / 4; }

function splitToWatts(splitSec) {
  const pace = splitSec / 500;
  return 2.80 / Math.pow(pace, 3);
}

function timeToWatts(totalSec) { return splitToWatts(toSplit(totalSec)); }

function wattsToSplit(watts) {
  const pacePerMeter = Math.pow(2.80 / watts, 1/3);
  return pacePerMeter * 500;
}

function parseWattsInput(str) {
  const w = parseFloat(str.trim());
  if (isNaN(w) || w <= 0) return NaN;
  return wattsToSplit(w) * 4;
}

// Input unit toggle
const inputUnitBtns = document.querySelectorAll('.unit-toggle .toggle-btn');
let inputUnit = 'time';

// Live preview: auto-calculate the other two metrics
function updateErgPreview() {
  const raw = ergTimeInput.value;
  let timeSec = NaN; // Total 2K time in seconds

  if (inputUnit === 'watts') {
    const w = parseFloat(raw);
    if (!isNaN(w) && w > 0) {
      timeSec = wattsToSplit(w) * 4;
    }
  } else if (inputUnit === 'split') {
    const s = parseTime(raw);
    if (!isNaN(s)) timeSec = s * 4;
  } else {
    // time
    const t = parseTime(raw);
    if (!isNaN(t)) timeSec = t;
  }

  const tEl = document.getElementById('preview-time');
  const sEl = document.getElementById('preview-split');
  const wEl = document.getElementById('preview-watts');
  if (!tEl) return;

  if (isNaN(timeSec) || timeSec <= 0) {
    tEl.textContent = '—';
    sEl.textContent = '—';
    wEl.textContent = '—';
    return;
  }

  const splitSec = timeSec / 4;
  const watts = timeToWatts(timeSec);
  tEl.textContent = fmtTime(timeSec);
  sEl.textContent = fmtTime(splitSec);
  wEl.textContent = Math.round(watts);
}

function updatePreviewActive() {
  document.querySelectorAll('.erg-preview-item').forEach(el => {
    el.classList.toggle('active', el.dataset.preview === inputUnit);
  });
}

inputUnitBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    inputUnitBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    inputUnit = btn.dataset.unit;
    const label = document.getElementById('erg-input-label');
    if (inputUnit === 'watts') {
      label.textContent = 'Watts';
      ergTimeInput.placeholder = '285';
      ergTimeInput.removeAttribute('maxlength');
      ergTimeInput.inputMode = 'numeric';
    } else if (inputUnit === 'split') {
      label.textContent = '500m Split (M:SS.s)';
      ergTimeInput.placeholder = 'MM:SS.S';
      ergTimeInput.setAttribute('maxlength', '6');
      ergTimeInput.inputMode = 'numeric';
    } else {
      label.textContent = 'Final Time';
      ergTimeInput.placeholder = 'MM:SS.S';
      ergTimeInput.setAttribute('maxlength', '6');
      ergTimeInput.inputMode = 'numeric';
    }
    ergTimeInput.value = '';
    updatePreviewActive();
    updateErgPreview();
  });
});

// Wire up live preview on input changes
ergTimeInput.addEventListener('input', updateErgPreview);
ergTimeInput.addEventListener('keyup', updateErgPreview);

// Set initial active state
setTimeout(() => { updatePreviewActive(); updateErgPreview(); }, 0);

// Chart unit toggle
document.querySelectorAll('.chart-toggle .toggle-btn[data-chart-unit]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chart-toggle .toggle-btn[data-chart-unit]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ergChartUnit = btn.dataset.chartUnit;
    if (ergChart) { ergChart.destroy(); ergChart = null; }
    renderErgChart();
  });
});

// Table unit toggle
document.querySelectorAll('.chart-toggle .toggle-btn[data-table-unit]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chart-toggle .toggle-btn[data-table-unit]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ergTableUnit = btn.dataset.tableUnit;
    ergMetricHeader.textContent = ergTableUnit === 'watts' ? 'Watts' : '500m Split';
    renderErgTable();
  });
});

async function fetchErgTimes() {
  ergEntries = await (await authFetch('/api/ergtimes')).json();
  renderErgTable();
  renderErgChart();
  updateHeroStats();
}

ergForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = ergDateInput.value;
  const raw = ergTimeInput.value;
  let timeSec;
  if (inputUnit === 'watts') {
    timeSec = parseWattsInput(raw);
  } else if (inputUnit === 'split') {
    // 500m split → total 2K time = split * 4
    const splitSec = parseTime(raw);
    timeSec = isNaN(splitSec) ? NaN : splitSec * 4;
  } else {
    timeSec = parseTime(raw);
  }
  if (!date || isNaN(timeSec)) return showMsg(ergMsg, 'Enter a valid date and time/watts.', 'error');
  try {
    await authFetch('/api/ergtimes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date, time_seconds: timeSec }) });
    await fetchErgTimes();
    showMsg(ergMsg, '2K logged!', 'success');
    ergTimeInput.value = '';
    ergDateInput.value = todayStr();
  } catch (err) { showMsg(ergMsg, err.message, 'error'); }
});

function renderErgTable() {
  if (!ergEntries.length) { ergTableEmpty.style.display = 'block'; ergTableBody.innerHTML = ''; return; }
  ergTableEmpty.style.display = 'none';
  const rev = [...ergEntries].reverse();

  // Find the single overall best time
  let bestTime = Infinity;
  let bestId = null;
  ergEntries.forEach(e => {
    if (e.time_seconds < bestTime) {
      bestTime = e.time_seconds;
      bestId = e.id;
    }
  });

  ergTableBody.innerHTML = rev.map((e, idx) => {
    const oi = ergEntries.length - 1 - idx;
    const split = toSplit(e.time_seconds);
    const watts = timeToWatts(e.time_seconds);
    const metricVal = ergTableUnit === 'watts' ? `${watts.toFixed(1)}` : fmtTime(split);
    const isPR = e.id === bestId;
    const prBadge = isPR ? '<span class="pr-badge">PR</span>' : '';

    let ch = '<span class="change-neutral">\u2014</span>';
    if (oi > 0) {
      const prev = ergEntries[oi-1].time_seconds;
      const diff = e.time_seconds - prev;
      if (ergTableUnit === 'watts') {
        const wDiff = timeToWatts(e.time_seconds) - timeToWatts(prev);
        const sign = wDiff > 0 ? '+' : '';
        const cls = wDiff > 0 ? 'change-positive' : wDiff < 0 ? 'change-negative' : 'change-neutral';
        ch = `<span class="${cls}">${sign}${wDiff.toFixed(1)}</span>`;
      } else {
        const sign = diff > 0 ? '+' : '-';
        const cls = diff < 0 ? 'change-positive' : diff > 0 ? 'change-negative' : 'change-neutral';
        ch = `<span class="${cls}">${sign}${fmtTime(Math.abs(diff))}</span>`;
      }
    }

    return `<tr><td>${formatDate(e.date)}${prBadge}</td><td>${fmtTime(e.time_seconds)}</td><td>${metricVal}</td><td>${ch}</td><td><button class="btn-edit" onclick="openErgEdit(${e.id},'${e.date}',${e.time_seconds})">Edit</button></td></tr>`;
  }).join('');
}

function renderErgChart() {
  if (!ergEntries.length) {
    ergChartEmpty.style.display = 'block';
    if (ergChart) { ergChart.destroy(); ergChart = null; }
    return;
  }
  ergChartEmpty.style.display = 'none';
  const filtered = filterByRange(ergEntries, ergRange);
  if (!filtered.length) {
    ergChartEmpty.style.display = 'block';
    ergChartEmpty.textContent = 'No data in this range.';
    if (ergChart) { ergChart.destroy(); ergChart = null; }
    return;
  }

  const labels = filtered.map(e => shortDate(e.date));
  let values;

  if (ergChartUnit === 'watts') {
    values = filtered.map(e => +timeToWatts(e.time_seconds).toFixed(1));
  } else if (ergChartUnit === 'time') {
    values = filtered.map(e => +e.time_seconds.toFixed(1));
  } else {
    values = filtered.map(e => +toSplit(e.time_seconds).toFixed(1));
  }

  const higherIsBetter = ergChartUnit === 'watts';
  const segmentColors = [];
  let best = higherIsBetter ? -Infinity : Infinity;
  for (let i = 0; i < values.length; i++) {
    const isBetter = higherIsBetter ? values[i] > best : values[i] < best;
    if (isBetter) best = values[i];
    if (i > 0) {
      const curBest = higherIsBetter ? values[i] >= best : values[i] <= best;
      if (curBest) {
        segmentColors.push(COLORS.green);
      } else {
        segmentColors.push(COLORS.red);
      }
    }
  }

  const ctx = document.getElementById('erg-chart').getContext('2d');
  if (ergChart) { ergChart.destroy(); ergChart = null; }

  const ergDatasets = [{
    label: ergChartUnit === 'watts' ? 'Watts' : ergChartUnit === 'time' ? 'Total Time' : '500m Split',
    data: values,
    borderColor: '#0A84FF',
    borderWidth: 2.5,
    pointRadius: 5,
    pointHoverRadius: 8,
    pointBackgroundColor: '#0A84FF',
    pointBorderColor: COLORS.cardBg,
    pointBorderWidth: 2,
    fill: false,
    tension: 0,
    segment: {
      borderColor: (ctx) => {
        const i = ctx.p1DataIndex;
        return segmentColors[i - 1] || COLORS.accent;
      }
    }
  }];

  // Target 2K goal line - convert to whatever unit is displayed
  const goal2k = localStorage.getItem('bulk_goal_2k');
  if (goal2k) {
    const targetSec = parseFloat(goal2k); // stored as total 2K seconds
    let targetValue;
    if (ergChartUnit === 'watts') {
      targetValue = +timeToWatts(targetSec).toFixed(1);
    } else if (ergChartUnit === 'time') {
      targetValue = +targetSec.toFixed(1);
    } else {
      targetValue = +toSplit(targetSec).toFixed(1);
    }
    ergDatasets.push({
      label: 'Target',
      data: labels.map(() => targetValue),
      borderColor: 'rgba(255, 159, 10, 0.8)',
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true
    });
  }

  ergChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: ergDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.tooltipBg,
          titleColor: COLORS.textLight,
          bodyColor: COLORS.textLight,
          borderColor: COLORS.border,
          borderWidth: 1,
          cornerRadius: 8,
          padding: 14,
          titleFont: { family: COLORS.fontMono, size: 12, weight: '600' },
          bodyFont: { family: COLORS.fontMono, size: 12 },
          callbacks: {
            label: (ctx) => {
              if (ctx.parsed.y == null) return null;
              if (ergChartUnit === 'watts') return `${ctx.parsed.y.toFixed(1)} W`;
              return fmtTime(ctx.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: COLORS.grid, drawTicks: false },
          border: { color: COLORS.border },
          ticks: { color: COLORS.textMuted, font: { family: COLORS.fontMono, size: 11 }, maxRotation: 0, padding: 10 }
        },
        y: {
          reverse: false,
          grace: '15%',
          grid: { color: COLORS.grid, drawTicks: false },
          border: { color: COLORS.border },
          ticks: {
            color: COLORS.textMuted,
            font: { family: COLORS.fontMono, size: 11 },
            callback: (v) => ergChartUnit === 'watts' ? v + ' W' : fmtTime(v),
            padding: 10
          }
        }
      }
    },
    plugins: [targetLabelPlugin]
  });
}

// Erg edit modal
window.openErgEdit = function(id, date, timeSec) {
  ergEditId.value = id;
  ergEditDateDisplay.textContent = formatDate(date);
  ergEditTime.value = fmtTime(timeSec);
  ergEditModal.classList.add('active');
  ergEditTime.focus();
};

document.getElementById('erg-cancel-edit').addEventListener('click', () => ergEditModal.classList.remove('active'));
ergEditModal.addEventListener('click', (e) => { if (e.target === ergEditModal) ergEditModal.classList.remove('active'); });

ergEditForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = ergEditId.value;
  const timeSec = parseTime(ergEditTime.value);
  if (isNaN(timeSec)) return showMsg(ergMsg, 'Enter time as M:SS.s', 'error');
  await authFetch(`/api/ergtimes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ time_seconds: timeSec }) });
  ergEditModal.classList.remove('active');
  await fetchErgTimes();
  showMsg(ergMsg, 'Entry updated.', 'success');
});

document.getElementById('delete-erg').addEventListener('click', async () => {
  const id = ergEditId.value;
  if (!confirm('Delete this 2K entry?')) return;
  await authFetch(`/api/ergtimes/${id}`, { method: 'DELETE' });
  ergEditModal.classList.remove('active');
  await fetchErgTimes();
  showMsg(ergMsg, 'Entry deleted.', 'success');
});

// ===================== SHARED CHART OPTIONS =====================

function chartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: true },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.tooltipBg,
        titleColor: COLORS.textLight,
        bodyColor: COLORS.textLight,
        borderColor: COLORS.border,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 14,
        titleFont: { family: COLORS.fontMono, size: 12, weight: '600' },
        bodyFont: { family: COLORS.fontMono, size: 12 },
        callbacks: {
          label: (ctx) => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} ${unit}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: COLORS.grid, drawTicks: false },
        border: { color: COLORS.border },
        ticks: { color: COLORS.textMuted, font: { family: COLORS.fontMono, size: 11 }, maxRotation: 0, padding: 10 }
      },
      y: {
        grid: { color: COLORS.grid, drawTicks: false },
        border: { color: COLORS.border },
        ticks: { color: COLORS.textMuted, font: { family: COLORS.fontMono, size: 11 }, callback: (v) => v + ' ' + unit, padding: 10 }
      }
    }
  };
}

// ===================== WEIGHT INPUT AUTO-FORMAT =====================

// Format: XXX.X (1-4 digits → decimal auto-inserted before last digit)
function formatWeightDigits(d) {
  if (d.length === 0) return '';
  if (d.length === 1) return d;
  return d.slice(0, -1) + '.' + d.slice(-1);
}

(function() {
  const wInput = document.getElementById('weight-input');
  if (!wInput) return;

  wInput.addEventListener('keydown', function(e) {
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (e.key === 'Backspace') {
        e.preventDefault();
        const digits = this.value.replace(/[^0-9]/g, '');
        this.value = formatWeightDigits(digits.slice(0, -1));
      }
      return;
    }
    if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
    e.preventDefault();
    const digits = this.value.replace(/[^0-9]/g, '');
    if (digits.length >= 4) return; // max 4 digits: XXX.X
    this.value = formatWeightDigits(digits + e.key);
  });

  wInput.addEventListener('paste', function(e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/[^0-9]/g, '').slice(0, 4);
    this.value = formatWeightDigits(digits);
  });
})();

// ===================== WEIGHT GOAL =====================

document.getElementById('goal-cancel').addEventListener('click', () => {
  document.getElementById('goal-modal').classList.remove('active');
});

document.getElementById('goal-modal').addEventListener('click', (e) => {
  if (e.target.id === 'goal-modal') e.target.classList.remove('active');
});

document.getElementById('goal-save').addEventListener('click', () => {
  const val = Math.round(parseFloat(document.getElementById('goal-weight-input').value));
  if (isNaN(val) || val <= 0) return;
  localStorage.setItem('bulk_goal_weight', val);
  document.getElementById('goal-modal').classList.remove('active');
  updateHeroStats();
  if (weightChart) { weightChart.destroy(); weightChart = null; }
  renderWeightChart();
  saveGoalsToServer();
});

document.getElementById('goal-clear').addEventListener('click', () => {
  localStorage.removeItem('bulk_goal_weight');
  document.getElementById('goal-modal').classList.remove('active');
  updateHeroStats();
  if (weightChart) { weightChart.destroy(); weightChart = null; }
  renderWeightChart();
  saveGoalsToServer();
});

// ===================== 2K GOAL =====================

// Auto-format 2K goal input as M:SS
function formatGoalDigits(d) {
  if (d.length === 0) return '';
  if (d.length === 1) return d;
  if (d.length === 2) return d[0] + ':' + d[1];
  return d[0] + ':' + d.slice(1, 3);
}

function attachMSSFormatter(input) {
  input.addEventListener('keydown', function(e) {
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (e.key === 'Backspace') {
        e.preventDefault();
        const digits = this.value.replace(/[^0-9]/g, '');
        this.value = formatGoalDigits(digits.slice(0, -1));
      }
      return;
    }
    if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
    e.preventDefault();
    const digits = this.value.replace(/[^0-9]/g, '');
    if (digits.length >= 3) return;
    this.value = formatGoalDigits(digits + e.key);
  });
  input.addEventListener('paste', function(e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/[^0-9]/g, '').slice(0, 3);
    this.value = formatGoalDigits(digits);
  });
}

attachMSSFormatter(document.getElementById('goal-2k-input'));
attachMSSFormatter(document.getElementById('welcome-2k-input'));

document.getElementById('goal-2k-cancel').addEventListener('click', () => {
  document.getElementById('goal-2k-modal').classList.remove('active');
});

document.getElementById('goal-2k-modal').addEventListener('click', (e) => {
  if (e.target.id === 'goal-2k-modal') e.target.classList.remove('active');
});

document.getElementById('goal-2k-save').addEventListener('click', () => {
  let raw = document.getElementById('goal-2k-input').value;
  if (!raw.includes(':')) raw = autoFormatTime(raw);
  const timeSec = parseTime(raw);
  if (isNaN(timeSec) || timeSec <= 0) return;
  localStorage.setItem('bulk_goal_2k', timeSec);
  document.getElementById('goal-2k-modal').classList.remove('active');
  updateHeroStats();
  if (ergChart) { ergChart.destroy(); ergChart = null; }
  renderErgChart();
  saveGoalsToServer();
});

document.getElementById('goal-2k-clear').addEventListener('click', () => {
  localStorage.removeItem('bulk_goal_2k');
  document.getElementById('goal-2k-modal').classList.remove('active');
  updateHeroStats();
  if (ergChart) { ergChart.destroy(); ergChart = null; }
  renderErgChart();
  saveGoalsToServer();
});

// ===================== ERG PRACTICE TAB =====================

let practiceEntries = [];
let practiceChart = null;
let practiceRange = 'all';

const practiceForm = document.getElementById('practice-form');
const practiceDateInput = document.getElementById('practice-date-input');
const practiceMinsInput = document.getElementById('practice-mins-input');
const practiceMsg = document.getElementById('practice-form-message');
const practiceTableBody = document.getElementById('practice-table-body');
const practiceTableEmpty = document.getElementById('practice-table-empty');
const practiceChartEmpty = document.getElementById('practice-chart-empty');

if (practiceDateInput) practiceDateInput.value = todayStr();

// Only allow digits in minutes input
if (practiceMinsInput) {
  practiceMinsInput.addEventListener('keydown', function(e) {
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    if (!/^\d$/.test(e.key)) { e.preventDefault(); }
  });
}

async function fetchPractice() {
  try {
    practiceEntries = await (await authFetch('/api/ergpractice')).json();
  } catch (e) { practiceEntries = []; }
  renderPracticeTable();
  renderPracticeChart();
  updateHeroStats();
}

if (practiceForm) {
  practiceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = practiceDateInput.value;
    const minutes = parseInt(practiceMinsInput.value);
    if (!date || isNaN(minutes) || minutes <= 0) return showMsg(practiceMsg, 'Enter a valid date and minutes.', 'error');
    try {
      await authFetch('/api/ergpractice', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date, minutes }) });
      await fetchPractice();
      showMsg(practiceMsg, 'Practice logged!', 'success');
      practiceMinsInput.value = '';
      practiceDateInput.value = todayStr();
    } catch (err) { showMsg(practiceMsg, err.message, 'error'); }
  });
}

function getPracticeDailyTotals() {
  // Group by date, sum minutes, count sessions
  const byDate = {};
  practiceEntries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = { date: e.date, total: 0, sessions: 0, ids: [] };
    byDate[e.date].total += e.minutes;
    byDate[e.date].sessions += 1;
    byDate[e.date].ids.push(e.id);
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

function getPracticeWeeklyCumulative() {
  // Per-day totals, but each point is cumulative minutes for its Mon–Sun week up to that day.
  const daily = getPracticeDailyTotals();
  let curMonday = null;
  let running = 0;
  return daily.map(d => {
    const date = new Date(d.date + 'T00:00:00');
    const day = date.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    const monday = new Date(date);
    monday.setDate(date.getDate() - mondayOffset);
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
    if (mondayStr !== curMonday) { curMonday = mondayStr; running = 0; }
    running += d.total;
    return { date: d.date, total: running };
  });
}

function renderPracticeTable() {
  const daily = getPracticeDailyTotals();
  if (!daily.length) { practiceTableEmpty.style.display = 'block'; practiceTableBody.innerHTML = ''; return; }
  practiceTableEmpty.style.display = 'none';
  const rev = [...daily].reverse();
  practiceTableBody.innerHTML = rev.map(d => {
    return `<tr><td>${formatDate(d.date)}</td><td>${Math.round(d.total)} min</td><td>${d.sessions}</td><td><button class="btn-edit" onclick="deletePracticeDay('${d.date}')">Delete</button></td></tr>`;
  }).join('');
}

window.deletePracticeDay = async function(date) {
  if (!confirm('Delete all practice entries for ' + formatDate(date) + '?')) return;
  const toDelete = practiceEntries.filter(e => e.date === date);
  for (const e of toDelete) {
    await authFetch(`/api/ergpractice/${e.id}`, { method: 'DELETE' });
  }
  await fetchPractice();
};

function renderPracticeChart() {
  const daily = getPracticeWeeklyCumulative();
  if (!daily.length) {
    practiceChartEmpty.style.display = 'block';
    if (practiceChart) { practiceChart.destroy(); practiceChart = null; }
    return;
  }
  practiceChartEmpty.style.display = 'none';
  const filtered = filterByRange(daily, practiceRange);
  if (!filtered.length) {
    practiceChartEmpty.style.display = 'block';
    practiceChartEmpty.textContent = 'No data in this range.';
    if (practiceChart) { practiceChart.destroy(); practiceChart = null; }
    return;
  }

  const labels = filtered.map(d => shortDate(d.date));
  const values = filtered.map(d => Math.round(d.total));

  if (practiceChart) { practiceChart.destroy(); practiceChart = null; }

  const ctx = document.getElementById('practice-chart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, 'rgba(10, 132, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(10, 132, 255, 0)');

  const datasets = [{
    label: 'Practice',
    data: values,
    borderColor: '#0A84FF',
    backgroundColor: gradient,
    borderWidth: 2.5,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: '#0A84FF',
    pointBorderColor: COLORS.cardBg,
    pointBorderWidth: 2,
    fill: true,
    tension: 0,
    segment: {
      borderColor: (ctx) => {
        const prev = ctx.p0.parsed.y;
        const curr = ctx.p1.parsed.y;
        return curr >= prev ? '#30D158' : '#FF375F';
      }
    }
  }];

  // Target weekly line: full weekly goal (each point is week-to-date cumulative)
  const goalWeeklyErg = localStorage.getItem('bulk_goal_weekly_erg');
  if (goalWeeklyErg) {
    const weeklyTarget = parseFloat(goalWeeklyErg);
    datasets.push({
      label: 'Target',
      data: labels.map(() => +weeklyTarget.toFixed(0)),
      borderColor: 'rgba(255, 159, 10, 0.8)',
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true
    });
  }

  const pOpts = chartOptions('min');
  pOpts.scales = pOpts.scales || {};
  pOpts.scales.y = pOpts.scales.y || {};
  pOpts.scales.y.grace = '15%';

  practiceChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: pOpts,
    plugins: [targetLabelPlugin]
  });
}

// Practice timeline toggle
document.querySelectorAll('#practice-timeline .tl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#practice-timeline .tl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    practiceRange = btn.dataset.range === 'all' ? 'all' : parseInt(btn.dataset.range);
    if (practiceChart) { practiceChart.destroy(); practiceChart = null; }
    renderPracticeChart();
  });
});

// ===================== WEEKLY ERG GOAL =====================

document.getElementById('goal-weekly-erg-cancel').addEventListener('click', () => {
  document.getElementById('goal-weekly-erg-modal').classList.remove('active');
});

document.getElementById('goal-weekly-erg-modal').addEventListener('click', (e) => {
  if (e.target.id === 'goal-weekly-erg-modal') e.target.classList.remove('active');
});

document.getElementById('goal-weekly-erg-save').addEventListener('click', () => {
  const val = Math.round(parseFloat(document.getElementById('goal-weekly-erg-input').value));
  if (isNaN(val) || val <= 0) return;
  localStorage.setItem('bulk_goal_weekly_erg', val);
  document.getElementById('goal-weekly-erg-modal').classList.remove('active');
  updateHeroStats();
  if (practiceChart) { practiceChart.destroy(); practiceChart = null; }
  renderPracticeChart();
  saveGoalsToServer();
});

document.getElementById('goal-weekly-erg-clear').addEventListener('click', () => {
  localStorage.removeItem('bulk_goal_weekly_erg');
  document.getElementById('goal-weekly-erg-modal').classList.remove('active');
  updateHeroStats();
  if (practiceChart) { practiceChart.destroy(); practiceChart = null; }
  renderPracticeChart();
  saveGoalsToServer();
});

// ===================== KEYBOARD =====================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    editModal.classList.remove('active');
    ergEditModal.classList.remove('active');
  }
});

// ===================== LAYOUT =====================
function updateHeaderLayout() {
  const fixedHeader = document.getElementById('fixed-header');
  if (!fixedHeader) return;
  const headerH = fixedHeader.offsetHeight;
  document.querySelectorAll('.container').forEach(c => {
    c.style.paddingTop = (headerH + 8) + 'px';
  });
}

window.addEventListener('resize', updateHeaderLayout);
window.addEventListener('load', updateHeaderLayout);
window.addEventListener('orientationchange', updateHeaderLayout);
setTimeout(updateHeaderLayout, 100);
setTimeout(updateHeaderLayout, 500);
setTimeout(updateHeaderLayout, 1000);

// Observe header size changes (stats populate async, fonts load, etc.)
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(updateHeaderLayout);
  const observeHeader = () => {
    const h = document.getElementById('fixed-header');
    if (h) ro.observe(h);
    else setTimeout(observeHeader, 100);
  };
  observeHeader();
}

// ===================== INIT =====================
initGoogleSignIn();

if (isLoggedIn()) {
  showApp();
  fetchGoals();
  fetchWeights();
  fetchPractice();
  fetchErgTimes();
} else {
  showLogin();
}
