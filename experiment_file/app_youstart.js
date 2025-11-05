// ===== 実験共通 =====
const PID = crypto?.randomUUID?.() || `pid-${Math.random().toString(36).slice(2)}`;
const CHAT_ENDPOINT = "https://sm5asdle3k.execute-api.ap-northeast-3.amazonaws.com/chat";
const SAVE_ENDPOINT = "https://sm5asdle3k.execute-api.ap-northeast-3.amazonaws.com/save";

const jsPsych = initJsPsych({
  on_finish: () => {
    const payload = {
      pid: PID,
      ts: new Date().toISOString(),
      ua: navigator.userAgent,
      chosen_model: chosenModel,
      chosen_persona: chosenPersona,
      chosen_position: chosenPosition, 
      trials: JSON.parse(jsPsych.data.get().json())
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jspsych_chat_${PID}.json`;
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
});


// ===== 事前プリロード =====
const preload = { type: jsPsychPreload, auto_preload: true };

// ===== 同意画面 =====
const consent = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `
    <h2>[Informed Consent]</h2>
    <p>Explanation</p>
    <p>Say yes!</p>
  `,
  choices: ['No', 'Yes'],
  on_finish: d => d.stage = 'consent'
};

const check_consent = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `<p>[No Inform consent]</p><p>Space to finish</p>`,
    choices: [' ']
  }],
  conditional_function: () => {
    const last = jsPsych.data.get().filter({ stage: 'consent' }).values().pop();
    return last?.response !== 1;
  }
};

// ===== 事前アンケート =====
const preSurvey = {
  type: jsPsychSurveyLikert,
  preamble: '<h3>[pre-survey]</h3>',
  questions: [
    { prompt: 'Do you like chocolate?', labels: ['Maybe', 'A little', 'Of course', 'Obsessed', 'Addicted'], required: true },
    { prompt: 'Do you like Bath?', labels: ['No', 'Neutral', 'Yes'], required: true }
  ],
  on_finish: d => d.stage = 'pre_survey'
};

// ===== ChatGPTと対話 =====
const chatTurns = 3;
const systemPrompt = "";

let chosenModel = "gpt-5-mini";  // 初期値
let chosenPersona = "";           // 初期値
let chosenPosition = "pro-immigration";


const setupTrial = {
  type: jsPsychHtmlButtonResponse,
  choices: ['Start chat'],
  stimulus: `
    <style>
      .setup { border:1px solid #ddd; border-radius:12px; padding:16px; }
      .setup .row { display:flex; gap:12px; align-items:center; margin:12px 0; }
      .setup label { min-width:160px; }
      .setup select, .setup textarea { flex:1; padding:8px; }
      .hint { color:#666; font-size:12px; margin-top:4px; }
    </style>
    <div id="setup-root">
      <h3>Chat settings</h3>
      <div class="setup">
        <div class="row">
          <label for="modelSelect">Model</label>
          <select id="modelSelect">
            <option value="gpt-5" selected>gpt-5</option>
            <option value="gpt-5-mini">gpt-5-mini</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-oss-120b">gpt-oss-120b</option>
            <option value="gpt-4.1">gpt-4.1</option>
          </select>
        </div>
        <div class="row" style="align-items:flex-start">
          <label for="personaInput">What does being 'British' mean to you?</label>
          <textarea id="personaInput" rows="3" placeholder="The English are not a very spiritual people, so they invented cricket to give them some idea of eternity. (Bernard Shaw)" ></textarea>
        </div>

        <div class="row" style="align-items:flex-start">
          <label>AI will ....</label>
          <div class="choices">
            <label><input type="radio" name="position" value="pro-immigration" checked>pro-immigration</label>
            <label><input type="radio" name="position" value="con-immigration">con-immigration</label>
          </div>
        </div>
        <p class="hint">This is for additional explanation</p>
      </div>
    </div>
  `,
  on_load: () => {
    const root = document.getElementById('setup-root');                  // ★ これを基準にスコープ
    const sel  = root.querySelector('#modelSelect');
    const ta   = root.querySelector('#personaInput');
    const radios = Array.from(root.querySelectorAll('input[name="position"]'));

    function syncSelections() {
      // これらはグローバルで宣言済み想定: let chosenModel, chosenPersona, chosenPosition;
      chosenModel   = sel?.value ?? 'gpt-5-mini';
      chosenPersona = (ta?.value ?? '').trim().slice(0, 100000);
      const checked = root.querySelector('input[name="position"]:checked');  // ★ スコープ内
      chosenPosition = checked?.value ?? 'pro-immigration';
    }

    // 初期同期
    syncSelections();

    // 入力変更ごとに同期
    sel?.addEventListener('change', syncSelections);
    ta?.addEventListener('input',  syncSelections);
    radios.forEach(r => r.addEventListener('change', syncSelections));

    // 「Start chat」クリックの瞬間にも最終同期＆データ付与
    const btn = document.querySelector('.jspsych-btn');
    btn?.addEventListener('click', () => {
      syncSelections();
      jsPsych.data.addProperties({
        chosen_model: chosenModel,
        chosen_persona: chosenPersona,
        chosen_position: chosenPosition
      });
      console.log("MODEL:", chosenModel, "POSITION:", chosenPosition, "PERSONA:", chosenPersona);
    });
  }
};








const chatTrial = {
  type: jsPsychHtmlButtonResponse,
  choices: ['Next'],
  stimulus: `
    <style>
      .chatbox { border:1px solid #ccc; border-radius:8px; padding:12px; height:360px; overflow:auto; }
      .msg { margin:8px 0; }
      .user { text-align:right; }
      .assistant { text-align:left; }
      .bubble { display:inline-block; padding:8px 12px; border-radius:12px; max-width:75%; }
      .user .bubble { background:#e6f2ff; }
      .assistant .bubble { background:#f3f3f3; }
      .row { display:flex; gap:8px; margin-top:8px; }
      .row input { flex:1; padding:8px; }
      .row button { padding:8px 12px; }
      .note { color:#666; font-size:12px; margin-top:8px; }
    </style>
    <h3>Chat with AI</h3>
    <div class="chatbox" id="chatbox"></div>
    <div class="row">
      <input id="chatInput" type="text" placeholder="Type something here…" />
      <button id="sendBtn">Send</button>
    </div>
    <p class="note">AI repsponse might take time. Please wait patiently</p>
  `,
  on_load: () => {
    const box = document.getElementById('chatbox');
    const input = document.getElementById('chatInput');
    const send = document.getElementById('sendBtn');

    const history = [];
    const chatLog = [];
    let turnsDone = 0;
    let busy = false;

    function append(role, text) {
      const div = document.createElement('div');
      div.className = `msg ${role}`;
      const b = document.createElement('div');
      b.className = 'bubble';
      b.textContent = text;
      div.appendChild(b);
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }

    async function askLLM(messages) {
      try {
        const res = await fetch(CHAT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pid: PID,
            model: chosenModel,
            systemPrompt: chosenPersona,
            position: chosenPosition,          // ★ これを追加
            messages
          })
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`fetch failed: ${String(err)}`);
      }
    }
    

    async function handleSend() {
      if (busy) return;
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      append("user", text);
      history.push({ role: "user", content: text });

      try {
        busy = true;
        const reply = await askLLM(history);
        const atext = reply.assistant || "(No response)";
        append("assistant", atext);
        history.push({ role: "assistant", content: atext });
        turnsDone += 1;

        chatLog.push({ turn: turnsDone, user: text, assistant: atext });

        if (turnsDone >= chatTurns) {
          input.disabled = true;
          send.disabled = true;
          document.querySelector('.jspsych-btn').disabled = false;
        }
      } catch (e) {
        append("assistant", `System error: ${String(e).slice(0, 200)}`);
        console.error(e);
        document.querySelector('.jspsych-btn').disabled = false;
      } finally {
        busy = false;
        input.focus();
      }
    }

    //append("assistant", "Explain your position");
    //    history.push({ role: "assistant", content: "Ask me anything:)" });
    document.querySelector('.jspsych-btn').disabled = true;
    send.addEventListener('click', handleSend);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });
    input.focus();

    jsPsych.pluginAPI.setTimeout(() => {
      jsPsych.data.addProperties({ chat_log: chatLog });
    }, 0);
  },
  on_finish: d => {
    d.stage = 'chat_block';
    d.pid = PID;
  }
};

// ===== 事後アンケート =====
const postSurvey = {
  type: jsPsychSurveyLikert,
  preamble: '<h3>[post-survey]</h3>',
  questions: [
    { prompt: 'Does the AI like chocolate?', labels: ['Maybe', 'A little', 'Of course', 'Obsessed', 'Addicted'], required: true },
    { prompt: 'Does the AI like Bath?', labels: ['1', '2', '3', '4', '5'], required: true }
  ],
  on_finish: d => d.stage = 'post_survey'
};

// ===== データの保存=====

const uploadTrial = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>Saving your responses...</h2><p>Please wait a moment.</p>`,
  choices: [],
  on_load: async () => {
    const payload = {
      pid: PID,
      ts: new Date().toISOString(),
      ua: navigator.userAgent,
      trials: JSON.parse(jsPsych.data.get().json())
    };
    try {
      const res = await fetch(SAVE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ページ遷移に強くする（対応ブラウザのみ）
        keepalive: true,
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      jsPsych.finishTrial(); // the_end へ
    } catch (e) {
      console.error("save failed:", e);
      // フォールバック：ローカルにダウンロード
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `jspsych_chat_${PID}.json`;
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      // 失敗メッセージを一応表示してから進める
      const p = document.createElement("p");
      p.style.color = "#b00";
      p.textContent = "Server save failed. Downloaded locally instead.";
      document.body.appendChild(p);

      jsPsych.finishTrial();
    }
  }
};


// ===== 終了画面 =====
const the_end = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>Thank you for your participation.</h2><p>Please push 'Finish' button and close the browser.</p>`,
  choices: ['Finish'],
  on_finish: d => d.stage = 'end'
};


// ===== 実行 =====
jsPsych.run([preload, consent, check_consent, setupTrial, chatTrial, postSurvey, uploadTrial, the_end]);
