export default async function handler(req, res) {
    // Configurações CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const { message, characterPrompt, history, image, audioTranscript } = req.body;

        const SALES_METHODOLOGY = `
        VOCÊ É: ${characterPrompt}
        
        CENÁRIO: WhatsApp (Stranger Things 2025). 
        
        DIRETRIZES DE REALISMO:
        1. **Orgânico:** Escreva curto, como no zap. Use gírias da sua época.
        2. **Áudio:** Se a resposta for longa ou emocional, mande: [SEND_AUDIO: texto do que você falou].
        3. **Imagens:** Se precisar mostrar referência, mande: [SEND_REF: descrição visual em ingles].
        4. **Regra do Sinal ($):** Seja difícil. Peça desconto. Só feche (status: "won") se o vendedor pedir SINAL.

        FORMATO JSON:
        { "reply": "...", "vibe_change": 0, "status": "continue", "deal_value": 0 }
        `;

        const contents = [];
        if (history && Array.isArray(history)) {
            history.forEach(h => {
                const text = h.parts?.[0]?.text || "";
                if (text) contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text }] });
            });
        }
        
        const currentParts = [];
        if (image) {
            const cleanImage = image.includes("base64,") ? image.split("base64,")[1] : image;
            currentParts.push({ inlineData: { mimeType: "image/jpeg", data: cleanImage } });
            currentParts.push({ text: "[FOTO ENVIADA]" });
        }
        
        const txt = audioTranscript ? `[ÁUDIO DO VENDEDOR]: "${audioTranscript}"` : (message || ".");
        currentParts.push({ text: txt });
        contents.push({ role: "user", parts: currentParts });

        // Tenta modelos diferentes para evitar queda
        const models = ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-pro"];
        let data = null;

        for (const model of models) {
            try {
                const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents,
                        systemInstruction: { parts: [{ text: SALES_METHODOLOGY }] },
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });
                if(r.ok) { data = await r.json(); break; }
            } catch (e) {}
        }

        if(!data) throw new Error("IA offline");

        const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
        res.status(200).json(JSON.parse(jsonStr));

    } catch (error) {
        console.error(error);
        res.status(500).json({ reply: "Sinal ruim...", status: "continue" });
    }
}