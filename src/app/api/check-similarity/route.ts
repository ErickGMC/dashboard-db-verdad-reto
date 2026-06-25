import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface CachedQuestion {
  text: string;
  embedding: number[];
}

// Caché global en memoria RAM del contenedor Node.js (Vercel)
let globalCache: {
  questions: { [category: string]: CachedQuestion[] };
  timestamp: number;
} = { questions: {}, timestamp: 0 };

const CACHE_TTL = 1000 * 60 * 5; // 5 minutos

function cosineSimilarity(v1: number[], v2: number[]) {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(req: Request) {
  try {
    const { text, category } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Texto inválido.' }, { status: 400 });
    }

    const catKey = category || 'all';
    const now = Date.now();

    // Verificamos si la caché está expirada o vacía para esa categoría
    if (now - globalCache.timestamp > CACHE_TTL || !globalCache.questions[catKey] || globalCache.questions[catKey].length === 0) {
      let q;
      
      // Si envían categoría, filtramos por las 1500 más recientes/relevantes de esa categoría
      if (category) {
        q = query(
          collection(db, "questions"), 
          where("__name__", ">=", category + "_"), 
          where("__name__", "<=", category + "_\\uf8ff"),
          orderBy("__name__"),
          limit(1500)
        );
      } else {
        // Fallback si no hay categoría (obtiene globales)
        q = query(
          collection(db, "questions"),
          orderBy("createdAt", "desc"),
          limit(1500)
        );
      }
      
      const snapshot = await getDocs(q);
      const cachedData: CachedQuestion[] = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.text && data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
          cachedData.push({ text: data.text, embedding: data.embedding });
        }
      });
      
      // Actualizamos la caché
      globalCache.questions[catKey] = cachedData;
      globalCache.timestamp = now;
    }

    const validQuestions = globalCache.questions[catKey] || [];
    let highestSimilarity = 0;
    let duplicateText = "";
    let embedding: number[] = [];

    // Generamos embedding de la nueva frase
    let retries = 3;
    while (retries > 0) {
      try {
        const response = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: text,
        });
        embedding = response.embeddings?.[0]?.values || [];
        if (embedding.length > 0) break;
      } catch (err) {
        retries--;
        if (retries === 0) throw new Error("Fallo al generar embedding en Gemini");
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (validQuestions.length > 0 && embedding.length > 0) {
      for (const q of validQuestions) {
        const sim = cosineSimilarity(embedding, q.embedding);
        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          duplicateText = q.text;
        }
      }
    }

    return NextResponse.json({
      highestSimilarity,
      duplicateText,
      embedding
    });

  } catch (error: any) {
    console.error("Similarity check error:", error);
    return NextResponse.json({ error: error.message || 'Error checking similarity' }, { status: 500 });
  }
}
