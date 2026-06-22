let _firstRender = true;

document.addEventListener('DOMContentLoaded', () => {
  Storage.init();
  renderDashboard();
  updateMarketStatus();
  setInterval(updateMarketStatus, 60_000);
  Storage.assets.onChange(() => renderDashboard());
});

// ── 東証マーケットステータス ──────────────────────────────────────────────
function updateMarketStatus() {
  const el = document.getElementById('marketStatus');
  if (!el) return;

  const jst  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const day  = jst.getDay();
  const mins = jst.getHours() * 60 + jst.getMinutes();
  const isWeekday  = day >= 1 && day <= 5;
  const isOpen     = isWeekday && ((mins >= 540 && mins < 690) || (mins >= 750 && mins < 930));

  el.className  = `market-status ${isOpen ? 'open' : 'closed'}`;
  el.textContent = isOpen ? '東証 開場中' : '東証 閉場';
}

// ── ポートフォリオ健全度スコア ───────────────────────────────────────────
function updateHealthScore(byCategory, total) {
  const el = document.getElementById('healthScore');
  if (!el) return;

  if (total === 0) {
    el.className  = 'health-badge score-none';
    el.textContent = 'データなし';
    return;
  }

  const nonZero = Object.values(byCategory).filter(v => v > 0).length;
  const cashRatio = byCategory.cash / total;
  let score = nonZero * 17;
  if (cashRatio < 0.9) score += 10;
  score = Math.min(score, 100);

  if (score >= 70) {
    el.className  = 'health-badge score-good';
    el.textContent = `分散度 ${score}%`;
  } else if (score >= 40) {
    el.className  = 'health-badge score-warn';
    el.textContent = `分散度 ${score}%`;
  } else {
    el.className  = 'health-badge score-bad';
    el.textContent = `分散度 ${score}%`;
  }
}

// ── カウンターアニメーション ─────────────────────────────────────────────
function animateValue(element, target, duration = 700) {
  const start = performance.now();
  const raf = (now) => {
    const t        = Math.min((now - start) / duration, 1);
    const progress = 1 - Math.pow(1 - t, 3);
    element.textContent = Charts.formatCurrency(Math.round(target * progress));
    if (t < 1) requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

// ── ダッシュボード描画 ────────────────────────────────────────────────────
function renderDashboard() {
  const assets     = AssetManager.getAll();
  const total      = AssetManager.getTotal();
  const byCategory = AssetManager.getByCategory();
  const categories = AssetManager.CATEGORIES;

  const cashTotal   = byCategory.cash;
  const investTotal = byCategory.stock + byCategory.fund + byCategory.real_estate + byCategory.crypto;

  if (_firstRender) {
    animateValue(document.getElementById('totalAssets'),  total);
    animateValue(document.getElementById('cashTotal'),    cashTotal);
    animateValue(document.getElementById('investTotal'),  investTotal);
    _firstRender = false;
  } else {
    document.getElementById('totalAssets').textContent  = Charts.formatCurrency(total);
    document.getElementById('cashTotal').textContent    = Charts.formatCurrency(cashTotal);
    document.getElementById('investTotal').textContent  = Charts.formatCurrency(investTotal);
  }

  document.getElementById('assetCount').textContent = `${assets.length} 件の資産`;

  if (assets.length > 0) {
    const latest = assets.reduce((a, b) => a.updatedAt > b.updatedAt ? a : b);
    document.getElementById('lastUpdate').textContent = latest.date;
  } else {
    document.getElementById('lastUpdate').textContent = '-';
  }

  updateHealthScore(byCategory, total);

  // ドーナツグラフ
  const pieLabels = [], pieData = [], pieColors = [];
  Object.entries(byCategory).forEach(([key, amount]) => {
    if (amount > 0) {
      pieLabels.push(categories[key].label);
      pieData.push(amount);
      pieColors.push(categories[key].color);
    }
  });

  if (pieData.length > 0) {
    Charts.renderDoughnut('pieChart', pieLabels, pieData, pieColors);
  } else {
    document.querySelector('.chart-wrapper').innerHTML =
      '<p class="empty-chart-msg">データがありません</p>';
  }

  // カスタム凡例
  const legendEl = document.getElementById('pieChartLegend');
  legendEl.innerHTML = '';
  Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .forEach(([key, amount]) => {
      const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : 0;
      legendEl.innerHTML += `
        <div class="legend-item">
          <span class="legend-dot" style="background:${categories[key].color}"></span>
          <span class="legend-label">${categories[key].icon} ${categories[key].label}</span>
          <span class="legend-value">${Charts.formatCurrency(amount)}</span>
          <span class="legend-pct">${pct}%</span>
        </div>`;
    });

  // カテゴリー別内訳バー
  const breakdownEl = document.getElementById('categoryBreakdown');
  breakdownEl.innerHTML = '';
  const sorted = Object.entries(byCategory).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) {
    breakdownEl.innerHTML = '<p class="empty-message">データがありません</p>';
  } else {
    sorted.forEach(([key, amount]) => {
      const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : 0;
      breakdownEl.innerHTML += `
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span>${categories[key].icon} ${categories[key].label}</span>
            <span class="breakdown-amount">${Charts.formatCurrency(amount)}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%; background:${categories[key].color}"></div>
          </div>
          <div class="breakdown-pct">${pct}%</div>
        </div>`;
    });
  }

  renderAssetTable(assets);
}

function renderAssetTable(assets) {
  const container  = document.getElementById('assetList');
  const categories = AssetManager.CATEGORIES;

  if (assets.length === 0) {
    container.innerHTML = `
      <p class="empty-message">
        資産データがありません。
        <a href="input.html">資産を追加する →</a>
      </p>`;
    return;
  }

  const sorted = [...assets].sort((a, b) => b.amount - a.amount);

  container.innerHTML = `
    <div class="asset-table-wrapper">
      <table class="asset-table">
        <thead>
          <tr>
            <th>カテゴリー</th>
            <th>資産名</th>
            <th class="text-right">金額</th>
            <th>日付</th>
            <th>メモ</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(a => {
            const cat      = categories[a.category] || categories.other;
            const badgeCls = `badge-${a.category.replace('_', '-')}`;
            return `
              <tr>
                <td>
                  <span class="category-badge ${badgeCls}">
                    ${cat.icon} ${cat.label}
                  </span>
                </td>
                <td>${esc(a.name)}</td>
                <td class="text-right amount-cell">${Charts.formatCurrency(a.amount)}</td>
                <td class="date-cell">${a.date}</td>
                <td class="note-cell">${esc(a.note)}</td>
              </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">合計</td>
            <td class="text-right">${Charts.formatCurrency(AssetManager.getTotal())}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
