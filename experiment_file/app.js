// 乱数ID（被験者ID）
const pid = crypto.randomUUID();

// 同意
const consent = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `
    <h2>研究への参加に関する同意</h2>
    <p>本研究の概要…（説明を入れてください）</p>
    <p>同意される場合は「同意する」を押してください。</p>
  `,
  choices: ['同意しない', '同意する'],
  on_finish: (data) => {
    data.stage = 'consent';
  }
};

// 同意チェック（同意しないなら終了）
const check_consent = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `<p>同意が必要です。終了します。</p><p>スペースで終了</p>`,
    choices: [' ']
  }],
  conditional_function: () => {
    const last = jsPsych.data.get().filter({stage:'consent'}).values().pop();
    return last.response !== 1; // 1=「同意する」
  }
};

// アンケート（例：Likert）
const survey = {
  type: jsPsychSurveyLikert,
  preamble: '<h3>アンケート</h3>',
  questions: [
    {prompt:'政治的話題にどの程度関心がありますか？', labels:['全くない','ややない','どちらでもない','ややある','とてもある'], required:true},
    {prompt:'SNSを利用しますか？', labels:['ほぼ使わない','ときどき','よく使う'], required:true}
  ],
  on_finish: (data)=>{ data.stage='survey'; }
};

// 終了画面
const the_end = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>ご協力ありがとうございました。</h2><p>「終了」ボタンで完了します。</p>`,
  choices: ['終了'],
  on_finish: (data)=>{ data.stage='end'; }
};

// 全データ送信（API GatewayのエンドポイントへPOST）
const post_data = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `<p>データ送信中です…</p>`,
    choices: "NO_KEYS",
    trial_duration: 800
  }],
  on_timeline_finish: async () => {
    try {
      const payload = {
        pid,
        userAgent: navigator.userAgent,
        ts: new Date().toISOString(),
        data: JSON.parse(jsPsych.data.get().json()) // 全trial
      };
      const res = await fetch("<<あなたのAPI GatewayのURL>>/save", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
        mode: "cors",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log('Upload OK');
    } catch (e) {
      console.error('Upload failed', e);
      alert('データ送信に失敗しました。ネットワークを確認してください。');
    }
  }
};

// 実行
const jsPsych = initJsPsych({
  on_finish: () => { /* 必要ならここでリダイレクト等 */ }
});
jsPsych.run([consent, check_consent, survey, the_end, post_data]);
