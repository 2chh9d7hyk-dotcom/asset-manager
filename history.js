/**
 * history.js - 資産推移ページコントローラー
 *
 * 月次スナップショットをグラフ・テーブルで表示する。
 * Storage.snapshots.onChange() でリアルタイムに更新。
 */

document.addEventListener('DOMContentLoaded', () => {
  Storage.init();
  renderHistoryPage();

  // スナップショットが他タブで保存されたときに自動再描画
  Storage.snapshots.onChange(() => renderHistoryPage());
});

function renderHistoryPage() {
  const snapshots  = Storage.snapshots.getAll();
  const categories = AssetManager.CATEGORIES;

  if (snapshots.length === 0) {
    document.getElementById('historyContent').innerHTML = `
      <div class="card" style="text-align:center; padding:60px 20px;">
        <h2 style="color:var(--text-1); margin-bottom:12px">データがまだありません</h2>
        <p style="color:var(--text-2); margin-bottom:28px">
          「資産入力」ページで資産を登録し、「今月のスナップショットを保存」を押してください。
        </p>
        <a href="input.html" class="btn btn-primary">資産を入力する →</a>
      </div>`;
    return;
  }

  const labels = snapshots.map(s => s.yearMonth);

  // ---- 折れ線グラフ（総資産推移）--------------------------------------
  Charts.renderLine('lineChart', labels, [{
    label:           '総資産',
    data:            snapshots.map(s => s.total),
    borderColor:     '#3d7eff',
    backgroundColor: 'rgba(61,126,255,0.08)',
    borderWidth:     2.5,
    pointRadius:     5,
    pointBackgroundColor: '#3d7eff',
    pointBorderColor:     '#0c1020',
    pointBorderWidth: 2,
    fill:            true,
    tension:         0.35,
  }]);

  // ---- 積み上げ棒グラフ（カテゴリー別推移）----------------------------
  Charts.renderStackedBar('barChart', labels,
    Object.entries(categories).map(([key, cat]) => ({
      label:           cat.label,
      data:            snapshots.map(s => s.breakdown?.[key] || 0),
      backgroundColor: cat.color + 'bb',
      hoverBackgroundColor: cat.color,
      stack:           'stack',
    }))
  );

  // ---- サマリー行 -------------------------------------------------------
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last  = snapshots[snapshots.length - 1];
    const diff  = last.total - first.total;
    const pct   = ((diff / first.total) * 100).toFixed(1);
    document.getElementById('historySummary').innerHTML = `
      <span style="color:var(--text-2)">${first.yearMonth} 〜 ${last.yearMonth}（${snapshots.length}ヶ月）</span>
      <span class="${diff >= 0 ? 'diff-positive' : 'diff-negative'}">
        全期間: ${diff >= 0 ? '+' : ''}${Charts.formatCurrency(diff)} (${diff >= 0 ? '+' : ''}${pct}%)
      </span>`;
  }

  // ---- スナップショット一覧テーブル ------------------------------------
  const totalMap = {};
  snapshots.forEach(s => { totalMap[s.yearMonth] = s.total; });

  document.getElementById('snapshotTableBody').innerHTML =
    [...snapshots].reverse().map(snap => {
      const [y, m]  = snap.yearMonth.split('-').map(Number);
      const prevKey = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
      const prev    = totalMap[prevKey];
      let diffHtml  = '<span style="color:var(--text-3)">-</span>';

      if (prev !== undefined) {
        const d   = snap.total - prev;
        const p   = ((d / prev) * 100).toFixed(1);
        const cls = d >= 0 ? 'diff-positive' : 'diff-negative';
        const sgn = d >= 0 ? '+' : '';
        diffHtml  = `<span class="${cls}">${sgn}${Charts.formatCurrency(d)} (${sgn}${p}%)</span>`;
      }

      return `
        <tr>
          <td style="color:var(--text-2)">${snap.yearMonth}</td>
          <td class="text-right"><strong>${Charts.formatCurrency(snap.total)}</strong></td>
          <td class="text-right">${diffHtml}</td>
          <td class="text-right">${Charts.formatCurrency(snap.breakdown?.cash || 0)}</td>
          <td class="text-right">${Charts.formatCurrency(snap.breakdown?.stock || 0)}</td>
          <td class="text-right">${Charts.formatCurrency(snap.breakdown?.fund || 0)}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="deleteSnapshot('${snap.yearMonth}')">削除</button>
          </td>
        </tr>`;
    }).join('');
}

function deleteSnapshot(yearMonth) {
  if (!confirm(`${yearMonth} のスナップショットを削除しますか？`)) return;
  Storage.snapshots.setAll(Storage.snapshots.getAll().filter(s => s.yearMonth !== yearMonth));
  renderHistoryPage();
}
