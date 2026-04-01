// ===================== SHARED UTILITIES =====================

const COLORS = {
  accent: '#FF00C8',
  accentFade: 'rgba(255, 0, 200, 0.12)',
  green: '#FF00C8',
  red: '#ff4444',
  grid: 'rgba(91, 0, 255, 0.06)',
  border: 'rgba(91, 0, 255, 0.12)',
  textMuted: '#8866aa',
  textLight: '#f0e6ff',
  cardBg: '#1a0a2e',
  tooltipBg: 'rgba(26, 10, 46, 0.95)',
  fontMono: "'Inter', sans-serif",
};

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
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

function updateHeroStats() {
  const statsEl = document.getElementById('hero-stats');
  const parts = [];

  if (weightEntries.length > 0) {
    const latest = weightEntries[weightEntries.length - 1];
    const first = weightEntries[0];
    const gained = (latest.weight - first.weight).toFixed(1);
    const sign = gained > 0 ? '+' : '';
    parts.push(`<div class="hero-stat"><span class="hero-stat-value">${latest.weight.toFixed(1)}</span><span class="hero-stat-label">Current lbs</span></div>`);
    parts.push(`<div class="hero-stat"><span class="hero-stat-value">${sign}${gained}</span><span class="hero-stat-label">Total Change</span></div>`);
    parts.push(`<div class="hero-stat"><span class="hero-stat-value">${weightEntries.length}</span><span class="hero-stat-label">Weigh-ins</span></div>`);
  }

  if (ergEntries.length > 0) {
    let best = Infinity;
    ergEntries.forEach(e => { if (e.time_seconds < best) best = e.time_seconds; });
    parts.push(`<div class="hero-stat"><span class="hero-stat-value">${fmtTime(best)}</span><span class="hero-stat-label">Best 2K</span></div>`);
  }

  statsEl.innerHTML = parts.join('');

  // Update W/KG badge
  const wtpEl = document.getElementById('wtp-value');
  if (weightEntries.length > 0 && ergEntries.length > 0) {
    const latestWeight = weightEntries[weightEntries.length - 1].weight;
    const latestErg = ergEntries[ergEntries.length - 1].time_seconds;
    const weightKg = latestWeight * 0.453592;
    const watts = timeToWatts(latestErg);
    const wkg = (watts / weightKg).toFixed(2);
    wtpEl.textContent = wkg;
  } else {
    wtpEl.textContent = '—';
  }
}

// ===================== WEIGHT TARGET =====================

function updateWeightTarget() {
  const saved = localStorage.getItem('bulk_weight_target');
  const displayEl = document.getElementById('goal-display');
  const emptyEl = document.getElementById('goal-empty');

  if (!saved) {
    displayEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  const { targetWeight, targetDate } = JSON.parse(saved);

  if (!weightEntries.length) {
    displayEl.style.display = 'none';
    emptyEl.textContent = 'Log a weight to see your weekly plan.';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  displayEl.style.display = 'block';

  const current = weightEntries[weightEntries.length - 1].weight;
  const remaining = targetWeight - current;
  const today = new Date();
  const deadline = new Date(targetDate + 'T00:00:00');
  const msLeft = deadline - today;
  const weeksLeft = msLeft / (1000 * 60 * 60 * 24 * 7);

  document.getElementById('goal-current-weight').textContent = current.toFixed(1);
  document.getElementById('goal-target-weight').textContent = targetWeight.toFixed(1);

  if (remaining <= 0) {
    document.getElementById('goal-per-week').textContent = 'Done!';
    document.getElementById('goal-detail').innerHTML = '<strong>Goal reached!</strong> You hit your target weight.';
  } else if (weeksLeft <= 0) {
    document.getElementById('goal-per-week').textContent = '—';
    document.getElementById('goal-detail').innerHTML = 'Target date has passed. <strong>' + remaining.toFixed(1) + ' lbs</strong> remaining. Update your target date.';
  } else {
    const perWeek = remaining / weeksLeft;
    document.getElementById('goal-per-week').textContent = '+' + perWeek.toFixed(2);

    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    const deadlineStr = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('goal-detail').innerHTML =
      `<strong>${remaining.toFixed(1)} lbs</strong> to go · <strong>${daysLeft}</strong> days left (${deadlineStr})`;
  }
}

// Toggle goal form
document.getElementById('goal-toggle-btn').addEventListener('click', () => {
  const form = document.getElementById('goal-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  const saved = localStorage.getItem('bulk_weight_target');
  if (saved) {
    const { targetWeight, targetDate } = JSON.parse(saved);
    document.getElementById('goal-weight').value = targetWeight;
    document.getElementById('goal-date').value = targetDate;
  }
});

// Save goal
document.getElementById('goal-save-btn').addEventListener('click', () => {
  const targetWeight = parseFloat(document.getElementById('goal-weight').value);
  const targetDate = document.getElementById('goal-date').value;
  if (isNaN(targetWeight) || targetWeight <= 0 || !targetDate) return;
  localStorage.setItem('bulk_weight_target', JSON.stringify({ targetWeight, targetDate }));
  document.getElementById('goal-form').style.display = 'none';
  updateWeightTarget();
});

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

async function fetchWeights() {
  weightEntries = await (await fetch('/api/weights')).json();
  renderWeightTable();
  renderWeightChart();
  updateHeroStats();
  updateWeightTarget();
}

weightForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = dateInput.value;
  const weight = parseFloat(weightInput.value);
  if (!date || isNaN(weight)) return showMsg(weightMsg, 'Enter a valid date and weight.', 'error');
  try {
    await fetch('/api/weights', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({date, weight}) });
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
  const sma = calculateSMA(weights);

  if (weightChart) {
    weightChart.data.labels = labels;
    weightChart.data.datasets[0].data = weights;
    weightChart.data.datasets[1].data = sma;
    weightChart.update(); return;
  }

  const ctx = document.getElementById('weight-chart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(255, 0, 200, 0.15)');
  gradient.addColorStop(1, 'rgba(255, 0, 200, 0)');

  weightChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      {
        label: 'Daily Weight',
        data: weights,
        borderColor: COLORS.accent,
        backgroundColor: gradient,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: COLORS.accent,
        pointBorderColor: COLORS.cardBg,
        pointBorderWidth: 2,
        fill: true,
        tension: 0.35
      },
      {
        label: '7-Day Average',
        data: sma,
        borderColor: 'rgba(255, 255, 255, 0.25)',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0.4,
        spanGaps: false
      }
    ]},
    options: chartOptions('lbs')
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
  await fetch(`/api/weights/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({weight: w}) });
  editModal.classList.remove('active');
  await fetchWeights();
  showMsg(weightMsg, 'Entry updated.', 'success');
});

document.getElementById('delete-weight').addEventListener('click', async () => {
  const id = editIdInput.value;
  if (!confirm('Delete this weight entry?')) return;
  await fetch(`/api/weights/${id}`, { method: 'DELETE' });
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
  if (inputUnit !== 'split') return;
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
let inputUnit = 'split';

inputUnitBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    inputUnitBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    inputUnit = btn.dataset.unit;
    const label = document.getElementById('erg-input-label');
    if (inputUnit === 'watts') {
      label.textContent = '2K Watts';
      ergTimeInput.placeholder = '285';
      ergTimeInput.removeAttribute('maxlength');
      ergTimeInput.inputMode = 'numeric';
    } else {
      label.textContent = '2K Time (M:SS.s)';
      ergTimeInput.placeholder = '0:00.0';
      ergTimeInput.setAttribute('maxlength', '6');
      ergTimeInput.inputMode = 'numeric';
    }
    ergTimeInput.value = '';
  });
});

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
  ergEntries = await (await fetch('/api/ergtimes')).json();
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
  } else {
    timeSec = parseTime(raw);
  }
  if (!date || isNaN(timeSec)) return showMsg(ergMsg, 'Enter a valid date and time/watts.', 'error');
  try {
    await fetch('/api/ergtimes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date, time_seconds: timeSec }) });
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

  let bestTime = Infinity;
  const prSet = new Set();
  ergEntries.forEach(e => {
    if (e.time_seconds < bestTime) {
      bestTime = e.time_seconds;
      prSet.add(e.id);
    }
  });

  ergTableBody.innerHTML = rev.map((e, idx) => {
    const oi = ergEntries.length - 1 - idx;
    const split = toSplit(e.time_seconds);
    const watts = timeToWatts(e.time_seconds);
    const metricVal = ergTableUnit === 'watts' ? `${watts.toFixed(1)}` : fmtTime(split);
    const isPR = prSet.has(e.id);
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
  } else {
    values = filtered.map(e => +toSplit(e.time_seconds).toFixed(1));
  }

  const segmentColors = [];
  let best = ergChartUnit === 'watts' ? -Infinity : Infinity;
  for (let i = 0; i < values.length; i++) {
    const isBetter = ergChartUnit === 'watts' ? values[i] > best : values[i] < best;
    if (isBetter) best = values[i];
    if (i > 0) {
      const curBest = ergChartUnit === 'watts' ? values[i] >= best : values[i] <= best;
      if (curBest) {
        segmentColors.push(COLORS.green);
      } else {
        segmentColors.push(COLORS.red);
      }
    }
  }

  const ctx = document.getElementById('erg-chart').getContext('2d');
  if (ergChart) { ergChart.destroy(); ergChart = null; }

  ergChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      label: ergChartUnit === 'watts' ? 'Watts' : '500m Split',
      data: values,
      borderColor: COLORS.accent,
      borderWidth: 2.5,
      pointRadius: 5,
      pointHoverRadius: 8,
      pointBackgroundColor: (ctx) => {
        const i = ctx.dataIndex;
        if (i === 0) return COLORS.accent;
        const isBest = ergChartUnit === 'watts'
          ? values[i] >= Math.max(...values.slice(0, i+1))
          : values[i] <= Math.min(...values.slice(0, i+1));
        return isBest ? COLORS.green : COLORS.accent;
      },
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
    }]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'top', align: 'start',
          labels: {
            color: COLORS.textMuted,
            font: { family: COLORS.fontMono, size: 12 },
            usePointStyle: true, pointStyleWidth: 8, padding: 20
          }
        },
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
          reverse: ergChartUnit === 'split',
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
    }
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
  await fetch(`/api/ergtimes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ time_seconds: timeSec }) });
  ergEditModal.classList.remove('active');
  await fetchErgTimes();
  showMsg(ergMsg, 'Entry updated.', 'success');
});

document.getElementById('delete-erg').addEventListener('click', async () => {
  const id = ergEditId.value;
  if (!confirm('Delete this 2K entry?')) return;
  await fetch(`/api/ergtimes/${id}`, { method: 'DELETE' });
  ergEditModal.classList.remove('active');
  await fetchErgTimes();
  showMsg(ergMsg, 'Entry deleted.', 'success');
});

// ===================== SHARED CHART OPTIONS =====================

function chartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top', align: 'start',
        labels: {
          color: COLORS.textMuted,
          font: { family: COLORS.fontMono, size: 12 },
          usePointStyle: true, pointStyleWidth: 8, padding: 20
        }
      },
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

// ===================== KEYBOARD =====================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    editModal.classList.remove('active');
    ergEditModal.classList.remove('active');
  }
});

// ===================== INIT =====================
fetchWeights();
fetchErgTimes();
