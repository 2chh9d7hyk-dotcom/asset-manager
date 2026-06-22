/**
 * firebase-config.js - Firebase 設定ファイル
 *
 * ■ Firebaseを使う場合の手順:
 *
 *   1. Firebase Console (https://console.firebase.google.com/) でプロジェクトを作成
 *   2. 「Firestore Database」を有効化（テストモードで開始）
 *   3. 「プロジェクトの設定」→「マイアプリ」でWebアプリを追加し、
 *      表示される設定値を下記に貼り付ける
 *   4. USE_FIREBASE を true に変更する
 *   5. Firebase CLI でデプロイ:
 *        npm install -g firebase-tools
 *        firebase login
 *        firebase init hosting
 *        firebase deploy
 *
 * ■ localStorageのみ使う場合（デフォルト）:
 *   USE_FIREBASE = false のまま使用できます。
 *   同じブラウザ内の複数タブ間では BroadcastChannel で自動同期されます。
 */

// ▼ ここに自分のFirebaseプロジェクトの設定値を入力 ▼
const firebaseConfig = {
  apiKey: "AIzaSyAp5s_8sBZGBTbg-DfSXptk-VWg-ib_gTY",
  authDomain: "claudecode-39d5c.firebaseapp.com",
  projectId: "claudecode-39d5c",
  storageBucket: "claudecode-39d5c.firebasestorage.app",
  messagingSenderId: "828479649056",
  appId: "1:828479649056:web:1b753fe05ad2679f24d345",
  measurementId: "G-8Q47X05W95"
};

/**
 * true  = Firestore を使用（複数デバイス間でリアルタイム同期）
 * false = localStorage のみ（同ブラウザのタブ間のみ同期）
 */
const USE_FIREBASE = true;
