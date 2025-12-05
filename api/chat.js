export default async function handler(req, res) {
    // 1. Configuração CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Chave API não configurada");

        const { message, characterPrompt, history, image } = req.body;

        // 2. Montagem dos Dados
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
            currentParts.push({ text: "(Imagem enviada)" });
        }
        currentParts.push({ text: message });
        contents.push({ role: "user", parts: currentParts });

        // === A CORREÇÃO: Estratégia "Viajante do Tempo" ===
        // Tenta modelos de 2025 primeiro (2.5, 2.0). Se falhar, tenta os antigos.
        const modelsToTry = [
            "gemini-2.5-flash", 
            "gemini-2.0-flash", 
            "gemini-1.5-flash-latest",
            "gemini-pro" // O fallback que nunca morre
        ];
        
        let responseData = null;
        let lastError = null;

        for (const modelName of modelsToTry) {
            try {
                // console.log(`Tentando conectar no modelo: ${modelName}...`);
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: contents,
                            systemInstruction: {
                                parts: [{ text: `
                                    ${characterPrompt}
                                    CONTEXTO: Jogo de vendas Stranger Things.
                                    REGRAS: Responda curto (máx 2 frases).
                                    AVALIAÇÃO: [VIBE: +X] ou [VIBE: -X].
                                    STATUS: "won", "lost" ou "continue".
                                    FORMATO JSON: { "reply": "...", "vibe_change": 0, "status": "..." }
                                `}]
                            },
                            generationConfig: { responseMimeType: "application/json" }
                        })
                    }
                );

                if (response.ok) {
                    responseData = await response.json();
                    break; // Sucesso! Sai do loop e usa esse modelo.
                } else {
                    const errTxt = await response.text();
                    lastError = `Erro ${response.status} no ${modelName}: ${errTxt}`;
                    // Se for 404 (modelo não existe), continua tentando o próximo da lista
                    // if (response.status !== 404) console.warn(lastError);
                }
            } catch (e) {
                lastError = e.message;
            }
        }

        if (!responseData) throw new Error(`Todos os modelos falharam. Último erro: ${lastError}`);

        // 3. Processa Resposta
        let textResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // Fallback e Limpeza de JSON
        if (!textResponse) textResponse = '{ "reply": "...", "vibe_change": 0, "status": "continue" }';
        const jsonStr = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let jsonResponse;
        try {
            jsonResponse = JSON.parse(jsonStr);
        } catch (e) {
            jsonResponse = { reply: jsonStr, vibe_change: 0, status: "continue" };
        }

        res.status(200).json(jsonResponse);

    } catch (error) {
        console.error("ERRO FATAL:", error);
        res.status(500).json({ 
            reply: `Interferência do Mundo Invertido... (${error.message})`, 
            vibe_change: 0, 
            status: "continue" 
        });
    }
}