/**
 * charts.js - Chart.js ラッパーモジュール（ダークモード対応）
 *
 * Chart.js のグローバルデフォルトをダークテーマに設定し、
 * グラフ種別ごとに一貫したスタイルで描画するユーティリティ。
 */

const Charts = (() => {

  // ---- ダークモード用 Chart.js グローバルデフォルト -------------------
  Chart.defaults.color            = '#6878a8';          // 軸ラベル・凡例テキスト
  Chart.defaults.borderColor      = '#182040';          // グリッド線
  Chart.defaults.font.family      = "Inter, 'Noto Sans JP', sans-serif";
  Chart.defaults.font.size        = 12;
  Chart.defaults.plugins.legend.labels.color = '#6878a8';

  // グローバルなツールチップスタイル
  Chart.defaults.plugins.tooltip.backgroundColor = '#111828';
  Chart.defaults.plugins.tooltip.titleColor       = '#dde6f6';
  Chart.defaults.plugins.tooltip.bodyColor        = '#6878a8';
  Chart.defaults.plugins.tooltip.borderColor      = '#1e2a52';
  Chart.defaults.plugins.tooltip.borderWidth      = 1;
  Chart.defaults.plugins.tooltip.padding          = 10;
  Chart.defaults.plugins.tooltip.cornerRadius     = 8;

  // 生成済みグラフインスタンスを管理（再生成時に破棄するため）
  const instances = {};

  function destroyIfExists(id) {
    if (instances[id]) {
      instances[id].destroy();
      delete instances[id];
    }
  }

  // ---- グラフ描画関数 --------------------------------------------------

  /**
   * ドーナツグラフを描画する
   * @param {string}   canvasId - <canvas> の id
   * @param {string[]} labels   - ラベル配列
   * @param {number[]} data     - 値配列
   * @param {string[]} colors   - 色配列（HEX）
   */
  function renderDoughnut(canvasId, labels, data, colors) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + 'cc'),   // 80% 不透明
          hoverBackgroundColor: colors,
          borderColor:     '#0c1020',
          borderWidth:     3,
          hoverBorderWidth: 2,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                return `  ${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
              },
            },
          },
        },
        animation: { duration: 600, easing: 'easeOutQuart' },
      },
    });
    return instances[canvasId];
  }

  /**
   * 折れ線グラフを描画する
   * @param {string}   canvasId  - <canvas> の id
   * @param {string[]} labels    - X軸ラベル
   * @param {Object[]} datasets  - Chart.js dataset 配列
   * @param {Object}   [opts]    - 追加オプション
   */
  function renderLine(canvasId, labels, datasets, opts = {}) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels:   { usePointStyle: true, padding: 18, color: '#6878a8' },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `  ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid:  { color: '#182040' },
            ticks: { color: '#6878a8', maxRotation: 0 },
          },
          y: {
            grid:  { color: '#182040' },
            ticks: {
              color:    '#6878a8',
              callback: (v) => formatCurrencyShort(v),
            },
            beginAtZero: false,
          },
        },
        animation: { duration: 700, easing: 'easeOutQuart' },
        ...opts,
      },
    });
    return instances[canvasId];
  }

  /**
   * 積み上げ棒グラフを描画する
   * @param {string}   canvasId
   * @param {string[]} labels
   * @param {Object[]} datasets
   */
  function renderStackedBar(canvasId, labels, datasets) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, color: '#6878a8', padding: 16 } },
          tooltip: {
            callbacks: {
              label: (ctx) => `  ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid:    { color: '#182040' },
            ticks:   { color: '#6878a8' },
          },
          y: {
            stacked: true,
            grid:    { color: '#182040' },
            ticks:   { color: '#6878a8', callback: (v) => formatCurrencyShort(v) },
          },
        },
        animation: { duration: 700, easing: 'easeOutQuart' },
      },
    });
    return instances[canvasId];
  }

  // ---- ユーティリティ --------------------------------------------------

  /** ¥1,234,567 形式 */
  function formatCurrency(amount) {
    return '¥' + Math.round(amount).toLocaleString('ja-JP');
  }

  /** 短縮形（¥1,200万 など） */
  function formatCurrencyShort(amount) {
    if (Math.abs(amount) >= 1_0000_0000) return `¥${(amount / 1_0000_0000).toFixed(1)}億`;
    if (Math.abs(amount) >= 1_0000)     return `¥${(amount / 1_0000).toFixed(0)}万`;
    return `¥${Math.round(amount).toLocaleString()}`;
  }

  return { renderDoughnut, renderLine, renderStackedBar, formatCurrency, formatCurrencyShort };
})();
