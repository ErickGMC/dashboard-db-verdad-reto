"use client";

import { useState, ReactNode } from "react";
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Save } from "lucide-react";
import { collection, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface ProcessedQuestion {
  id: string;
  original: string;
  corrected: string;
  category: "tl" | "tp" | "dl" | "dp";
}

interface AIEntryFormProps {
  userUid: string;
  showModal: (title: string, message: ReactNode, type: "success" | "error" | "warning" | "confirm", extraProps?: any) => void;
  closeModal: () => void;
}

const CATEGORY_MAP = {
  tl: { type: "truth", level: "leve" },
  tp: { type: "truth", level: "picante" },
  dl: { type: "dare", level: "leve" },
  dp: { type: "dare", level: "picante" },
};

export default function AIEntryForm({ userUid, showModal, closeModal }: AIEntryFormProps) {
  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessedQuestion[]>([]);

  const handleProcess = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    
    try {
      const res = await fetch("/api/process-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const errStr = typeof errData?.error === 'object' ? JSON.stringify(errData.error) : String(errData?.error || "");
        if (errStr.includes('429') || errStr.includes('quota') || errStr.includes('límite')) {
          throw new Error("Límite de velocidad de IA superado. Espera un instante.");
        }
        throw new Error(errStr || "Fallo en la comunicación con el servidor");
      }
      
      const data = await res.json();
      const newResults: ProcessedQuestion[] = data.result.map((item: any) => ({
        id: Math.random().toString(36).substring(7),
        original: item.original,
        corrected: item.corrected,
        category: item.category || "tl",
      }));

      setResults((prev) => [...newResults, ...prev]);
      setRawText("");
    } catch (error: any) {
      showModal("Error al Procesar", error.message || "Error al procesar con IA.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const proceedToSave = async (id: string, itemToApprove: ProcessedQuestion) => {
    try {
      setIsSavingId(id);
      const catPrefix = itemToApprove.category;
      const categoryData = CATEGORY_MAP[itemToApprove.category as keyof typeof CATEGORY_MAP];

      // O(1) Save con ID Aleatorio + Prefijo para filtros
      const tempRef = doc(collection(db, "questions"));
      const newDocId = `${catPrefix}_${tempRef.id}`;

      await setDoc(doc(db, "questions", newDocId), {
        id: newDocId,
        text: itemToApprove.corrected,
        originalText: itemToApprove.original,
        type: categoryData.type,
        level: categoryData.level,
        embedding: [], // Ya no generamos embeddings costosos
        createdAt: serverTimestamp(),
        createdBy: userUid,
      });

      showModal("¡Idea Guardada!", "La pregunta fue guardada con éxito al instante.", "success");
      setResults(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      showModal("Error al Guardar", err.message, "error");
    } finally {
      setIsSavingId(null);
    }
  };

  const handleApprove = async (id: string) => {
    const itemToApprove = results.find(r => r.id === id);
    if (!itemToApprove) return;

    setIsSavingId(id);

    try {
      // O(1) Exact Similarity Check (Evita timeouts de base de datos completa)
      const simRes = await fetch("/api/check-similarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: itemToApprove.corrected })
      });
      
      if (!simRes.ok) throw new Error("Error comprobando similitud en BD");
      const { highestSimilarity, duplicateText } = await simRes.json();

      setIsSavingId(null);

      if (highestSimilarity > 0.99) { // Coincidencia exacta
        showModal(
          "Pregunta Descartada Automáticamente", 
          (
            <div className="flex flex-col gap-3">
              <p className="text-slate-300">Se detectó que esta pregunta exacta ya existe en la base de datos.</p>
              <div className="bg-slate-950 border border-red-500/30 p-3 rounded-lg mt-2">
                <p className="text-xs text-red-500 uppercase font-bold mb-1">Existente:</p>
                <p className="text-slate-200 italic">"{duplicateText}"</p>
              </div>
            </div>
          ), "error"
        );
        setResults(prev => prev.filter(r => r.id !== id));
      } else {
        // Al no usar embeddings, siempre será 0 si no es exacta.
        proceedToSave(id, itemToApprove);
      }
    } catch (err: any) {
      setIsSavingId(null);
      showModal("Error al Guardar", err.message || "Ocurrió un error inesperado al guardar.", "error");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="lg:col-span-4 bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col h-fit relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl"></div>
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Ingreso Asistido por IA
        </h2>
        <p className="text-sm text-slate-400 mb-5 leading-relaxed">
          Pega múltiples preguntas separadas por saltos de línea. La IA corregirá ortografía, mejorará la redacción y las clasificará automáticamente.
        </p>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          className="w-full h-48 sm:h-64 bg-slate-950/60 border border-slate-700/50 rounded-2xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none mb-5 text-sm transition-all shadow-inner"
          placeholder="Ejemplo:&#10;cuentanos un secretito tuyo&#10;toca la nariz de alguien"
        />
        <button
          onClick={handleProcess}
          disabled={isProcessing || !rawText.trim()}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-2xl shadow-lg shadow-purple-500/25 transform transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Procesando...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> Mejorar con IA
            </span>
          )}
        </button>
      </div>

      <div className="lg:col-span-8">
        {results.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-slate-900/30 border border-slate-800/50 rounded-3xl border-dashed p-8 text-center backdrop-blur-sm">
            <Sparkles className="w-12 h-12 text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-slate-300">Esperando preguntas...</h3>
            <p className="text-slate-500 text-sm max-w-sm mt-2">
              Las preguntas procesadas aparecerán aquí para tu revisión antes de guardarlas.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {results.map((item) => (
              <div key={item.id} className={`bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-5 shadow-xl flex flex-col gap-5 transition-all ${isSavingId === item.id ? 'opacity-50 pointer-events-none scale-[0.98]' : 'hover:border-slate-700/80 hover:shadow-purple-500/5'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-500"></span> Original
                      </label>
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-slate-400 text-sm italic min-h-[4rem]">
                        "{item.original}"
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-sky-400"></span> Categoría a Guardar
                      </label>
                      <select 
                        value={item.category}
                        onChange={(e) => setResults(results.map(r => r.id === item.id ? { ...r, category: e.target.value as any } : r))}
                        className="w-full bg-slate-950/80 border border-slate-700/60 rounded-xl p-3 text-slate-200 text-sm focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-colors cursor-pointer"
                      >
                        <option value="tl">Pregunta Leve (tl)</option>
                        <option value="tp">Pregunta Picante (tp)</option>
                        <option value="dl">Reto Leve (dl)</option>
                        <option value="dp">Reto Picante (dp)</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span> Corregido por IA (Editable)
                    </label>
                    <textarea 
                      className="w-full flex-grow bg-slate-950/60 border border-purple-500/30 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none min-h-[8rem]"
                      value={item.corrected}
                      onChange={(e) => setResults(results.map(r => r.id === item.id ? { ...r, corrected: e.target.value } : r))}
                    />
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-800/60 mt-2">
                  <button 
                    onClick={() => setResults(results.filter(r => r.id !== item.id))}
                    className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors border border-transparent hover:border-red-400/20 flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Descartar
                  </button>
                  <button 
                    onClick={() => handleApprove(item.id)}
                    disabled={isSavingId === item.id}
                    className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {isSavingId === item.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Aprobar y Guardar</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
