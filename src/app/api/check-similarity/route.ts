import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import stringSimilarity from 'string-similarity';

export async function POST(req: Request) {
  try {
    const { text, category } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Texto inválido.' }, { status: 400 });
    }

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
    
    let highestSimilarity = 0;
    let duplicateText = "";

    if (!snapshot.empty) {
      const texts = snapshot.docs.map(doc => doc.data().text || "");
      const validTexts = texts.filter(t => t.length > 0);
      
      if (validTexts.length > 0) {
        const matches = stringSimilarity.findBestMatch(text.trim(), validTexts);
        highestSimilarity = matches.bestMatch.rating;
        duplicateText = matches.bestMatch.target;
      }
    }

    return NextResponse.json({
      highestSimilarity,
      duplicateText,
      maxCatNumber: -1 // Obsoleto, pero se mantiene por compatibilidad si no borramos TODO en el frontend a la vez
    });

  } catch (error: any) {
    console.error("Similarity check error:", error);
    return NextResponse.json({ error: error.message || 'Error checking similarity' }, { status: 500 });
  }
}
