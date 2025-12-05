import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Permite acesso de qualquer lugar (CORS)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("ERRO: Chave GEMINI_API_KEY não encontrada nas variáveis de ambiente.");
        throw new Error("Chave de API não configurada no Painel da Vercel.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ATUALIZAÇÃO: Usando um modelo mais estável se o flash der erro, ou garantindo a versão correta
    // Tente 'gemini-pro' se o flash continuar dando erro, mas o flash deve funcionar com a lib atualizada.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const { message, characterPrompt, history, image } = req.body;

    const systemPrompt = `
    ${characterPrompt}
    
    CONTEXTO: Jogo de vendas via WhatsApp.
    OBJETIVO: Responder como o personagem.
    
    REGRAS:
    1. Responda curto (máx 2 frases). Use gírias se o personagem usar.
    2. Avalie a resposta do usuário com [VIBE: +X] ou [VIBE: -X].
    3. Se a mensagem for "INICIO", apenas dê um "Oi" ou comece a conversa como o personagem faria.
    4. Retorne APENAS JSON válido.

    FORMATO JSON:
    {
      "reply": "Sua resposta...",
      "vibe_change": 0,
      "status": "continue"
    }
    `;

    const parts = [{ text: systemPrompt }];
    
    // Proteção contra histórico mal formatado
    if (history && Array.isArray(history)) {
        history.slice(-6).forEach(h => {
            if (h && h.parts && h.parts[0] && h.parts[0].text) {
                parts.push({ text: `[${h.role}]: ${h.parts[0].text}` });
            }
        });
    }

    parts.push({ text: `[Vendedora]: ${message}` });

    if (image) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
        parts.push({ text: "(Imagem enviada)" });
    }

    const result = await model.generateContent({ contents: [{ role: "user", parts: parts }] });
    const response = await result.response;
    const text = response.text();
    
    // Limpeza agressiva para garantir JSON válido
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let jsonResponse;
    try {
        jsonResponse = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Erro ao fazer parse do JSON da IA:", text);
        // Fallback se a IA não retornar JSON válido
        jsonResponse = {
            reply: jsonStr, // Usa o texto puro como resposta
            vibe_change: 0,
            status: "continue"
        };
    }
    
    res.status(200).json(jsonResponse);

  } catch (error) {
    console.error("Erro API:", error);
    res.status(500).json({ 
        reply: `Erro técnico no servidor: ${error.message}`, 
        vibe_change: 0, 
        status: "continue" 
    });
  }
}