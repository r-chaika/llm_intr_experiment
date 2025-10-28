// ===== 実験共通 =====
const PID = crypto?.randomUUID?.() || `pid-${Math.random().toString(36).slice(2)}`;
const CHAT_ENDPOINT = "https://sm5asdle3k.execute-api.ap-northeast-3.amazonaws.com/chat";

const jsPsych = initJsPsych({
  on_finish: () => {
    const payload = {
      pid: PID,
      ts: new Date().toISOString(),
      ua: navigator.userAgent,
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
    <h3>AIとの会話</h3>
    <div class="chatbox" id="chatbox"></div>
    <div class="row">
      <input id="chatInput" type="text" placeholder="Type something here…" />
      <button id="sendBtn">送信</button>
    </div>
    <p class="note">AI repsponse might take time. Please wait patiently</p>
  `,
  on_load: () => {
    const box = document.getElementById('chatbox');
    const input = document.getElementById('chatInput');
    const send = document.getElementById('sendBtn');

    const history = [{ role: "system", content: systemPrompt }];
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
          body: JSON.stringify({ pid: PID, messages })
        });
        const text = await res.text();
        if (!res.ok) {
          console.error("CHAT_ENDPOINT error:", res.status, text);
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
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

        // 会話ログに保存
        chatLog.push({
          turn: turnsDone,
          user: text,
          assistant: atext
        });

        if (turnsDone >= chatTurns) {
          input.disabled = true;
          send.disabled = true;
          document.querySelector('.jspsych-btn').disabled = false;
        }
      } catch (e) {
        append("assistant", `System error: ${String(e).slice(0, 200)}`);
        console.error(e);
        // エラーでも進行不能を防ぐ
        document.querySelector('.jspsych-btn').disabled = false;
      } finally {
        busy = false;
        input.focus();
      }
    }

    // 最初にAIの挨拶
    append("assistant", "Ask me anything:)");
//    history.push({ role: "assistant", content: "Hi, how are you?" });

    document.querySelector('.jspsych-btn').disabled = true;
    send.addEventListener('click', handleSend);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });
    input.focus();

    // 保存用に chatLog を trial オブジェクトに保持
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

// ===== 終了画面 =====
const the_end = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>Thank you for your participation.</h2><p>Please push 'Finish' button and close the browser.</p>`,
  choices: ['Finish'],
  on_finish: d => d.stage = 'end'
};

// ===== 実行 =====
jsPsych.run([preload, consent, check_consent, preSurvey, chatTrial, postSurvey, the_end]);
