"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { collection, serverTimestamp, getDocs, doc, setDoc } from "firebase/firestore";

interface ProcessedQuestion {
  id: string; // Generado en frontend para key
  original: string;
  corrected: string;
  category: "tl" | "tp" | "dl" | "dp";
}

interface ModalState {
  isOpen: boolean;
  title: string;
  message: string;
  type: "success" | "error" | "warning" | "confirm";
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

const CATEGORY_MAP = {
  tl: { type: "truth", level: "leve" },
  tp: { type: "truth", level: "picante" },
  dl: { type: "dare", level: "leve" },
  dp: { type: "dare", level: "picante" },
};

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessedQuestion[]>([]);
  
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const showModal = (title: string, message: string, type: "success" | "error" | "warning" | "confirm", extraProps?: Partial<ModalState>) => {
    setModal({ isOpen: true, title, message, type, ...extraProps });
  };

  const closeModal = () => {
    setModal(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Cargando...</div>;
  }

  const handleProcess = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    
    try {
      const res = await fetch("/api/process-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });

      if (!res.ok) throw new Error("Error en la API de procesamiento");
      
      const data = await res.json();
      const newResults: ProcessedQuestion[] = data.result.map((item: any) => ({
        id: Math.random().toString(36).substring(7),
        original: item.original,
        corrected: item.corrected,
        category: item.category || "tl", // Usar la categoría inferida por la IA
      }));

      setResults((prev) => [...newResults, ...prev]);
      setRawText(""); // Limpiar input después de procesar
    } catch (error: any) {
      showModal("Error al Procesar", error.message || "Hubo un error al procesar las preguntas con la IA.", "error");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleUpdateCorrected = (id: string, newText: string) => {
    setResults(results.map(r => r.id === id ? { ...r, corrected: newText } : r));
  };

  const handleCategoryChange = (id: string, newCategory: "tl" | "tp" | "dl" | "dp") => {
    setResults(results.map(r => r.id === id ? { ...r, category: newCategory } : r));
  };

  const proceedToSave = async (id: string, itemToApprove: ProcessedQuestion, embedding: number[], maxCatNumber: number) => {
    try {
      setIsSavingId(id);
      const catPrefix = itemToApprove.category;
      const newNumber = maxCatNumber === -1 ? 0 : maxCatNumber + 1;
      const newDocId = `${catPrefix}_${newNumber}`;
      const categoryData = CATEGORY_MAP[itemToApprove.category];

      await setDoc(doc(db, "questions", newDocId), {
        id: newDocId,
        text: itemToApprove.corrected,
        originalText: itemToApprove.original,
        type: categoryData.type,
        level: categoryData.level,
        embedding: embedding,
        createdAt: serverTimestamp(),
        createdBy: user?.uid,
      });

      showModal("¡Idea Guardada!", "La pregunta fue guardada con éxito en Firestore.", "success");
      setResults(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      console.error(err);
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
      // 1. Generar Embedding
      const embRes = await fetch("/api/generate-embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: itemToApprove.corrected }),
      });
      
      if (!embRes.ok) {
        const errData = await embRes.json();
        throw new Error(errData.error || "Error generando embedding en servidor");
      }
      
      const { embedding } = await embRes.json();

      // 2. Búsqueda Vectorial (Calculada localmente)
      const snapshot = await getDocs(collection(db, "questions"));
      
      let highestSimilarity = 0;
      let duplicateText = "";
      let maxCatNumber = -1;
      const catPrefix = itemToApprove.category;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // Revisar similitud
        if (data.embedding && Array.isArray(data.embedding)) {
          const similarity = cosineSimilarity(embedding, data.embedding);
          if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            duplicateText = data.text;
          }
        }
        
        // Revisar max ID
        if (data.id && data.id.startsWith(catPrefix + "_")) {
          const numPart = parseInt(data.id.split("_")[1]);
          if (!isNaN(numPart) && numPart > maxCatNumber) {
            maxCatNumber = numPart;
          }
        }
      });

      setIsSavingId(null); // Detener el spinner para mostrar el modal

      if (highestSimilarity > 0.90) {
        // Mayor al 90%: Eliminar automáticamente
        showModal(
          "Idea Descartada Automáticamente", 
          `Se eliminó automáticamente por tener una similitud del ${(highestSimilarity * 100).toFixed(1)}% (supera el 90%).\n\nPregunta existente:\n"${duplicateText}"`, 
          "error"
        );
        setResults(prev => prev.filter(r => r.id !== id));
        return; 
      } else {
        // Hasta 90%: Mostrar al usuario para que decida
        let similarityMsg = highestSimilarity > 0 
          ? `Similitud detectada: ${(highestSimilarity * 100).toFixed(1)}%.\nSe parece a: "${duplicateText}"`
          : `Es una idea completamente original (0% similitud).`;

        showModal(
          "Revisión de Similitud",
          `${similarityMsg}\n\n¿Qué deseas hacer con esta idea?`,
          "confirm",
          {
            confirmText: "Guardar",
            cancelText: "Eliminar",
            onConfirm: () => {
              closeModal();
              proceedToSave(id, itemToApprove, embedding, maxCatNumber);
            },
            onCancel: () => {
              setResults(prev => prev.filter(r => r.id !== id));
              closeModal();
            }
          }
        );
      }
    } catch (err: any) {
      console.error(err);
      setIsSavingId(null);
      showModal("Error al Guardar", err.message, "error");
    }
  };

  const cosineSimilarity = (vecA: number[], vecB: number[]) => {
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
  };

  const handleReject = (id: string) => {
    setResults(results.filter(r => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6 lg:p-8 font-sans">
      
      {/* Modal Custom */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200">
            <div className={`h-2 w-full ${
              modal.type === 'success' ? 'bg-emerald-500' : 
              modal.type === 'error' ? 'bg-red-500' : 'bg-amber-500'
            }`} />
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
                  modal.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 
                  modal.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                }`}>
                  {modal.type === 'success' ? '✅' : modal.type === 'error' ? '❌' : '⚠️'}
                </div>
                <h3 className="text-xl font-bold text-white">{modal.title}</h3>
              </div>
              <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                {modal.message}
              </p>
              <div className="mt-8 flex justify-end gap-3">
                {modal.type === 'confirm' ? (
                  <>
                    <button 
                      onClick={modal.onCancel || closeModal}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2 rounded-xl transition-colors font-medium border border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    >
                      {modal.cancelText || "Cancelar"}
                    </button>
                    <button 
                      onClick={modal.onConfirm || closeModal}
                      className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-6 py-2 rounded-xl transition-all font-medium border border-emerald-500/50 shadow-lg shadow-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {modal.confirmText || "Confirmar"}
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={closeModal}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-xl transition-colors font-medium border border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    Entendido
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center mb-6 sm:mb-10 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-lg gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 text-center sm:text-left">
          Panel IA: Verdad o Reto
        </h1>
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-slate-400 text-xs sm:text-sm truncate max-w-[150px] sm:max-w-none" title={user.email || ""}>
            {user.email}
          </span>
          <button 
            onClick={handleLogout}
            className="text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors border border-slate-700 whitespace-nowrap"
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* Columna Izquierda: Input */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col h-fit">
          <h2 className="text-lg font-semibold text-white mb-2">Ingreso de Preguntas</h2>
          <p className="text-sm text-slate-400 mb-5">
            Pega múltiples preguntas separadas por saltos de línea. La IA las corregirá y mejorará.
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full h-48 sm:h-64 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none mb-5 text-sm transition-all"
            placeholder="Ejemplo:&#10;cuentanos un secretito tuyo&#10;toca la nariz de alguien"
          />
          <button
            onClick={handleProcess}
            disabled={isProcessing || !rawText.trim()}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-2xl shadow-lg shadow-purple-500/25 transform transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <span className="animate-pulse flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Procesando con IA...
              </span>
            ) : (
              <span>✨ Mejorar con IA</span>
            )}
          </button>
        </div>

        {/* Columna Derecha: Tabla de Verificación */}
        <div className="lg:col-span-8">
          {results.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-slate-900/40 border border-slate-800/60 rounded-3xl border-dashed p-8 sm:p-12 text-center">
              <div className="text-5xl mb-5 opacity-80">🤖</div>
              <h3 className="text-lg font-medium text-slate-300">Esperando preguntas...</h3>
              <p className="text-slate-500 text-sm max-w-sm mt-2">
                Las preguntas procesadas aparecerán aquí para tu revisión manual.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {results.map((item) => (
                <div key={item.id} className={`bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-lg flex flex-col gap-5 transition-all ${isSavingId === item.id ? 'opacity-50 pointer-events-none scale-[0.98]' : 'hover:border-slate-700'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                    {/* Bloque Original */}
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-500"></span> Original
                        </label>
                        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 text-slate-400 text-sm italic min-h-[4rem]">
                          "{item.original}"
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-sky-400"></span> Categoría a Guardar
                        </label>
                        <select 
                          value={item.category}
                          onChange={(e) => handleCategoryChange(item.id, e.target.value as any)}
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-slate-200 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors cursor-pointer"
                        >
                          <option value="tl">Pregunta Leve (tl)</option>
                          <option value="tp">Pregunta Picante (tp)</option>
                          <option value="dl">Reto Leve (dl)</option>
                          <option value="dp">Reto Picante (dp)</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Bloque Corregido */}
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span> Corregido por IA (Editable)
                      </label>
                      <textarea 
                        className="w-full flex-grow bg-slate-950 border border-purple-500/30 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none min-h-[8rem] md:min-h-0"
                        value={item.corrected}
                        onChange={(e) => handleUpdateCorrected(item.id, e.target.value)}
                      />
                    </div>
                  </div>
                  
                  {/* Botonera */}
                  <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-800 mt-2">
                    <button 
                      onClick={() => handleReject(item.id)}
                      className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors border border-transparent hover:border-red-400/20"
                    >
                      Descartar
                    </button>
                    <button 
                      onClick={() => handleApprove(item.id)}
                      disabled={isSavingId === item.id}
                      className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:-translate-y-0.5 active:translate-y-0"
                    >
                      {isSavingId === item.id ? (
                        <svg className="animate-spin h-4 w-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      ) : (
                        <span>✅</span>
                      )}
                      {isSavingId === item.id ? "Guardando..." : "Aprobar y Guardar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

