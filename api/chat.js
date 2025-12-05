import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    // Configuração para aceitar conexões do App
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { message, characterPrompt, history, image } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const systemPrompt = `
        ${characterPrompt}
        CENÁRIO: WhatsApp. Jogo de vendas.
        REGRAS: Responda curto (máx 2 frases). Avalie a resposta do usuário: [VIBE: +X] ou [VIBE: -X].
        STATUS: Se fechar venda use "won", se perder use "lost".
        FORMATO JSON: { "reply": "texto", "vibe_change": 0, "status": "continue" }
        `;

        const parts = [{ text: systemPrompt }];
        
        if(history) history.slice(-6).forEach(h => parts.push({ text: `[${h.role}]: ${h.parts[0].text}` }));
        parts.push({ text: `[Usuário]: ${message}` });
        
        if (image) parts.push({ inlineData: { mimeType: "image/jpeg", data: image } });

        const result = await model.generateContent({ contents: [{ role: "user", parts: parts }] });
        const text = result.response.text().replace(/```json|```/g, '').trim();
        
        res.status(200).json(JSON.parse(text));
    } catch (error) {
        console.error(error);
        res.status(500).json({ reply: "Erro de conexão.", vibe_change: 0, status: "continue" });
    }
}