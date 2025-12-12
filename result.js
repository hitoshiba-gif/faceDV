document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('measurementForm')) {
        initInputPage();
    } else {
        initResultPage();
    }
});

// ▼ 統計データ定義
const STANDARDS = {
    male: {
        headH_avg: 23.2, headH_sd: 0.9,
        faceW_avg: 16.1, faceW_sd: 0.8,
        body_avg: 7.2, body_sd: 0.4
    },
    female: {
        headH_avg: 21.8, headH_sd: 0.8,
        faceW_avg: 15.3, faceW_sd: 0.7,
        body_avg: 7.1, body_sd: 0.4
    }
};

/**
 * 入力ページの初期化
 */
function initInputPage() {
    const form = document.getElementById('measurementForm');
    
    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { 
            e.preventDefault();
            return false;
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {};
        data.gender = formData.get('gender');
        formData.forEach((value, key) => {
            if (key !== 'email' && key !== 'gender') {
                data[key] = value ? parseFloat(value) : 0;
            }
        });
        localStorage.setItem('faceData', JSON.stringify(data));
        window.location.href = 'result.html';
    });
}

/**
 * 結果ページの初期化
 */
function initResultPage() {
    const rawData = localStorage.getItem('faceData');
    if (!rawData) {
        alert('データがありません。入力画面に戻ります。');
        window.location.href = 'input.html';
        return;
    }
    const data = JSON.parse(rawData);
    const results = calculateScores(data);
    renderResults(results);
}

/**
 * 計算ロジック
 */
function calculateScores(data) {
    const gender = data.gender || 'male';
    const std = STANDARDS[gender];
    const H_cm = data.height;
    const Head_H = data.head_height;

    // ベース長
    const L = data.l_face_height || (Head_H * 0.57); 
    const W = data.w_cheek || 15.0;

    // パーツ定義
    const verticalKeys = ['l_face_height', 'v_brow_eye', 'v_eye_height', 'v_glabella_nose', 'v_philtrum', 'v_lip_height', 'v_chin_lip'];
    const horizontalKeys = ['w_cheek', 'w_jaw', 'w_inner_eye', 'w_outer_eye', 'w_eye_width', 'w_nose_width', 'w_mouth_width', 'w_chin_width', 'w_outer_cheek'];

    const idealRatios = {
        l_face_height: 1.0, v_brow_eye: 0.08, v_eye_height: 0.09, v_glabella_nose: 0.35, v_philtrum: 0.10, v_lip_height: 0.10, v_chin_lip: 0.20,
        w_cheek: 1.0, w_jaw: 0.80, w_inner_eye: 0.23, w_outer_eye: 0.75, w_eye_width: 0.23, w_nose_width: 0.23, w_mouth_width: 0.35, w_chin_width: 0.28, w_outer_cheek: 0.12
    };

    // ガウス偏差値計算（詳細データを返すように変更）
    const calcGaussianScore = (val, baseVal, key) => {
        // 1. 理想値(μ)
        let mu = baseVal * idealRatios[key];
        if (key === 'l_face_height') mu = Head_H * 0.57;
        if (key === 'w_cheek') mu = Head_H * 0.65;

        // 未入力チェック
        if (!val || val === 0) return { score: 0, ideal: parseFloat(mu.toFixed(1)) };

        let strictness = 0.15;
        if (key === 'v_philtrum' || key === 'v_brow_eye') strictness = 0.12; 
        if (key === 'w_cheek' || key === 'l_face_height') strictness = 0.20; 

        const sigma = mu * strictness;
        const diff = Math.abs(val - mu);
        const z = diff / sigma; 
        
        let score = 50 + (30 * Math.exp(-0.5 * (z * z)));
        if (z > 2.0) score = 50 - ((z - 2.0) * 10);
        if (score > 80) score = 80;
        if (score < 30) score = 30;

        return { 
            score: Math.round(score), 
            ideal: parseFloat(mu.toFixed(1)) 
        };
    };

    const partDetails = {}; // 詳細データ格納用
    const vScores = [];
    const hScores = [];

    Object.keys(idealRatios).forEach(key => {
        const base = verticalKeys.includes(key) ? L : W;
        
        // 計算実行
        const result = calcGaussianScore(data[key], base, key);
        
        // 結果を保存（スコア、入力値、理想値）
        partDetails[key] = {
            score: result.score,
            userVal: data[key],
            idealVal: result.ideal
        };

        if (result.score > 0) {
            if (verticalKeys.includes(key)) vScores.push(result.score);
            if (horizontalKeys.includes(key)) hScores.push(result.score);
        }
    });

    // 平均値算出
    const getAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 50;
    
    const verticalDev = getAvg(vScores);
    const horizontalDev = getAvg(hScores);
    let bodyScore = 50;
    
    // 頭身偏差値
    if (H_cm && Head_H) {
        const ratio = H_cm / Head_H;
        bodyScore = 50 + ((ratio - std.body_avg) / std.body_sd) * 10;
        if (bodyScore > 90) bodyScore = 90;
    }

    // 総合偏差値
    const faceBalanceDev = (verticalDev + horizontalDev) / 2;
    let totalDev = (faceBalanceDev * 0.5) + (bodyScore * 0.5);

    if(totalDev > 80) totalDev = 80; 
    if(totalDev < 30) totalDev = 30;

    return {
        headRatio: (H_cm / Head_H).toFixed(1),
        verticalDev: verticalDev.toFixed(0),
        horizontalDev: horizontalDev.toFixed(0),
        bodyScore: bodyScore.toFixed(0),
        totalDev: totalDev.toFixed(0),
        partDetails: partDetails // 詳細オブジェクトを返す
    };
}

/**
 * ランク判定
 */
// result.js の該当箇所を書き換えてください

/**
 * ランク判定（ユーザー指定ロジック）
 */
function getRankInfo(score) {
    if (score === 0) return { rank: '-', color: '#eee', text: '#aaa' };
    
    // ご指定のロジックとカラーコード
    if (score >= 80) return { rank: 'SS', color: '#c432ed', text: '#fff' }; // 鮮やかパープル
    if (score >= 70) return { rank: 'S',  color: '#d4af37', text: '#fff' }; // ゴールド
    if (score >= 60) return { rank: 'A',  color: '#d68e8e', text: '#fff' }; // ピンク
    if (score >= 50) return { rank: 'B',  color: '#bda37e', text: '#fff' }; // ブロンズ
    if (score >= 40) return { rank: 'C',  color: '#5ad8c7', text: '#fff' }; // ミントグリーン
    
    return { rank: 'C', color: '#e2e8f0', text: '#555' }; // グレー
}

/**
 * 結果描画（総合バッジ追加版）
 */
function renderResults(results) {
    document.getElementById('res_head_ratio').textContent = results.headRatio + '頭身';
    
    // ▼▼▼ 修正: 総合偏差値の横に「神バッジ」を追加する処理 ▼▼▼
    const totalScore = results.totalDev;
    const totalRank = getRankInfo(totalScore);
    
    // バッジのHTMLを作成（キラキラアイコン付き）
    const badgeIcon = totalScore >= 70 ? '👑' : (totalScore >= 60 ? '✨' : '');
    const badgeHtml = `
        <div class="badge-container">
            <span class="total-rank-badge" style="
                --badge-color: ${totalRank.color}; 
                --badge-color-light: ${totalRank.color}40; /* 色を薄くした影用 */
            ">
                <span class="badge-icon">${badgeIcon}</span> Rank ${totalRank.rank}
            </span>
        </div>
    `;
    // 数値とバッジを並べて表示
    document.getElementById('res_total_dev').innerHTML = `${totalScore} ${badgeHtml}`;
    // ▲▲▲ 修正ここまで ▲▲▲

    document.getElementById('res_vertical_dev').textContent = results.verticalDev;
    document.getElementById('res_horizontal_dev').textContent = results.horizontalDev;
    document.getElementById('res_body_dev').textContent = results.bodyScore;

    // リスト描画（ここは変更なし）
    document.querySelectorAll('.score-item').forEach(item => {
        const key = item.getAttribute('data-key');
        const detail = results.partDetails[key];
        const label = item.querySelector('.label').textContent;
        const r = getRankInfo(detail.score);
        const userValDisplay = detail.userVal ? detail.userVal + 'cm' : '-';
        const idealValDisplay = detail.idealVal + 'cm';

        item.innerHTML = `
            <div style="width:100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span class="label" style="font-size:14px; font-weight:600; color:var(--col-text-main);">${label}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:12px; color:var(--col-text-sub);">Dev ${detail.score > 0 ? detail.score : '-'}</span>
                        <span class="rank-badge-style" style="background:${r.color}; color:${r.text};">
                            ${r.rank}
                        </span>
                    </div>
                </div>
                <div class="comparison-box">
                    <span>計測: <strong>${userValDisplay}</strong></span>
                    <span>理想: <strong>${idealValDisplay}</strong></span>
                </div>
            </div>
        `;
    });

    // コメント生成
    const commentBox = document.getElementById('res_comment');
    commentBox.classList.remove('placeholder-text');
    commentBox.style.fontStyle = "normal";
    commentBox.innerHTML = `
        あなたのFaceDVは <strong>${results.totalDev}</strong> です。<br>
        総合ランクは <strong style="color:${totalRank.color}">${totalRank.rank}</strong> 判定です。<br>
        理想値（黄金比）に近いほど高得点になります。
    `;
}