"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs, startAfter, deleteDoc, doc, updateDoc, where, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Database, Edit2, Trash2, ChevronLeft, ChevronRight, Loader2, CheckCircle2, X, LayoutGrid, List, Filter, Search, Download } from "lucide-react";

interface QuestionData {
  _docId: string;
  id: string;
  text: string;
  type: string;
  level: string;
  createdAt: any;
}

export default function DataTable({ showModal }: { showModal: any }) {
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [pageHistory, setPageHistory] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  
  const [viewMode, setViewMode] = useState<"table" | "grid">("grid");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "tl" | "tp" | "dl" | "dp">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [counts, setCounts] = useState({ total: 0, tl: 0, tp: 0, dl: 0, dp: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ text: "", type: "", level: "" });

  const pageSize = 20;

  const fetchQuestions = async (startAfterDoc?: any, filter: string = categoryFilter) => {
    setLoading(true);
    try {
      let q;
      
      if (filter === "all") {
        q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(pageSize));
        if (startAfterDoc) {
          q = query(collection(db, "questions"), orderBy("createdAt", "desc"), startAfter(startAfterDoc), limit(pageSize));
        }
      } else {
        q = query(
          collection(db, "questions"), 
          where("__name__", ">=", filter + "_"), 
          where("__name__", "<=", filter + "_\uf8ff"),
          orderBy("__name__"),
          limit(pageSize)
        );
        if (startAfterDoc) {
          q = query(
            collection(db, "questions"), 
            where("__name__", ">=", filter + "_"), 
            where("__name__", "<=", filter + "_\uf8ff"),
            orderBy("__name__"),
            startAfter(startAfterDoc),
            limit(pageSize)
          );
        }
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({
        _docId: doc.id,
        id: doc.data().id,
        text: doc.data().text,
        type: doc.data().type,
        level: doc.data().level,
        createdAt: doc.data().createdAt
      }));

      setQuestions(docs);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    } catch (error) {
      console.error(error);
      showModal("Error", "No se pudieron cargar los datos. Intenta de nuevo.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    setPageHistory([]);
    fetchQuestions(null, categoryFilter);
  }, [categoryFilter]);

  const fetchCounts = async () => {
    try {
      const qAll = query(collection(db, "questions"));
      const snapAll = await getCountFromServer(qAll);
      
      const cats = ['tl', 'tp', 'dl', 'dp'];
      const results = await Promise.all(cats.map(async (cat) => {
        const q = query(collection(db, "questions"), where("__name__", ">=", cat + "_"), where("__name__", "<=", cat + "_\uf8ff"));
        const snap = await getCountFromServer(q);
        return { cat, count: snap.data().count };
      }));
      
      setCounts({
        total: snapAll.data().count,
        tl: results.find(r => r.cat === 'tl')?.count || 0,
        tp: results.find(r => r.cat === 'tp')?.count || 0,
        dl: results.find(r => r.cat === 'dl')?.count || 0,
        dp: results.find(r => r.cat === 'dp')?.count || 0,
      });
    } catch (e) {
      console.error("Error fetching counts", e);
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  // Asegurar que en móviles siempre se use "grid"
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode("grid");
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNextPage = () => {
    if (!lastVisible) return;
    setPageHistory([...pageHistory, questions[0]]); 
    setPage(p => p + 1);
    fetchQuestions(lastVisible, categoryFilter);
  };

  const handlePrevPage = () => {
    if (page === 0) return;
    const prevFirstDoc = pageHistory[pageHistory.length - 2];
    setPageHistory(prev => prev.slice(0, -1));
    setPage(p => p - 1);
    fetchQuestions(prevFirstDoc, categoryFilter); 
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("¿Seguro que quieres eliminar este elemento de forma permanente?")) return;
    try {
      await deleteDoc(doc(db, "questions", docId));
      setQuestions(questions.filter(q => q._docId !== docId));
      // Actualizar conteos después de eliminar
      fetchCounts();
    } catch (e) {
      showModal("Error", "No se pudo eliminar", "error");
    }
  };

  const startEdit = (q: QuestionData) => {
    setEditingId(q._docId);
    setEditForm({ text: q.text, type: q.type, level: q.level });
  };

  const saveEdit = async (docId: string) => {
    try {
      await updateDoc(doc(db, "questions", docId), {
        text: editForm.text,
        type: editForm.type,
        level: editForm.level
      });
      setQuestions(questions.map(q => q._docId === docId ? { ...q, ...editForm } : q));
      setEditingId(null);
    } catch (e) {
      showModal("Error", "No se pudo actualizar", "error");
    }
  };

  // Filtrado local por búsqueda
  const filteredQuestions = questions.filter(q => 
    q.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
    q.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-4 sm:p-8 shadow-2xl flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header y Controles */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 hidden sm:block">
            <Database className="w-6 h-6" />
          </div>
          <div className="flex-grow">
            <h2 className="text-lg sm:text-xl font-bold text-white">Revisión de Base de Datos</h2>
            <p className="text-xs sm:text-sm text-slate-400">Lee, edita y filtra preguntas.</p>
          </div>
        </div>

        {/* Tarjetas de Estadísticas */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 w-full lg:w-auto">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-2 flex flex-col items-center justify-center">
            <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Total</span>
            <span className="text-base sm:text-xl font-bold text-white">{loadingCounts ? '...' : counts.total}</span>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2 flex flex-col items-center justify-center">
            <span className="text-[10px] sm:text-xs text-green-400 text-center uppercase tracking-wider">Verdad L.</span>
            <span className="text-base sm:text-xl font-bold text-green-300">{loadingCounts ? '...' : counts.tl}</span>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2 flex flex-col items-center justify-center">
            <span className="text-[10px] sm:text-xs text-red-400 text-center uppercase tracking-wider">Verdad P.</span>
            <span className="text-base sm:text-xl font-bold text-red-300">{loadingCounts ? '...' : counts.tp}</span>
          </div>
          <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-2 flex flex-col items-center justify-center">
            <span className="text-[10px] sm:text-xs text-sky-400 text-center uppercase tracking-wider">Reto L.</span>
            <span className="text-base sm:text-xl font-bold text-sky-300">{loadingCounts ? '...' : counts.dl}</span>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-2 flex flex-col items-center justify-center">
            <span className="text-[10px] sm:text-xs text-orange-400 text-center uppercase tracking-wider">Reto P.</span>
            <span className="text-base sm:text-xl font-bold text-orange-300">{loadingCounts ? '...' : counts.dp}</span>
          </div>
        </div>

      </div>

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full justify-between">
          {/* Botón de Exportar */}
          <a
            href={`/api/export-db?category=${categoryFilter}`}
            download={`verdad_o_reto_db${categoryFilter !== 'all' ? `_${categoryFilter}` : ''}.json`}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-xl border border-slate-700/60 transition-colors whitespace-nowrap"
            title="Descargar base de datos"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar JSON</span>
          </a>

          {/* Buscador Local */}
          <div className="relative flex-grow sm:flex-grow-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Buscar en esta página..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-700/60 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />
          </div>

          {/* Filtro de Categoría */}
          <div className="flex items-center justify-between sm:justify-start bg-slate-950/80 border border-slate-700/60 rounded-xl p-1">
            <div className="flex items-center">
              <Filter className="w-4 h-4 text-slate-400 ml-2 mr-1" />
              <select 
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="bg-transparent text-slate-200 text-sm focus:outline-none p-1.5 sm:p-2 cursor-pointer w-full sm:w-auto"
              >
                <option value="all">Todas las Categorías</option>
                <option value="tl">Verdad Leve (tl)</option>
                <option value="tp">Verdad Picante (tp)</option>
                <option value="dl">Reto Leve (dl)</option>
                <option value="dp">Reto Picante (dp)</option>
              </select>
            </div>

            {/* Toggle de Vista (Oculto en móviles) */}
            <div className="hidden md:flex items-center ml-2 border-l border-slate-700/60 pl-2">
              <button 
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-emerald-500/20 text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}
                title="Vista de Tarjetas"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "table" ? "bg-emerald-500/20 text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}
                title="Vista de Tabla"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenedor Principal */}
      <div className={`flex-grow relative ${viewMode === "table" ? "bg-slate-950/50 rounded-2xl border border-slate-800/80 overflow-hidden shadow-inner" : ""}`}>
        {loading && (
          <div className="absolute inset-0 z-10 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center rounded-2xl">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        )}

        {filteredQuestions.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Database className="w-12 h-12 mb-4 opacity-20" />
            <p>{searchTerm ? "No hay coincidencias para tu búsqueda." : "No hay preguntas en esta categoría."}</p>
          </div>
        )}

        {/* Vista GRID / TARJETAS */}
        {viewMode === "grid" && !loading && filteredQuestions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredQuestions.map((q) => (
              <div key={q._docId} className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-5 flex flex-col gap-4 shadow-lg transition-all group">
                <div className="flex justify-between items-start">
                  <span className="font-mono text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded-md">{q.id || "ID-Auto"}</span>
                  <div className="flex gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${q.type === 'truth' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                      {q.type}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${q.level === 'leve' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {q.level}
                    </span>
                  </div>
                </div>

                {editingId === q._docId ? (
                  <div className="flex flex-col gap-3 flex-grow">
                    <textarea 
                      value={editForm.text} 
                      onChange={e => setEditForm({...editForm, text: e.target.value})} 
                      className="w-full h-full min-h-[6rem] bg-slate-900 border border-emerald-500/50 rounded-xl p-3 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none text-base sm:text-lg"
                    />
                    <div className="flex gap-2">
                      <select value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs flex-1 text-slate-300">
                        <option value="truth">Verdad</option>
                        <option value="dare">Reto</option>
                      </select>
                      <select value={editForm.level} onChange={e => setEditForm({...editForm, level: e.target.value})} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs flex-1 text-slate-300">
                        <option value="leve">Leve</option>
                        <option value="picante">Picante</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="flex-grow flex items-center justify-center text-center p-2">
                    <p className="text-lg sm:text-xl font-medium text-slate-200 leading-snug">
                      "{q.text}"
                    </p>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-800/50 flex justify-end gap-2">
                  {editingId === q._docId ? (
                    <>
                      <button onClick={() => setEditingId(null)} className="flex-1 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"><X className="w-4 h-4"/> Cancelar</button>
                      <button onClick={() => saveEdit(q._docId)} className="flex-1 py-2 sm:py-2.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium text-sm"><CheckCircle2 className="w-4 h-4"/> Guardar</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(q)} className="p-3 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-colors"><Edit2 className="w-5 h-5"/></button>
                      <button onClick={() => handleDelete(q._docId)} className="p-3 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"><Trash2 className="w-5 h-5"/></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vista TABLA (Solo en PC) */}
        {viewMode === "table" && filteredQuestions.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-900/80 text-slate-400 sticky top-0 border-b border-slate-800/80">
                <tr>
                  <th className="px-6 py-4 font-semibold">ID</th>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Nivel</th>
                  <th className="px-6 py-4 font-semibold w-1/2">Texto</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredQuestions.map((q) => (
                  <tr key={q._docId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{q.id || "ID-Auto"}</td>
                    {editingId === q._docId ? (
                      <>
                        <td className="px-6 py-4">
                          <select value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})} className="bg-slate-900 border border-slate-700 rounded p-1 text-xs">
                            <option value="truth">truth</option>
                            <option value="dare">dare</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <select value={editForm.level} onChange={e => setEditForm({...editForm, level: e.target.value})} className="bg-slate-900 border border-slate-700 rounded p-1 text-xs">
                            <option value="leve">leve</option>
                            <option value="picante">picante</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <textarea value={editForm.text} onChange={e => setEditForm({...editForm, text: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm focus:border-emerald-500 outline-none" rows={2}/>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => saveEdit(q._docId)} className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30"><CheckCircle2 className="w-4 h-4"/></button>
                            <button onClick={() => setEditingId(null)} className="p-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700"><X className="w-4 h-4"/></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${q.type === 'truth' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                            {q.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${q.level === 'leve' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            {q.level}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-300 font-medium">{q.text}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => startEdit(q)} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>
                            <button onClick={() => handleDelete(q._docId)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
        <span className="text-sm text-slate-500 font-medium">Página {page + 1} • {filteredQuestions.length} visibles</span>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={handlePrevPage} disabled={page === 0} className="flex-1 sm:flex-none px-5 py-3 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-colors font-medium">
            <ChevronLeft className="w-4 h-4"/> Anterior
          </button>
          <button onClick={handleNextPage} disabled={questions.length < pageSize} className="flex-1 sm:flex-none px-5 py-3 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-colors font-medium">
            Siguiente <ChevronRight className="w-4 h-4"/>
          </button>
        </div>
      </div>
    </div>
  );
}
