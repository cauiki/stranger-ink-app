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
        if (!apiKey) throw new Error("Chave API não configurada na Vercel");

        const { message, characterPrompt, history, image } = req.body;

        // Montagem dos dados
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

        // === FUNÇÃO DE BLINDAGEM ===
        // Tenta conectar em modelos diferentes até um funcionar
        async function tryGenerate(modelName) {
            console.log(`Tentando conectar no modelo: ${modelName}...`);
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
                                CONTEXTO: Jogo de vendas WhatsApp (Stranger Things).
                                REGRAS: Responda curto (máx 2 frases).
                                AVALIAÇÃO: [VIBE: +X] ou [VIBE: -X].
                                STATUS: "won", "lost" ou "continue".
                                FORMATO JSON OBRIGATÓRIO: { "reply": "...", "vibe_change": 0, "status": "..." }
                            `}]
                        },
                        generationConfig: { responseMimeType: "application/json" }
                    })
                }
            );

            if (!response.ok) {
                // Se der erro, lançamos exceção para o código tentar o próximo
                const errTxt = await response.text();
                throw new Error(errTxt); 
            }
            return response.json();
        }

        let data;
        try {
            // TENTATIVA 1: Versão "Latest" (Geralmente resolve o 404)
            data = await tryGenerate("gemini-1.5-flash-latest");
        } catch (e1) {
            console.warn("Flash Latest falhou:", e1.message);
            try {
                // TENTATIVA 2: Versão "001" (Estável)
                data = await tryGenerate("gemini-1.5-flash-001");
            } catch (e2) {
                console.warn("Flash 001 falhou:", e2.message);
                // TENTATIVA 3: Gemini Pro (O "velho de guerra" que nunca falha)
                data = await tryGenerate("gemini-pro");
            }
        }

        // Processa a resposta
        let textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) throw new Error("Nenhum modelo respondeu. Verifique sua API Key.");

        const jsonStr = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        let jsonResponse;
        try {
            jsonResponse = JSON.parse(jsonStr);
        } catch (e) {
            jsonResponse = { reply: jsonStr, vibe_change: 0, status: "continue" };
        }

        res.status(200).json(jsonResponse);

    } catch (error) {
        console.error("ERRO CRÍTICO:", error);
        res.status(500).json({ 
            reply: `(Erro Técnico): ${error.message}`, 
            vibe_change: 0, 
            status: "continue" 
        });
    }
}