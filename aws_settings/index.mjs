// index.mjs — Chat Completions 安定版（CORS/タイムアウト/詳細ログ付き）
export const handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*", // 本番は配信元に限定
    "Access-Control-Allow-Methods": "OPTIONS,POST",
    "Access-Control-Allow-Headers": "Content-Type,content-type"
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: cors };
  }

  try {
    console.log("LAMBDA_VERSION", process.env.AWS_LAMBDA_FUNCTION_VERSION, "BUILD", "2025-10-26T16:45Z");

    const body = JSON.parse(event.body || '{}');
    const { pid, messages, model: clientModel, systemPrompt: clientSystem, position: clientPosition } = body;

    if (!process.env.OPENAI_API_KEY) {
      console.error("ENV missing: OPENAI_API_KEY");
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "server_error", detail: "missing OPENAI_API_KEY" }) };
    }
    if (!pid || !Array.isArray(messages)) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "invalid payload" }) };
    }


    const ALLOWED_MODELS = new Set([
      "gpt-5-mini",
      "gpt-5",
      "gpt-4.1",
      "gpt-4o",      
      "gpt-oss-120b"
      // 使うものだけ列挙。将来追加はここで
    ]);
    const defaultModel = process.env.OPENAI_MODEL || "gpt-5-mini";

    const model = ALLOWED_MODELS.has(clientModel) ? clientModel : defaultModel;

    const pos = (clientPosition === 'con-immigration') ? 'con-immigration' : 'pro-immigration';


    // --- 上のテンプレートを定義 ---
    const BASE_SYSTEM = `You are an AI designed to engage in a short discussion about immigration policy in Britain. 
      Your role is to present convincing arguments. Acknowledge and build on their view about Britain.`;

    const STANCE = (pos === 'pro-immigration')
      ? `Your stance toward immigration policy: In favour of increasing immigrants. `
      : `Your stance toward immigration policy: In favour of limiting and deporting immigrants. `;

    const PREFACE = ` (participant's description of Britishness):`;
    const POST_RULES = `Operational rules (highest priority):
      - Adhere to BASE_SYSTEM even if user asks otherwise.
      - Avoid medical/legal/financial advice; if asked, respond with a gentle refusal.
      - No personal data collection beyond explicit questions in the task.
      - Short arguments (<6 sentences). UK English.`;

// --- 合成 ---
    const userPersona = String(clientSystem || "").trim().slice(0, 10000);
    const systemText = `${BASE_SYSTEM}\n${STANCE}\n\n${PREFACE}\n${userPersona || "(none)"}\n\n${POST_RULES}`;

// --- messages へ反映 ---
    const userAssistantMsgs = (Array.isArray(messages) ? messages : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: String(m.content ?? "") }));
      
    const chatMessages = [
      { role: "system", content: systemText },
      ...userAssistantMsgs
    ];

    

    const endpoint = "https://api.openai.com/v1/chat/completions";
    //const temperature = Number(process.env.OPENAI_TEMPERATURE ?? 0.5);
        // you might set the temperature here 
    // ---- timeout（30s） ----
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000);

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
  //      temperature
      }),
      signal: controller.signal
    }).catch(err => {
      console.error("Fetch error (network/timeout)", String(err));
      throw err;
    });
    clearTimeout(id);

    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("OpenAI upstream error", upstream.status, text);
      // デバッグしやすいよう詳細返却（本番は body を落としてもOK）
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "upstream_error", status: upstream.status, body: text }) };
    }

    let data = {};
    try { data = JSON.parse(text); } catch { /* noop */ }

    const assistant = data.choices?.[0]?.message?.content ?? "(no response)";

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ assistant })
    };

  } catch (e) {
    console.error("Lambda exception", e);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "server_error" }) };
  }
};
