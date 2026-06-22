import { NextResponse } from 'next/server';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Note: this runs in Node server context, it uses the client SDK but it's ok for basic reads.

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(req: Request) {
  try {
    const { embedding, category } = await req.json();

    if (!embedding || !Array.isArray(embedding)) {
      return NextResponse.json({ error: 'Embedding inválido.' }, { status: 400 });
    }

    const catPrefix = category || "tl";
    
    // Instead of downloading EVERYTHING, we query by prefix if possible. But in Firestore we can't easily query by ID prefix unless we do >= and <=.
    // However, if we must do global similarity, we fetch all. It's safer to do this on the server than on the client.
    const snapshot = await getDocs(collection(db, "questions"));
    
    let highestSimilarity = 0;
    let duplicateText = "";
    let maxCatNumber = -1;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      if (data.embedding && Array.isArray(data.embedding)) {
        const similarity = cosineSimilarity(embedding, data.embedding);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          duplicateText = data.text;
        }
      }
      
      if (data.id && data.id.startsWith(catPrefix + "_")) {
        const numPart = parseInt(data.id.split("_")[1]);
        if (!isNaN(numPart) && numPart > maxCatNumber) {
          maxCatNumber = numPart;
        }
      }
    });

    return NextResponse.json({
      highestSimilarity,
      duplicateText,
      maxCatNumber
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error checking similarity' }, { status: 500 });
  }
}
