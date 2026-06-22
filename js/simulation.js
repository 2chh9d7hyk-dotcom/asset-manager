/**
 * simulation.js - 資産シミュレーション計算モジュール
 *
 * 複利計算と積立を組み合わせた将来資産のシミュレーションを行う。
 * 計算ロジックのみで、UIには依存していない。
 */

const Simulation = (() => {

  /**
   * 1つの投資信託の将来価値を月次で計算する
   *
   * 使用する複利計算式（毎月積立）:
   *   FV = P × (1+r)^n  +  C × [(1+r)^n - 1] / r
   *
   * - P : 現在の元本
   * - C : 毎月の積立金額
   * - r : 月次リターン率 = (1 + 年利/100)^(1/12) - 1
   * - n : 積立月数
   *
   * @param {Object} fund        - 投資信託設定
   * @param {number} fund.currentAmount          - 現在の元本（円）
   * @param {number} fund.monthlyContribution    - 毎月の積立金額（円）
   * @param {number} fund.expectedAnnualReturn   - 想定年利（%）
   * @param {number} months      - シミュレーション期間（ヶ月）
   * @returns {number[]} 各月末時点の資産残高（0ヶ月目=現在を含む）
   */
  function calcFundGrowth(fund, months) {
    const P = fund.currentAmount;
    const C = fund.monthlyContribution;
    // 月次リターン率（年利を月次に変換）
    const r = Math.pow(1 + fund.expectedAnnualReturn / 100, 1 / 12) - 1;

    const values = [P]; // 0ヶ月目（現在）

    for (let n = 1; n <= months; n++) {
      const growth = P * Math.pow(1 + r, n);           // 元本の複利成長
      const contrib = r > 0
        ? C * (Math.pow(1 + r, n) - 1) / r             // 積立分の複利成長
        : C * n;                                         // リターンが0%の場合
      values.push(growth + contrib);
    }

    return values;
  }

  /**
   * 複数の投資信託を含む全体のシミュレーションを実行する
   *
   * @param {Object[]} funds  - 投資信託設定の配列（Storage.funds.getAll() の結果）
   * @param {number}   years  - シミュレーション期間（年）
   * @param {number}   [otherAssetsTotal] - 投資信託以外の資産合計（成長率0で加算）
   * @returns {{
   *   labels:       string[],   // 月ラベル（"現在", "1ヶ月後", ...）
   *   fundResults:  Object[],   // 各ファンドの月次残高
   *   totalValues:  number[]    // 全ファンド合計の月次残高
   * }}
   */
  function runSimulation(funds, years, otherAssetsTotal = 0) {
    const months = years * 12;

    // X軸ラベルを生成（0=現在, 12=1年後, ...）
    const labels = [];
    for (let i = 0; i <= months; i++) {
      if (i === 0)           labels.push('現在');
      else if (i % 12 === 0) labels.push(`${i / 12}年後`);
      else                   labels.push(`${i}ヶ月`);
    }

    // 各ファンドのシミュレーション結果
    const fundResults = funds.map(fund => ({
      id:     fund.id,
      name:   fund.name,
      values: calcFundGrowth(fund, months),
    }));

    // 全ファンドの合計（+ 他の資産は変動なし）
    const totalValues = Array.from({ length: months + 1 }, (_, i) => {
      const fundsSum = fundResults.reduce((sum, f) => sum + f.values[i], 0);
      return fundsSum + otherAssetsTotal;
    });

    return { labels, fundResults, totalValues };
  }

  /**
   * シミュレーション結果のサマリーを返す（最終月の数値）
   *
   * @param {Object} result - runSimulation() の返り値
   * @returns {{
   *   finalTotal:         number,
   *   totalContributions: number,
   *   totalGain:          number,
   *   returnRate:         number
   * }}
   */
  function getSummary(result, funds, years) {
    const months   = years * 12;
    const initial  = result.totalValues[0];
    const final    = result.totalValues[months];
    const totalC   = funds.reduce((sum, f) => sum + f.monthlyContribution * months, 0);
    const gain     = final - initial - totalC;
    const returnPct = initial + totalC > 0
      ? (gain / (initial + totalC)) * 100
      : 0;

    return {
      finalTotal:         final,
      totalContributions: totalC,
      totalGain:          gain,
      returnRate:         returnPct,
    };
  }

  // ── モンテカルロ法 ────────────────────────────────────────

  /** Box-Muller 変換で標準正規乱数を生成 */
  function randn() {
    let u;
    do { u = Math.random(); } while (u === 0);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  /**
   * モンテカルロシミュレーションを実行する
   *
   * 月次モデル:
   *   μ = 年利 / 12
   *   σ = リスク(年率標準偏差) / √12
   *   R ~ N(μ, σ)
   *   V_next = max(0, (V_prev + 積立) × (1 + R))
   *
   * 各ファンドを独立にシミュレーションし、月ごとに合算する。
   *
   * @param {Object[]} funds            - 投資信託設定 (annualVolatility を含む)
   * @param {number}   years            - シミュレーション期間（年）
   * @param {number}   [otherAssetsTotal] - 投資信託以外の資産合計（成長率0）
   * @param {number}   [nSims]          - シミュレーション回数（デフォルト5000）
   * @returns {{ labels, p5, p30, p50, p70, p95, nSims }}
   */
  function runMonteCarlo(funds, years, otherAssetsTotal = 0, nSims = 5000) {
    const months = years * 12;

    // 月ごと × シミュレーション数 のポートフォリオ残高テーブル
    const portfolioByMonth = Array.from({ length: months + 1 }, () => new Float64Array(nSims));

    // 0ヶ月目: 現在の確定値
    const initTotal = funds.reduce((s, f) => s + f.currentAmount, 0) + otherAssetsTotal;
    portfolioByMonth[0].fill(initTotal);
    // 1〜n ヶ月目: 変動しない資産を基点として加算
    for (let m = 1; m <= months; m++) portfolioByMonth[m].fill(otherAssetsTotal);

    // ファンドごとに独立シミュレーション（相関なし）
    const fundState = new Float64Array(nSims);
    for (const fund of funds) {
      const mu    = (fund.expectedAnnualReturn / 100) / 12;
      const sigma = ((fund.annualVolatility ?? 15) / 100) / Math.sqrt(12);
      const C     = fund.monthlyContribution;

      fundState.fill(fund.currentAmount);

      for (let m = 1; m <= months; m++) {
        for (let s = 0; s < nSims; s++) {
          fundState[s] = Math.max(0, (fundState[s] + C) * (1 + mu + sigma * randn()));
          portfolioByMonth[m][s] += fundState[s];
        }
      }
    }

    // 月ごとのパーセンタイルを抽出
    const pcts  = [5, 30, 50, 70, 95];
    const bands = Object.fromEntries(pcts.map(p => [`p${p}`, []]));
    const labels = [];

    for (let m = 0; m <= months; m++) {
      labels.push(m === 0 ? '現在' : m % 12 === 0 ? `${m / 12}年後` : `${m}ヶ月`);
      const sorted = Array.from(portfolioByMonth[m]).sort((a, b) => a - b);
      for (const p of pcts) {
        bands[`p${p}`].push(sorted[Math.min(Math.floor(p / 100 * nSims), nSims - 1)]);
      }
    }

    return { labels, ...bands, nSims };
  }

  // パブリックAPI
  return { runSimulation, getSummary, runMonteCarlo };
})();
