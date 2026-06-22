"use client";

import { useState } from "react";
import { PenLine, Loader2, Save, X } from "lucide-react";
import { doc, setDoc, serverTimestamp, getDocs, collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface ManualEntryFormProps {
  userUid: string;
  showModal: (title: string, message: React.ReactNode, type: "success" | "error" | "warning") => void;
}

const CATEGORY_MAP = {
  tl: { type: "truth", level: "leve" },
  tp: { type: "truth", level: "picante" },
  dl: { type: "dare", level: "leve" },
  dp: { type: "dare", level: "picante" },
};

export default function ManualEntryForm({ userUid, showModal }: ManualEntryFormProps) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<"tl" | "tp" | "dl" | "dp">("tl");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) {
      showModal("Error", "El texto de la pregunta no puede estar vacío.", "warning");
      return;
    }

    setIsSaving(true);
    try {
      // Get highest ID number for the category
      const q = query(collection(db, "questions"), orderBy("id", "desc"), limit(100)); // We sort of need all or a good way, actually just query by prefix
      const snapshot = await getDocs(collection(db, "questions"));
      
      let maxCatNumber = -1;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.id && data.id.startsWith(category + "_")) {
          const numPart = parseInt(data.id.split("_")[1]);
          if (!isNaN(numPart) && numPart > maxCatNumber) {
            maxCatNumber = numPart;
          }
        }
      });

      const newNumber = maxCatNumber === -1 ? 0 : maxCatNumber + 1;
      const newDocId = `${category}_${newNumber}`;
      const categoryData = CATEGORY_MAP[category];

      await setDoc(doc(db, "questions", newDocId), {
        id: newDocId,
        text: text.trim(),
        originalText: text.trim(), // Misma porque es manual
        type: categoryData.type,
        level: categoryData.level,
        embedding: [], // No AI embedding for manual entry to save costs, unless specifically requested
        createdAt: serverTimestamp(),
        createdBy: userUid,
      });

      showModal("¡Guardado Manual Exitoso!", "La pregunta se guardó en la base de datos sin usar cuota de IA.", "success");
      setText("");
    } catch (err: any) {
      showModal("Error", err.message || "Error al guardar manualmente.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-sky-500/10 rounded-full blur-3xl"></div>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-sky-500/10 rounded-xl text-sky-400">
            <PenLine className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Ingreso Rápido Manual</h2>
            <p className="text-sm text-slate-400">Agrega preguntas directamente sin pasar por validación de IA.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Categoría</label>
            <select 
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full bg-slate-950/80 border border-slate-700/60 rounded-xl p-3.5 text-slate-200 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-colors"
            >
              <option value="tl">Pregunta Leve (tl)</option>
              <option value="tp">Pregunta Picante (tp)</option>
              <option value="dl">Reto Leve (dl)</option>
              <option value="dp">Reto Picante (dp)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Texto</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-32 bg-slate-950/80 border border-slate-700/60 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 resize-none transition-all shadow-inner"
              placeholder="Escribe la pregunta o reto aquí..."
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving || !text.trim()}
              className="px-6 py-3 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-sky-500/25 transform transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</>
              ) : (
                <><Save className="w-5 h-5" /> Guardar en BD</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
