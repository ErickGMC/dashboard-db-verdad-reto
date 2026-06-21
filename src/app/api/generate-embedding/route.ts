import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Texto inválido para embedding' }, { status: 400 });
    }

    let vector;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        const response = await ai.models.embedContent({
          model: 'gemini-embedding-2',
          contents: text,
        });
        vector = response.embeddings?.[0]?.values;
        if (vector) break;
      } catch (err: any) {
        lastError = err;
        retries--;
        if (retries === 0) break;
        // Esperar 1 segundo antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!vector) {
      throw lastError || new Error("No se pudo generar el vector");
    }

    return NextResponse.json({ embedding: vector });

  } catch (error: any) {
    console.error('Error generando embedding:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
