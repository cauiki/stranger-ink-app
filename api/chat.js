export default async function handler(req, res) {
    // Configurações CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const { message, characterPrompt, history, image, audioTranscript } = req.body;

        const SALES_METHODOLOGY = `
        VOCÊ É O PERSONAGEM DESCRITO ABAIXO (Stranger Things 2025).
        ${characterPrompt}
        
        CENÁRIO: WhatsApp. Você está cotando uma tatuagem ou piercing.
        
        DIRETRIZES:
        1. **Personalidade:** Aja como uma pessoa normal, não um robô. Mantenha os traços do personagem (Ex: Murray paranoico, Erica exigente).
        2. **Não seja estúpido:** Seja educado, mas difícil. Você valoriza seu dinheiro.
        3. **Referências:** Você entende do assunto. Se o contexto pedir, diga que vai mandar uma referência usando a tag: [SEND_REF: descrição curta da imagem em ingles].
        4. **Regra do Sinal ($):** Você SÓ fecha o negócio (status: "won") se o vendedor pedir um SINAL/ADIANTAMENTO ou garantir o agendamento firme. Se ele enrolar, você diz que vai pensar.
        
        FORMATO JSON:
        { 
            "reply": "Texto curto de zap", 
            "vibe_change": (Inteiro -5 a +5), 
            "status": "won" | "lost" | "continue",
            "deal_value": (Valor R$ se fechar. Ex: 500. Senão 0),
            "feedback": "Dica curta se ele errar (Ex: Peça o sinal!)"
        }
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
        
        // Prioriza a transcrição do áudio se houver
        const txt = audioTranscript ? `[ÁUDIO]: "${audioTranscript}"` : (message || ".");
        currentParts.push({ text: txt });
        contents.push({ role: "user", parts: currentParts });

        // Loop de Modelos
        const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-pro"];
        let resultData = null;

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
                if (r.ok) { resultData = await r.json(); break; }
            } catch (e) {}
        }

        if (!resultData) throw new Error("IA muda.");

        let rawTxt = resultData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const jsonStr = rawTxt.replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.status(200).json(JSON.parse(jsonStr));

    } catch (error) {
        console.error(error);
        res.status(500).json({ reply: "Sinal caindo...", status: "continue" });
    }
}