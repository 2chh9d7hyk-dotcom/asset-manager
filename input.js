let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
  Storage.init();
  initCategoryOptions();
  renderAssetList();
  bindEvents();
  Storage.assets.onChange(() => renderAssetList());
});

function initCategoryOptions() {
  const select = document.getElementById('category');
  Object.entries(AssetManager.CATEGORIES).forEach(([key, cat]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${cat.icon} ${cat.label}`;
    select.appendChild(opt);
  });
}

function toggleFundFields(isFund) {
  ['fundContribGroup', 'fundReturnGroup', 'fundHint'].forEach(id => {
    document.getElementById(id).classList.toggle('is-hidden', !isFund);
  });
}

function renderAssetList() {
  const assets     = AssetManager.getAll();
  const categories = AssetManager.CATEGORIES;
  const tbody      = document.getElementById('assetTableBody');

  document.getElementById('totalDisplay').textContent = Charts.formatCurrency(AssetManager.getTotal());

  if (assets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-message">まだ資産が登録されていません</td></tr>`;
    return;
  }

  const sorted = [...assets].sort((a, b) => b.date.localeCompare(a.date));

  tbody.innerHTML = sorted.map(a => {
    const cat     = categories[a.category] || categories.other;
    const badgeCls = `badge-${a.category.replace('_', '-')}`;
    return `
      <tr id="row-${a.id}">
        <td>
          <span class="category-badge ${badgeCls}">
            ${cat.icon} ${cat.label}
          </span>
        </td>
        <td>${esc(a.name)}</td>
        <td class="text-right amount-cell">${Charts.formatCurrency(a.amount)}</td>
        <td class="date-cell">${a.date}</td>
        <td class="note-cell">${esc(a.note)}</td>
        <td class="action-cell">
          <button class="btn btn-sm btn-outline" data-action="edit"   data-id="${a.id}">編集</button>
          <button class="btn btn-sm btn-danger"  data-action="delete" data-id="${a.id}">削除</button>
        </td>
      </tr>`;
  }).join('');
}

function bindEvents() {
  document.getElementById('category').addEventListener('change', function () {
    toggleFundFields(this.value === 'fund');
  });

  document.getElementById('assetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm();
  });

  document.getElementById('cancelBtn').addEventListener('click', resetForm);

  document.getElementById('saveSnapshotBtn').addEventListener('click', () => {
    if (AssetManager.getAll().length === 0) { showToast('先に資産を入力してください', 'warning'); return; }
    const snap = AssetManager.saveSnapshot();
    showToast(`${snap.yearMonth} のスナップショットを保存しました`);
  });

  document.getElementById('loadSampleBtn').addEventListener('click', loadSampleData);

  // イベント委譲 — tbody 内の編集・削除ボタン
  document.getElementById('assetTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit')   startEdit(id);
    if (btn.dataset.action === 'delete') deleteAsset(id);
  });
}

function submitForm() {
  const isFund = document.getElementById('category').value === 'fund';
  const data = {
    name:     document.getElementById('name').value.trim(),
    category: document.getElementById('category').value,
    amount:   document.getElementById('amount').value,
    date:     document.getElementById('date').value,
    note:     document.getElementById('note').value.trim(),
  };

  if (isFund) {
    data.monthlyContribution  = Number(document.getElementById('monthlyContribution').value) || 0;
    data.expectedAnnualReturn = Number(document.getElementById('expectedAnnualReturn').value) ?? 7.0;
  }

  if (!data.name)                              { showToast('資産名を入力してください', 'warning'); return; }
  if (!data.amount || Number(data.amount) < 0) { showToast('正しい金額を入力してください', 'warning'); return; }

  if (editingId) {
    AssetManager.update(editingId, data);
    showToast('資産を更新しました');
  } else {
    AssetManager.add(data);
    showToast('資産を追加しました');
  }

  resetForm();
  renderAssetList();
}

function startEdit(id) {
  const asset = AssetManager.getAll().find(a => a.id === id);
  if (!asset) return;

  editingId = id;
  document.getElementById('name').value     = asset.name;
  document.getElementById('category').value = asset.category;
  document.getElementById('amount').value   = asset.amount;
  document.getElementById('date').value     = asset.date;
  document.getElementById('note').value     = asset.note;

  const isFund = asset.category === 'fund';
  toggleFundFields(isFund);
  if (isFund) {
    document.getElementById('monthlyContribution').value  = asset.monthlyContribution || 0;
    document.getElementById('expectedAnnualReturn').value = asset.expectedAnnualReturn ?? 7.0;
  }

  document.getElementById('formTitle').textContent = '資産を編集';
  document.getElementById('submitBtn').textContent = '更新する';
  document.getElementById('cancelBtn').classList.remove('is-hidden');
  document.getElementById('assetForm').scrollIntoView({ behavior: 'smooth' });
}

function deleteAsset(id) {
  const asset = AssetManager.getAll().find(a => a.id === id);
  if (!asset || !confirm(`「${asset.name}」を削除しますか？`)) return;
  AssetManager.remove(id);
  showToast('削除しました', 'warning');
  renderAssetList();
}

function resetForm() {
  editingId = null;
  document.getElementById('assetForm').reset();
  document.getElementById('date').value            = new Date().toISOString().split('T')[0];
  document.getElementById('formTitle').textContent = '資産を追加';
  document.getElementById('submitBtn').textContent = '追加する';
  document.getElementById('cancelBtn').classList.add('is-hidden');
  toggleFundFields(false);
}

function loadSampleData() {
  if (AssetManager.getAll().length > 0) {
    if (!confirm('既存データにサンプルを追加します。よろしいですか？')) return;
  }
  const today = new Date().toISOString().split('T')[0];
  [
    { name: '三菱UFJ銀行（普通預金）', category: 'cash',        amount: 1200000, date: today, note: '生活費口座' },
    { name: '楽天銀行（貯蓄用）',      category: 'cash',        amount: 3000000, date: today, note: '緊急資金' },
    { name: 'トヨタ自動車（7203）',    category: 'stock',       amount: 500000,  date: today, note: '' },
    { name: 'eMAXIS Slim 全世界株式',  category: 'fund',        amount: 1500000, date: today, note: 'つみたてNISA',
      monthlyContribution: 33333, expectedAnnualReturn: 7.0 },
    { name: 'SBI・V・S&P500',         category: 'fund',        amount: 800000,  date: today, note: 'iDeCo',
      monthlyContribution: 20000, expectedAnnualReturn: 8.5 },
    { name: 'ビットコイン',            category: 'crypto',      amount: 300000,  date: today, note: '' },
  ].forEach(s => AssetManager.add(s));
  showToast('サンプルデータを追加しました');
  renderAssetList();
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
