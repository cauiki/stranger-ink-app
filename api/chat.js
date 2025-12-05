import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configurações de Segurança (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // 2. Responder ao "ping" do navegador
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // 3. Só aceita POST
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        // 4. Verifica a Chave na Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("ERRO FATAL: Chave GEMINI_API_KEY não encontrada nas variáveis de ambiente.");
            throw new Error("Chave de API não configurada no Painel da Vercel.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const { message, characterPrompt, history, image } = req.body;

        // 5. Prompt Robusto
        const systemPrompt = `
        ${characterPrompt}
        CONTEXTO: Você é um personagem em um jogo de vendas via WhatsApp.
        REGRAS: Responda curto (máximo 2 frases).
        AVALIE: [VIBE: +X] ou [VIBE: -X].
        STATUS: "won" (venda feita), "lost" (desistência), "continue".
        FORMATO JSON: {"reply": "texto", "vibe_change": 0, "status": "continue"}
        `;

        const parts = [{ text: systemPrompt }];

        // Adiciona histórico se existir
        if (history && Array.isArray(history)) {
            history.slice(-6).forEach(h => {
                if (h && h.parts && h.parts[0]) {
                    parts.push({ text: `[${h.role}]: ${h.parts[0].text}` });
                }
            });
        }

        parts.push({ text: `[Usuário]: ${message}` });

        if (image) {
            parts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
            parts.push({ text: "(O usuário enviou uma imagem)" });
        }

        const result = await model.generateContent({ contents: [{ role: "user", parts: parts }] });
        const responseText = result.response.text();

        // 6. Limpeza do JSON (A parte crítica)
        const jsonStr = responseText.replace(/```json|```/g, '').trim();
        let jsonResponse;
        
        try {
            jsonResponse = JSON.parse(jsonStr);
        } catch (e) {
            // Se a IA falhar em mandar JSON, improvisamos para não quebrar o jogo
            jsonResponse = {
                reply: jsonStr, // Usa o texto puro como resposta
                vibe_change: 0,
                status: "continue"
            };
        }

        res.status(200).json(jsonResponse);

    } catch (error) {
        console.error("Erro na API:", error);
        // Retorna o erro real para você ler no chat
        res.status(500).json({ 
            reply: `ERRO DO SISTEMA: ${error.message}`, 
            vibe_change: 0, 
            status: "continue" 
        });
    }
}