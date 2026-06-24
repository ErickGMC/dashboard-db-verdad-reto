import { NextResponse } from 'next/server';
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    let q;
    let filename = "verdad_o_reto_db.json";
    
    if (category && category !== 'all') {
      q = query(
        collection(db, "questions"),
        where("__name__", ">=", category + "_"), 
        where("__name__", "<=", category + "_\\uf8ff"),
        orderBy("__name__", "desc")
      );
      filename = `verdad_o_reto_db_${category}.json`;
    } else {
      q = query(
        collection(db, "questions"),
        orderBy("createdAt", "desc")
      );
    }
    
    const snapshot = await getDocs(q);
    
    const questions = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        _docId: doc.id,
        id: data.id || null,
        text: data.text || "",
        type: data.type || "",
        level: data.level || "",
        createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : null,
      };
    });

    return NextResponse.json(
      { questions, count: questions.length },
      {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error: any) {
    console.error("Error exporting database:", error);
    return NextResponse.json({ error: error.message || 'Error exporting database' }, { status: 500 });
  }
}
