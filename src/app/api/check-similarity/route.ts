import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Texto inválido.' }, { status: 400 });
    }

    // O(1) query! Instead of downloading all documents to check vectors, we check exact string matches.
    const q = query(
      collection(db, "questions"), 
      where("text", "==", text.trim()),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    
    let highestSimilarity = 0;
    let duplicateText = "";

    if (!snapshot.empty) {
      highestSimilarity = 1.0; // 100% exact match
      duplicateText = snapshot.docs[0].data().text;
    }

    return NextResponse.json({
      highestSimilarity,
      duplicateText,
      maxCatNumber: -1 // Obsoleto, pero se mantiene por compatibilidad si no borramos TODO en el frontend a la vez
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error checking similarity' }, { status: 500 });
  }
}
