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
      const { pid, messages } = body;
  
      if (!process.env.OPENAI_API_KEY) {
        console.error("ENV missing: OPENAI_API_KEY");
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "server_error", detail: "missing OPENAI_API_KEY" }) };
      }
      if (!pid || !Array.isArray(messages)) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "invalid payload" }) };
      }
  
      // --- Chat Completions ---
      const chatMessages = [
        // You can assgin any role by defining it here ↓
        { role: "system", content: "You are the most cynical person on the earth." },
        ...messages.map(m => ({
          role: m.role,                                 // "user" | "assistant" | "system"
          content: String(m.content ?? "")              
        }))
      ];
  
      const endpoint = "https://api.openai.com/v1/chat/completions";
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const temperature = Number(process.env.OPENAI_TEMPERATURE ?? 0.7);
  
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
          temperature
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
  