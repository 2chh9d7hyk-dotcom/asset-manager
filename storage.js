/**
 * storage.js - データ永続化 ＋ リアルタイム同期モジュール
 *
 * ─ データの流れ ─────────────────────────────────────────────────────
 *
 *  [書き込み時]
 *    1. localStorage に即時書き込み（UI がすぐ反映される）
 *    2. BroadcastChannel で同ブラウザの他タブに通知
 *    3. USE_FIREBASE = true なら Firestore に非同期アップロード
 *
 *  [読み込み時]
 *    ・ getAll() は localStorage から同期的に返す（高速）
 *    ・ Firestore の onSnapshot が更新を受信したら localStorage を更新してコールバックを発火
 *
 *  [将来バックエンドに移行する場合]
 *    ・ fsGet / fsSet を REST API 呼び出しに置き換えるだけで OK
 * ─────────────────────────────────────────────────────────────────────
 */

const Storage = (() => {

  // localStorage のキー定義
  const KEYS = {
    ASSETS:    'am_assets',
    SNAPSHOTS: 'am_snapshots',
    FUNDS:     'am_funds',
  };

  // Firestore のドキュメント名（collection "data" 以下）
  const FS_DOCS = {
    ASSETS:    'assets',
    SNAPSHOTS: 'snapshots',
    FUNDS:     'funds',
  };

  /** Firestore インスタンス（USE_FIREBASE=true かつ init() 後に有効） */
  let db = null;

  /**
   * BroadcastChannel: 同一ブラウザの別タブへの変更通知
   * Safari/古いブラウザは BroadcastChannel 未対応のため null チェックをする
   */
  const bc = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('am-data-sync')
    : null;

  // ---- Firebase 初期化 ------------------------------------------------

  /**
   * Firebase を初期化する。
   * 全ページの DOMContentLoaded の先頭で Storage.init() を呼ぶこと。
   */
  function init() {
    // USE_FIREBASE が未定義 or false なら何もしない
    if (typeof USE_FIREBASE === 'undefined' || !USE_FIREBASE) return;

    // Firebase SDK が読み込まれているか確認
    if (typeof firebase === 'undefined') {
      console.warn('[Storage] Firebase SDKが読み込まれていません。HTMLの<head>にSDKスクリプトを追加してください。');
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();

      // オフラインキャッシュを有効化（ネット断絶時も動作する）
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

      console.info('[Storage] ✅ Firebase Firestore に接続しました');
    } catch (e) {
      console.error('[Storage] Firebase 初期化失敗:', e);
    }
  }

  // ---- localStorage ヘルパー -----------------------------------------

  function lsGet(key, def = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : def;
    } catch (e) {
      return def;
    }
  }

  function lsSet(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('[Storage] localStorage 書き込みエラー:', e);
    }
  }

  // ---- Firestore ヘルパー --------------------------------------------
  // Firestore は collection "data" の各ドキュメントに items: [...] として保存

  async function fsSet(docName, items) {
    if (!db) return;
    try {
      await db.collection('data').doc(docName).set({ items, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error('[Storage] Firestore 書き込みエラー:', docName, e);
    }
  }

  // ---- ファクトリ: 各コレクション共通のアクセサを生成 ----------------

  /**
   * @param {string} lsKey   - localStorage キー
   * @param {string} fsDoc   - Firestore ドキュメント名
   */
  function makeAccessor(lsKey, fsDoc) {
    return {
      /**
       * 全データを取得（localStorage から同期的に返す）
       * @returns {Array}
       */
      getAll() {
        return lsGet(lsKey, []);
      },

      /**
       * 全データを保存する
       *   1. localStorage に即時書き込み
       *   2. 他タブへ BroadcastChannel で通知
       *   3. Firestore へ非同期アップロード（USE_FIREBASE=true の場合）
       * @param {Array} data
       */
      setAll(data) {
        lsSet(lsKey, data);                     // ① 即時（同期）
        bc?.postMessage({ key: lsKey });         // ② 他タブに通知
        if (db) fsSet(fsDoc, data);             // ③ Firestore（非同期、awaitしない）
      },

      /**
       * データ変更を監視し、変更があればコールバックを呼ぶ
       *
       * ・USE_FIREBASE=true → Firestore onSnapshot（全デバイスにリアルタイム配信）
       * ・USE_FIREBASE=false → BroadcastChannel（同ブラウザ内タブ間のみ）
       *
       * @param {function(Array): void} callback - 変更データを受け取る関数
       * @returns {function} unsubscribe 関数（ページ離脱時に呼ぶ）
       */
      onChange(callback) {
        if (db) {
          // Firestore リアルタイムリスナー
          const unsubscribe = db.collection('data').doc(fsDoc).onSnapshot(snap => {
            if (!snap.exists) return;
            const items = snap.data().items || [];
            lsSet(lsKey, items);   // ローカルキャッシュも更新
            callback(items);
          }, err => {
            console.error('[Storage] Firestore onSnapshot エラー:', err);
          });
          return unsubscribe;
        } else {
          // BroadcastChannel リスナー（同ブラウザ内タブ間のみ）
          if (!bc) return () => {};
          const handler = (e) => {
            if (e.data?.key === lsKey) {
              callback(lsGet(lsKey));
            }
          };
          bc.addEventListener('message', handler);
          return () => bc.removeEventListener('message', handler);
        }
      },
    };
  }

  // 各コレクションのアクセサ
  const assets    = makeAccessor(KEYS.ASSETS,    FS_DOCS.ASSETS);
  const snapshots = makeAccessor(KEYS.SNAPSHOTS, FS_DOCS.SNAPSHOTS);
  const funds     = makeAccessor(KEYS.FUNDS,     FS_DOCS.FUNDS);

  // パブリックAPI
  return { init, assets, snapshots, funds };
})();
