const FUND_COLORS = [
  '#2563eb', '#0f9b87', '#c99216', '#7c5ec9',
  '#e03060', '#34d399', '#60a5fa', '#f472b6',
];

let _mcChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  Storage.init();
  renderFundList();
  bindSimulationEvents();
  Storage.assets.onChange(() => renderFundList());
});

function getFundAssets() {
  return Storage.assets.getAll()
    .filter(a => a.category === 'fund')
    .map(a => ({
      id:                   a.id,
      name:                 a.name,
      currentAmount:        a.amount,
      monthlyContribution:  a.monthlyContribution  || 0,
      expectedAnnualReturn: a.expectedAnnualReturn ?? 7.0,
      annualVolatility:     a.annualVolatility     ?? 15,
      note:                 a.note || '',
    }));
}

function renderFundList() {
  const funds  = getFundAssets();
  const listEl = document.getElementById('fundList');
  const total  = funds.reduce((s, f) => s + f.currentAmount, 0);
  document.getElementById('fundTotal').textContent = Charts.formatCurrency(total);

  if (funds.length === 0) {
    listEl.innerHTML = `
      <div class="sim-empty-state">
        <p class="sim-empty-text">投資信託が登録されていません</p>
        <a href="input.html" class="btn btn-primary">＋ 資産入力で追加する</a>
      </div>`;
    return;
  }

  listEl.innerHTML = funds.map((f, i) => {
    const color = FUND_COLORS[i % FUND_COLORS.length];
    return `
      <div class="fund-card" style="--fund-color:${color}; border-left-color:${color}">
        <div class="fund-card-header">
          <span class="fund-name">${esc(f.name)}</span>
          <a href="input.html" class="btn btn-sm btn-outline">残高を編集</a>
        </div>
        <div class="fund-stats">
          <div>
            <div class="fund-stat-label">現在残高</div>
            <div class="fund-stat-value">${Charts.formatCurrency(f.currentAmount)}</div>
          </div>
          <div>
            <div class="fund-stat-label">毎月積立（円）</div>
            <input class="fund-inline-input" type="number" id="contrib-${f.id}"
              value="${f.monthlyContribution}" min="0" step="1000">
          </div>
          <div>
            <div class="fund-stat-label">想定年利（%）</div>
            <input class="fund-inline-input" type="number" id="return-${f.id}"
              value="${f.expectedAnnualReturn}" min="-50" max="100" step="0.1">
          </div>
          <div>
            <div class="fund-stat-label">年率リスク・σ（%）</div>
            <input class="fund-inline-input" type="number" id="volatility-${f.id}"
              value="${f.annualVolatility}" min="0" max="200" step="0.5">
          </div>
        </div>
        ${f.note ? `<div class="fund-note">${esc(f.note)}</div>` : ''}
        <div class="fund-save-row">
          <button class="btn btn-sm btn-primary" data-action="save-fund" data-id="${f.id}">保存</button>
        </div>
      </div>`;
  }).join('');
}

function saveFundParams(id) {
  const contrib      = Number(document.getElementById(`contrib-${id}`).value)     || 0;
  const annualReturn = Number(document.getElementById(`return-${id}`).value)      ?? 7.0;
  const volatility   = Number(document.getElementById(`volatility-${id}`).value)  ?? 15;
  AssetManager.update(id, {
    monthlyContribution:  contrib,
    expectedAnnualReturn: annualReturn,
    annualVolatility:     volatility,
  });
  showToast('積立設定を保存しました');
}

function bindSimulationEvents() {
  document.getElementById('runSimBtn').addEventListener('click', runSimulation);

  // イベント委譲 — ファンドカードの「保存」ボタン
  document.getElementById('fundList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="save-fund"]');
    if (btn) saveFundParams(btn.dataset.id);
  });
}

function runSimulation() {
  const funds = getFundAssets();
  if (funds.length === 0) {
    showToast('先に「資産入力」タブで投資信託を登録してください', 'warning');
    return;
  }

  const years       = Number(document.getElementById('simYears').value) || 20;
  const allTotal    = AssetManager.getTotal();
  const fundTotal   = funds.reduce((s, f) => s + f.currentAmount, 0);
  const otherAssets = Math.max(0, allTotal - fundTotal);

  // ── 複利計算（確定値）────────────────────────────────────
  const result  = Simulation.runSimulation(funds, years, otherAssets);
  const summary = Simulation.getSummary(result, funds, years);

  const datasets = result.fundResults.map((fr, i) => ({
    label:            fr.name,
    data:             fr.values,
    borderColor:      FUND_COLORS[i % FUND_COLORS.length],
    backgroundColor:  FUND_COLORS[i % FUND_COLORS.length] + '18',
    borderWidth:      2,
    pointRadius:      0,
    pointHoverRadius: 4,
    tension:          0.35,
    fill:             false,
  }));

  datasets.push({
    label:            '合計資産',
    data:             result.totalValues,
    borderColor:      '#2563eb',
    backgroundColor:  'rgba(37,99,235,0.07)',
    borderWidth:      3,
    pointRadius:      0,
    pointHoverRadius: 5,
    tension:          0.35,
    fill:             true,
  });

  const displayLabels = result.labels.map((l, i) => (i % 12 === 0 ? l : ''));
  Charts.renderLine('simChart', displayLabels, datasets, {
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, color: '#6b7591' } },
    },
  });

  document.getElementById('simFinalTotal').textContent   = Charts.formatCurrency(summary.finalTotal);
  document.getElementById('simTotalContrib').textContent = Charts.formatCurrency(summary.totalContributions);
  document.getElementById('simTotalGain').textContent    = Charts.formatCurrency(summary.totalGain);
  document.getElementById('simReturnRate').textContent   = `${summary.returnRate.toFixed(1)}%`;

  const resultSection = document.getElementById('simResultSection');
  resultSection.classList.remove('is-hidden');
  resultSection.scrollIntoView({ behavior: 'smooth' });

  // ── モンテカルロシミュレーション（確定値描画後に実行）───
  const mcNoteEl = document.getElementById('mcNsimsNote');
  mcNoteEl.textContent = '⏳ モンテカルロシミュレーション計算中...';
  setTimeout(() => {
    const mc = Simulation.runMonteCarlo(funds, years, otherAssets);
    renderMCChart(mc);
    const months = years * 12;
    document.getElementById('mcP5').textContent  = Charts.formatCurrency(mc.p5[months]);
    document.getElementById('mcP30').textContent = Charts.formatCurrency(mc.p30[months]);
    document.getElementById('mcP50').textContent = Charts.formatCurrency(mc.p50[months]);
    document.getElementById('mcP70').textContent = Charts.formatCurrency(mc.p70[months]);
    document.getElementById('mcP95').textContent = Charts.formatCurrency(mc.p95[months]);
    mcNoteEl.textContent = `※ ${mc.nSims.toLocaleString()}回のシミュレーション結果に基づく確率的試算。投資元本を保証するものではありません。`;
  }, 50);
}

function renderMCChart(mc) {
  if (_mcChartInstance) {
    _mcChartInstance.destroy();
    _mcChartInstance = null;
  }

  const displayLabels = mc.labels.map((l, i) => (i % 12 === 0 ? l : ''));
  const ctx = document.getElementById('mcChart').getContext('2d');

  // データセット順: p5(0) → p30(1) → p70(2) → p95(3) → p50中央値(4, 最前面)
  // fill プロパティはデータセットインデックスを参照する
  _mcChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: displayLabels,
      datasets: [
        {
          label:       '下位5%',
          data:        mc.p5,
          borderColor: 'rgba(37,99,235,0.22)',
          borderWidth: 1,
          borderDash:  [5, 4],
          pointRadius: 0,
          fill:        false,
          tension:     0.3,
        },
        {
          label:           '下位30%',
          data:            mc.p30,
          borderColor:     'rgba(37,99,235,0.38)',
          borderWidth:     1,
          pointRadius:     0,
          fill:            0,
          backgroundColor: 'rgba(37,99,235,0.07)',
          tension:         0.3,
        },
        {
          label:           '上位30%',
          data:            mc.p70,
          borderColor:     'rgba(37,99,235,0.38)',
          borderWidth:     1,
          pointRadius:     0,
          fill:            1,
          backgroundColor: 'rgba(37,99,235,0.12)',
          tension:         0.3,
        },
        {
          label:           '上位5%',
          data:            mc.p95,
          borderColor:     'rgba(37,99,235,0.22)',
          borderWidth:     1,
          borderDash:      [5, 4],
          pointRadius:     0,
          fill:            2,
          backgroundColor: 'rgba(37,99,235,0.07)',
          tension:         0.3,
        },
        {
          label:            '中央値（50%）',
          data:             mc.p50,
          borderColor:      '#1b4fd8',
          borderWidth:      2.5,
          pointRadius:      0,
          pointHoverRadius: 5,
          fill:             false,
          tension:          0.3,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111828',
          titleColor:      '#dde6f6',
          bodyColor:       '#9aa8cc',
          borderColor:     '#1e2a52',
          borderWidth:     1,
          padding:         10,
          cornerRadius:    8,
          callbacks: {
            label: (c) => `  ${c.dataset.label}: ${Charts.formatCurrency(c.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { color: '#6b7591', maxRotation: 0 },
        },
        y: {
          grid:  { color: 'rgba(30,40,80,0.06)' },
          ticks: { color: '#6b7591', callback: (v) => Charts.formatCurrencyShort(v) },
          beginAtZero: false,
        },
      },
      animation: { duration: 500, easing: 'easeOutQuart' },
    },
  });
}

function showToast(msg, type = 'success') {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className   = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
