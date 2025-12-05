import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Permite que o site converse com este servidor (CORS)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Verifica se a chave existe no cofre da Vercel
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ 
        reply: "ERRO CRÍTICO: Chave de API não configurada no painel da Vercel.", 
        vibe_change: 0, 
        status: "continue" 
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
      { "reply": "texto", "vibe_change": 0, "status": "continue" }
    `;

    const parts = [{ text: systemPrompt }];

    // Histórico
    if (history && history.length) {
        history.slice(-6).forEach(h => {
             // Proteção contra histórico vazio
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
    
    // Limpeza para garantir JSON
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const jsonResponse = JSON.parse(jsonStr);
        res.status(200).json(jsonResponse);
    } catch (e) {
        // Se a IA não mandar JSON, usa o texto puro como resposta
        console.error("IA não mandou JSON:", text);
        res.status(200).json({
            reply: text,
            vibe_change: 0,
            status: "continue"
        });
    }

  } catch (error) {
    console.error("Erro API:", error);
    res.status(500).json({ 
        reply: `Erro técnico: ${error.message}`, 
        vibe_change: 0, 
        status: "continue" 
    });
  }
}