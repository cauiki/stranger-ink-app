import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    // 1. Configuração CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { message, characterPrompt, history, image } = req.body;
        
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Chave de API não configurada na Vercel");
        }

        // 2. Configuração do Modelo (Requer SDK v0.21.0+)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: {
                parts: [{ text: `
                    ${characterPrompt}
                    CENÁRIO: WhatsApp. Jogo de vendas Stranger Things.
                    REGRAS: Responda curto (máx 2 frases). 
                    Avalie a resposta: [VIBE: +X] ou [VIBE: -X].
                    STATUS: "won", "lost" ou "continue".
                `}]
            },
            // Força a IA a retornar JSON válido
            generationConfig: { responseMimeType: "application/json" }
        });

        const parts = [];

        // 3. Histórico Defensivo (Evita crash se o formato variar)
        if (history && Array.isArray(history)) {
            history.slice(-6).forEach(h => {
                // Tenta ler texto de várias formas possíveis
                let text = "";
                if (h.parts?.[0]?.text) text = h.parts[0].text;
                else if (typeof h.content === 'string') text = h.content;
                
                if (text) {
                    parts.push({ text: `[Histórico (${h.role})]: ${text}` });
                }
            });
        }
        
        parts.push({ text: `[Mensagem Atual]: ${message}` });
        
        // 4. Tratamento de Imagem (Remove o prefixo data:image...)
        if (image) {
            const cleanImage = image.includes("base64,") ? image.split("base64,")[1] : image;
            parts.push({ 
                inlineData: { 
                    mimeType: "image/jpeg", 
                    data: cleanImage 
                } 
            });
            parts.push({ text: "(Imagem enviada)" });
        }

        const result = await model.generateContent({ contents: [{ role: "user", parts: parts }] });
        const response = await result.response;
        const text = response.text();
        
        // Parse JSON
        let jsonResponse;
        try {
            jsonResponse = JSON.parse(text);
        } catch (e) {
            // Fallback
            jsonResponse = {
                reply: text, 
                vibe_change: 0, 
                status: "continue"
            };
        }
        
        res.status(200).json(jsonResponse);

    } catch (error) {
        console.error("ERRO API:", error);
        // Retorna o erro detalhado para ajudar no debug (veja no Console do navegador)
        res.status(500).json({ 
            reply: "Interferência do Mundo Invertido... (Erro no Servidor)", 
            error_details: error.message 
        });
    }
}