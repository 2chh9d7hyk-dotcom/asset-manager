/**
 * assets.js - 資産管理ビジネスロジック
 *
 * 資産データの CRUD と集計を担当。UI・ストレージには依存しない純粋なロジック層。
 * カテゴリーカラーはダークモード向け「落ち着いた高コントラスト」パレット。
 */

const AssetManager = (() => {

  /**
   * カテゴリー定義
   *  color: ダークモードで映える、識別しやすい落ち着いたトーン
   */
  const CATEGORIES = {
    cash:        { label: '現金・預金',   color: '#3d7eff', icon: '🏦' },  // ブルー
    stock:       { label: '株式',         color: '#00c9a7', icon: '📈' },  // ティール
    fund:        { label: '投資信託',     color: '#f0a500', icon: '📊' },  // アンバー
    real_estate: { label: '不動産',       color: '#9b79f5', icon: '🏠' },  // パープル
    crypto:      { label: '暗号資産',     color: '#ff4a6e', icon: '₿'  },  // ローズ
    other:       { label: 'その他',       color: '#6a80a8', icon: '💼' },  // スレート
  };

  /** ユニークID生成 */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function getAll() {
    return Storage.assets.getAll();
  }

  /**
   * 資産を新規追加する
   * @returns {Object} 追加された資産オブジェクト
   */
  function add(data) {
    const assets   = getAll();
    const newAsset = {
      id:        generateId(),
      name:      data.name,
      category:  data.category,
      amount:    Number(data.amount),
      date:      data.date || new Date().toISOString().split('T')[0],
      note:      data.note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    assets.push(newAsset);
    Storage.assets.setAll(assets);   // → localStorage + BroadcastChannel + Firestore
    return newAsset;
  }

  /**
   * 資産を更新する
   * @returns {Object|null} 更新後の資産
   */
  function update(id, updates) {
    const assets = getAll();
    const idx    = assets.findIndex(a => a.id === id);
    if (idx === -1) return null;

    assets[idx] = {
      ...assets[idx],
      ...updates,
      amount:    Number(updates.amount ?? assets[idx].amount),
      updatedAt: new Date().toISOString(),
    };
    Storage.assets.setAll(assets);
    return assets[idx];
  }

  /** 資産を削除する */
  function remove(id) {
    Storage.assets.setAll(getAll().filter(a => a.id !== id));
  }

  /** 総資産額を返す */
  function getTotal() {
    return getAll().reduce((sum, a) => sum + a.amount, 0);
  }

  /**
   * カテゴリー別合計を返す
   * @returns {{ [category: string]: number }}
   */
  function getByCategory() {
    const result = {};
    Object.keys(CATEGORIES).forEach(k => { result[k] = 0; });
    getAll().forEach(a => {
      const cat = CATEGORIES[a.category] ? a.category : 'other';
      result[cat] += a.amount;
    });
    return result;
  }

  /**
   * 現時点の資産状況をスナップショットとして保存する（同月は上書き）
   */
  function saveSnapshot() {
    const now       = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const snapshots = Storage.snapshots.getAll();
    const existIdx  = snapshots.findIndex(s => s.yearMonth === yearMonth);

    const snap = {
      yearMonth,
      date:      now.toISOString().split('T')[0],
      total:     getTotal(),
      breakdown: getByCategory(),
      savedAt:   now.toISOString(),
    };

    if (existIdx >= 0) {
      snapshots[existIdx] = snap;
    } else {
      snapshots.push(snap);
      snapshots.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    }
    Storage.snapshots.setAll(snapshots);
    return snap;
  }

  return { CATEGORIES, getAll, add, update, remove, getTotal, getByCategory, saveSnapshot };
})();
