import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import stringSimilarity from 'string-similarity';

// Caché global en memoria RAM del contenedor Node.js (Vercel)
let globalCache: {
  texts: { [category: string]: string[] };
  timestamp: number;
} = { texts: {}, timestamp: 0 };

const CACHE_TTL = 1000 * 60 * 5; // 5 minutos

export async function POST(req: Request) {
  try {
    const { text, category } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Texto inválido.' }, { status: 400 });
    }

    const catKey = category || 'all';
    const now = Date.now();

    // Verificamos si la caché está expirada o vacía para esa categoría
    if (now - globalCache.timestamp > CACHE_TTL || !globalCache.texts[catKey] || globalCache.texts[catKey].length === 0) {
      let q;
      
      // Si envían categoría, filtramos por las 1000 más recientes/relevantes de esa categoría
      if (category) {
        q = query(
          collection(db, "questions"), 
          where("__name__", ">=", category + "_"), 
          where("__name__", "<=", category + "_\\uf8ff"),
          orderBy("__name__"),
          limit(1000)
        );
      } else {
        // Fallback si no hay categoría (obtiene 1000 globales)
        q = query(
          collection(db, "questions"),
          orderBy("createdAt", "desc"),
          limit(1000)
        );
      }
      
      const snapshot = await getDocs(q);
      const texts = snapshot.docs.map(doc => doc.data().text || "");
      
      // Actualizamos la caché
      globalCache.texts[catKey] = texts.filter(t => t.length > 0);
      globalCache.timestamp = now;
    }

    const validTexts = globalCache.texts[catKey] || [];
    let highestSimilarity = 0;
    let duplicateText = "";

    if (validTexts.length > 0) {
      const matches = stringSimilarity.findBestMatch(text.trim(), validTexts);
      highestSimilarity = matches.bestMatch.rating;
      duplicateText = matches.bestMatch.target;
    }

    return NextResponse.json({
      highestSimilarity,
      duplicateText,
      maxCatNumber: -1 // Obsoleto, pero se mantiene por compatibilidad
    });

  } catch (error: any) {
    console.error("Similarity check error:", error);
    return NextResponse.json({ error: error.message || 'Error checking similarity' }, { status: 500 });
  }
}
