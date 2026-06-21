import { GoogleGenAI, Type, Schema } from '@google/genai';
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `Eres un editor experto y guionista de juegos de "Verdad o Reto".
Tu objetivo es tomar preguntas o retos crudos, corregir su ortografía y gramática, y mejorar su semántica para que suenen más naturales, divertidas y coherentes para un juego casual de fiesta.
Además, debes CLASIFICAR la pregunta en una de las siguientes categorías exactas:
- "tl": Verdad Leve (preguntas personales suaves, curiosidades, anécdotas divertidas).
- "tp": Verdad Picante (preguntas íntimas, sexuales, secretos oscuros, romances intensos).
- "dl": Reto Leve (acciones físicas sencillas, bromas inocentes, pruebas de habilidad).
- "dp": Reto Picante (acciones subidas de tono, contacto físico atrevido, retos muy vergonzosos).

Devuelve el resultado estrictamente en el formato JSON solicitado.
No cambies completamente la idea principal, solo haz que suene mejor.`;

const responseSchema: Schema = {
  type: Type.ARRAY,
  description: "Lista de preguntas originales y sus correcciones.",
  items: {
    type: Type.OBJECT,
    properties: {
      original: {
        type: Type.STRING,
        description: "La pregunta o reto original tal como la escribió el usuario.",
      },
      corrected: {
        type: Type.STRING,
        description: "La pregunta o reto corregido, mejorado gramatical y semánticamente.",
      },
      category: {
        type: Type.STRING,
        description: "El código exacto de la categoría ('tl', 'tp', 'dl' o 'dp').",
      },
    },
    required: ["original", "corrected", "category"],
  },
};

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Por favor envía texto válido.' }, { status: 400 });
    }

    // Dividimos por saltos de línea para pasarlas limpias
    const questions = text.split('\n').map((q) => q.trim()).filter(Boolean);

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No hay preguntas válidas en el texto.' }, { status: 400 });
    }

    const prompt = `Corrige y mejora las siguientes preguntas de Verdad o Reto:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    let response;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          }
        });
        if (response && response.text) break;
      } catch (err: any) {
        lastError = err;
        retries--;
        if (retries === 0) break;
        // Esperar 1.5 segundos antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    if (!response || !response.text) {
       throw lastError || new Error('Gemini devolvió una respuesta vacía después de varios reintentos');
    }

    const resultText = response.text;

    const parsedResult = JSON.parse(resultText);

    return NextResponse.json({ result: parsedResult });

  } catch (error: any) {
    console.error('Error procesando preguntas:', error);
    return NextResponse.json({ error: error.message || 'Error interno en el servidor.' }, { status: 500 });
  }
}
