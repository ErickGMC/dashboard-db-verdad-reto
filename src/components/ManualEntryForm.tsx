"use client";

import { useState } from "react";
import { PenLine, Loader2, Save } from "lucide-react";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
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
      // 1. Verificación O(1) en el servidor (en lugar de descargar miles de vectores)
      const simRes = await fetch("/api/check-similarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const simData = await simRes.json();
      
      if (simData.highestSimilarity > 0.99) { // Coincidencia exacta
        showModal(
          "Pregunta Duplicada",
          <div className="text-sm">
            <p>Esta pregunta ya existe en la base de datos exactamente igual.</p>
            <p className="mt-2 text-slate-300 italic">"{simData.duplicateText}"</p>
          </div>,
          "warning"
        );
        setIsSaving(false);
        return;
      }

      // 2. Guardado Rápido O(1) con ID Nativo Seguro
      const categoryData = CATEGORY_MAP[category];
      
      // Generamos un ID seguro de Firebase y le agregamos el prefijo para que funcionen los filtros
      const tempRef = doc(collection(db, "questions"));
      const secureId = `${category}_${tempRef.id}`;
      
      await setDoc(doc(db, "questions", secureId), {
        id: secureId,
        text: text.trim(),
        originalText: text.trim(),
        type: categoryData.type,
        level: categoryData.level,
        embedding: [], 
        createdAt: serverTimestamp(),
        createdBy: userUid,
      });

      showModal("¡Éxito!", `Pregunta manual guardada correctamente con ID: ${secureId}`, "success");
      setText(""); // Limpiar
      
    } catch (err: any) {
      showModal("Error", err.message || "Error al guardar manualmente.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400">
          <PenLine className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Ingreso Manual Ultra-rápido</h2>
          <p className="text-sm text-slate-400">Agrega preguntas sin gastar cuota de IA.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Categoría</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'tl', label: 'Verdad Leve', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
              { id: 'tp', label: 'Verdad Picante', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
              { id: 'dl', label: 'Reto Leve', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
              { id: 'dp', label: 'Reto Picante', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id as any)}
                className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                  category === cat.id 
                  ? cat.color + " ring-2 ring-purple-500/50 scale-[1.02]" 
                  : "bg-slate-950/50 text-slate-400 border-slate-800 hover:bg-slate-800"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Pregunta o Reto</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ej: ¿Alguna vez has...? / Tienes que..."
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none min-h-[120px]"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving || !text.trim()}
          className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</>
          ) : (
            <><Save className="w-5 h-5" /> Guardar Permanentemente</>
          )}
        </button>
      </div>
    </div>
  );
}
