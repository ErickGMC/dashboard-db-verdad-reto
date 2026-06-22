import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Eres un editor experto y guionista de juegos de "Verdad o Reto".
Tu objetivo es tomar preguntas o retos crudos, corregir su ortografía y gramática, y mejorar su semántica para que suenen más naturales, divertidas y coherentes para un juego casual de fiesta.
Además, debes CLASIFICAR la pregunta en una de las siguientes categorías exactas:
- "tl": Verdad Leve (preguntas personales suaves, curiosidades, anécdotas divertidas).
- "tp": Verdad Picante (preguntas íntimas, sexuales, secretos oscuros, romances intensos).
- "dl": Reto Leve (acciones físicas sencillas, bromas inocentes, pruebas de habilidad).
- "dp": Reto Picante (acciones subidas de tono, contacto físico atrevido, retos muy vergonzosos).

Devuelve el resultado ESTRICTAMENTE en formato JSON. El JSON debe contener una única propiedad llamada "result" que sea un array de objetos. 
Cada objeto debe tener esta estructura exacta:
{
  "original": "La pregunta original",
  "corrected": "La pregunta corregida y mejorada",
  "category": "código de categoría (tl, tp, dl, o dp)"
}

No cambies completamente la idea principal, solo haz que suene mejor. No agregues texto adicional fuera del JSON.`;

export async function POST(req: Request) {
  let responseText = "";
  let retries = 3;
  let lastError: any;

  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Por favor envía texto válido.' }, { status: 400 });
    }

    // Dividimos por saltos de línea para pasarlas limpias
    const questions = text.split('\n').map((q: string) => q.trim()).filter(Boolean);

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No hay preguntas válidas en el texto.' }, { status: 400 });
    }

    const prompt = `Corrige y mejora las siguientes preguntas de Verdad o Reto:\n\n${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`;

    while (retries > 0) {
      try {
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ],
          model: "llama-3.1-8b-instant",
          temperature: 0.6,
          response_format: { type: "json_object" },
        });

        const content = chatCompletion.choices[0]?.message?.content;
        if (content) {
          responseText = content;
          break;
        }
      } catch (err: any) {
        lastError = err;
        retries--;
        if (retries === 0) break;
        // Esperar 1 segundo antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!responseText) {
       throw lastError || new Error('Groq devolvió una respuesta vacía después de varios reintentos');
    }

    const parsedData = JSON.parse(responseText);

    // Groq a veces devuelve el JSON directamente o dentro de un wrapper. Validamos:
    let finalResult = [];
    if (parsedData.result && Array.isArray(parsedData.result)) {
      finalResult = parsedData.result;
    } else if (Array.isArray(parsedData)) {
      finalResult = parsedData;
    } else {
      throw new Error("El modelo de IA no devolvió el formato esperado.");
    }

    return NextResponse.json({ result: finalResult });

  } catch (error: any) {
    let errorMessage = lastError?.message || error?.message || 'Error desconocido';
    const errorStr = String(errorMessage);

    // Traducción de errores técnicos a mensajes amigables
    if (errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('rate limit')) {
      errorMessage = 'Límite de velocidad de Groq superado. Por favor espera unos segundos.';
    } else if (errorStr.includes('fetch failed') || errorStr.includes('network')) {
      errorMessage = 'Corte de conexión con los servidores de IA. Inténtalo de nuevo.';
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
