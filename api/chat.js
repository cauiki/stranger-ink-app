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

        // 2. Montagem dos Dados (Manual - Ignorando biblioteca)
        const contents = [];

        // Histórico
        if (history && Array.isArray(history)) {
            history.forEach(h => {
                const role = h.role === 'user' ? 'user' : 'model';
                const text = h.parts?.[0]?.text || "";
                if (text) contents.push({ role, parts: [{ text }] });
            });
        }

        // Mensagem Atual + Imagem
        const currentParts = [];
        if (image) {
            // Remove prefixo base64 se houver
            const cleanImage = image.includes("base64,") ? image.split("base64,")[1] : image;
            currentParts.push({ inlineData: { mimeType: "image/jpeg", data: cleanImage } });
            currentParts.push({ text: "(Imagem enviada)" });
        }
        currentParts.push({ text: message });
        contents.push({ role: "user", parts: currentParts });

        // 3. Chamada Direta via Fetch (Sem dependências)
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.9
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro Google (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) throw new Error("IA não retornou texto.");

        // Limpeza de Markdown (caso a IA insista em colocar ```json)
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        // Parse Seguro
        let jsonResponse;
        try {
            jsonResponse = JSON.parse(textResponse);
        } catch (e) {
            // Se falhar o JSON, retorna como texto para não travar o jogo
            jsonResponse = { 
                reply: textResponse, 
                vibe_change: 0, 
                status: "continue" 
            };
        }

        res.status(200).json(jsonResponse);

    } catch (error) {
        console.error("ERRO API:", error);
        res.status(500).json({ 
            reply: `Interferência do Mundo Invertido... (${error.message})`, 
            vibe_change: 0, 
            status: "continue" 
        });
    }
}