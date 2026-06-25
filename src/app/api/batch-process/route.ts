import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { GoogleGenAI } from '@google/genai';
import * as admin from 'firebase-admin';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Inicializar Admin SDK si no está inicializado (necesario para batch.set desde servidor)
if (!admin.apps.length) {
  try {
    // Si tienes variables de entorno de Firebase Admin en tu proyecto
    // Vercel usará esto. De lo contrario, usará las credenciales por defecto.
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } catch (e) {
    console.error("Firebase admin init error:", e);
  }
}

interface CachedQuestion {
  text: string;
  embedding: number[];
}

let globalCache: {
  questions: { [category: string]: CachedQuestion[] };
  timestamp: number;
} = { questions: {}, timestamp: 0 };

const CACHE_TTL = 1000 * 60 * 5;

function cosineSimilarity(v1: number[], v2: number[]) {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const CATEGORY_MAP = {
  tl: { type: "truth", level: "leve" },
  tp: { type: "truth", level: "picante" },
  dl: { type: "dare", level: "leve" },
  dp: { type: "dare", level: "picante" },
};

export async function POST(req: Request) {
  try {
    const { lines, category, userUid } = await req.json();

    if (!Array.isArray(lines) || lines.length === 0 || !category || !userUid) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const catKey = category;
    const now = Date.now();

    // 1. Cargar caché (misma lógica que check-similarity)
    if (now - globalCache.timestamp > CACHE_TTL || !globalCache.questions[catKey] || globalCache.questions[catKey].length === 0) {
      const q = query(
        collection(db, "questions"), 
        where("__name__", ">=", category + "_"), 
        where("__name__", "<=", category + "_\\uf8ff"),
        orderBy("__name__"),
        limit(1500)
      );
      
      const snapshot = await getDocs(q);
      const cachedData: CachedQuestion[] = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.text && data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
          cachedData.push({ text: data.text, embedding: data.embedding });
        }
      });
      
      globalCache.questions[catKey] = cachedData;
      globalCache.timestamp = now;
    }

    const validQuestions = globalCache.questions[catKey] || [];
    
    // 2. Generar Embeddings en Paralelo usando Promise.all y límite de concurrencia
    const embeddingsMap: { [text: string]: number[] } = {};
    
    const chunkArray = (arr: any[], size: number) => 
      Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

    const chunks = chunkArray(lines, 10);
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (text) => {
        try {
          const response = await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: text,
          });
          const emb = response.embeddings?.[0]?.values;
          if (emb) embeddingsMap[text] = emb;
        } catch (e) {
          console.error("Error embedding text:", text, e);
        }
      }));
      // Pausa entre chunks
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
    }

    // 3. Filtrar Duplicados
    const toSave: { text: string, embedding: number[] }[] = [];
    let skippedCount = 0;
    const skippedExamples: string[] = [];
    const localSavedVects: number[] = [];

    for (const text of lines) {
      const emb = embeddingsMap[text];
      if (!emb) {
        skippedCount++;
        continue;
      }

      let isDuplicate = false;
      
      // Checar contra BD
      for (const q of validQuestions) {
        if (cosineSimilarity(emb, q.embedding) > 0.85) {
          isDuplicate = true;
          break;
        }
      }

      // Checar contra las que acabamos de agregar a toSave en este lote
      if (!isDuplicate) {
        for (const localVect of localSavedVects) {
          if (cosineSimilarity(emb, localVect) > 0.85) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (isDuplicate) {
        skippedCount++;
        if (skippedExamples.length < 3) skippedExamples.push(text);
      } else {
        toSave.push({ text, embedding: emb });
        localSavedVects.push(emb);
      }
    }

    // 4. Guardar en Firestore usando Admin SDK
    let savedCount = 0;
    if (toSave.length > 0) {
      const firestore = admin.firestore();
      let batch = firestore.batch();
      let opCount = 0;
      
      const categoryData = CATEGORY_MAP[category as keyof typeof CATEGORY_MAP];

      for (const item of toSave) {
        const secureId = `${category}_${firestore.collection('questions').doc().id}`;
        const docRef = firestore.collection('questions').doc(secureId);
        
        batch.set(docRef, {
          id: secureId,
          text: item.text,
          originalText: item.text,
          type: categoryData.type,
          level: categoryData.level,
          embedding: item.embedding,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: userUid,
        });

        savedCount++;
        opCount++;

        if (opCount >= 450) {
          await batch.commit();
          batch = firestore.batch();
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      // Actualizar caché
      globalCache.questions[catKey] = [...validQuestions, ...toSave];
    }

    return NextResponse.json({
      savedCount,
      skippedCount,
      skippedExamples
    });

  } catch (error: any) {
    console.error("Batch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
