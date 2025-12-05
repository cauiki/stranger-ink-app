import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Configuração CORS (Permite o site falar com a API)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Responde rápido para requisições de verificação (OPTIONS)
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Apenas aceita POST (envio de dados)
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // Verificação crítica da chave
    if (!apiKey) {
        console.error("ERRO CRÍTICO: Variável GEMINI_API_KEY não encontrada no ambiente.");
        return res.status(500).json({ 
            reply: "ERRO DE CONFIGURAÇÃO: Chave de API não encontrada no painel da Vercel. Por favor, configure a variável GEMINI_API_KEY.", 
            vibe_change: 0, 
            status: "continue" 
        });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const { message, characterPrompt, history, image } = req.body;

    const systemPrompt = `
      ${characterPrompt}
      
      CONTEXTO: Jogo de vendas pelo WhatsApp.
      REGRAS:
      1. Responda curto (máx 2 frases). Use gírias do personagem.
      2. Avalie a resposta do usuário com [VIBE: +X] ou [VIBE: -X].
      3. Se fechar venda use status "won", se perder use "lost".
      
      FORMATO JSON OBRIGATÓRIO:
      { "reply": "texto da resposta", "vibe_change": 0, "status": "continue" }
    `;

    const parts = [{ text: systemPrompt }];

    // Adiciona histórico se existir
    if (history && Array.isArray(history)) {
        history.slice(-6).forEach(h => {
             if(h.parts && h.parts[0] && h.parts[0].text) {
                parts.push({ text: `[${h.role}]: ${h.parts[0].text}` });
             }
        });
    }

    parts.push({ text: `[Usuário]: ${message}` });

    if (image) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: image }});
        parts.push({ text: "(Imagem enviada)" });
    }

    const result = await model.generateContent({ contents: [{ role: "user", parts: parts }] });
    const response = await result.response;
    const text = response.text();
    
    // Limpeza para garantir JSON válido
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const jsonResponse = JSON.parse(jsonStr);
        res.status(200).json(jsonResponse);
    } catch (e) {
        console.error("IA não mandou JSON válido:", text);
        // Fallback: se a IA mandar texto puro, a gente empacota como JSON
        res.status(200).json({
            reply: text,
            vibe_change: 0,
            status: "continue"
        });
    }

  } catch (error) {
    console.error("Erro na API do Google:", error);
    res.status(500).json({ 
        reply: `Erro técnico: ${error.message}`, 
        vibe_change: 0, 
        status: "continue" 
    });
  }
}