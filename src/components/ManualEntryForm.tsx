"use client";

import { useState } from "react";
import { PenLine, Loader2, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
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
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) {
      showModal("Error", "El texto no puede estar vacío.", "warning");
      return;
    }

    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return;

    setIsSaving(true);

    try {
      const res = await fetch("/api/batch-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, category, userUid }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error en el procesamiento por lote");

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);

      const summaryMsg = (
        <div className="text-sm space-y-2">
          <p>Se guardaron <span className="text-emerald-400 font-bold">{data.savedCount}</span> preguntas exitosamente.</p>
          {data.skippedCount > 0 && (
            <>
              <p className="text-orange-400">Se omitieron <span className="font-bold">{data.skippedCount}</span> por ser muy similares a las existentes.</p>
              {data.skippedExamples?.length > 0 && (
                <div className="bg-slate-950 p-2 rounded border border-orange-500/20 text-xs italic text-slate-400">
                  Ej: "{data.skippedExamples[0]}"...
                </div>
              )}
            </>
          )}
        </div>
      );

      if (data.savedCount > 0) {
        showModal("¡Proceso Completado!", summaryMsg, "success");
        setText(""); // Limpiar text area tras éxito
      } else {
        showModal("Sin Cambios", "No se guardó ninguna pregunta nueva (todas eran duplicadas).", "warning");
      }
      
    } catch (err: any) {
      showModal("Error", err.message || "Error al guardar manualmente.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400">
          <PenLine className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Ingreso Masivo Manual</h2>
          <p className="text-sm text-slate-400">Agrega decenas de preguntas rápido sin IA.</p>
        </div>
      </div>

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex gap-3 text-orange-400 text-sm mb-6">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <p><strong>Atención:</strong> Puedes pegar múltiples preguntas (una por línea). No se corregirá la ortografía ni redacción automáticamente, y todas se guardarán en la categoría seleccionada.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Categoría a Guardar</label>
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
          <label className="block text-sm font-medium text-slate-300 mb-2">Preguntas o Retos (Uno por línea)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ej:&#10;¿Alguna vez has...?&#10;Tienes que...&#10;Dile un secreto a..."
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none min-h-[160px]"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving || saveSuccess || !text.trim()}
          className={`w-full flex items-center justify-center gap-2 py-4 px-6 font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
            saveSuccess 
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50" 
              : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-500/25 border border-transparent"
          }`}
        >
          {isSaving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Procesando Lote...</>
          ) : saveSuccess ? (
            <><CheckCircle2 className="w-5 h-5" /> ¡Guardado con Éxito!</>
          ) : (
            <><Save className="w-5 h-5" /> Guardar Permanentemente</>
          )}
        </button>
      </div>
    </div>
  );
}
