"use client";

import { useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Sparkles, PenLine, Database, LogOut } from "lucide-react";

import AIEntryForm from "@/components/AIEntryForm";
import ManualEntryForm from "@/components/ManualEntryForm";
import DataTable from "@/components/DataTable";

interface ModalState {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  type: "success" | "error" | "warning" | "confirm";
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"ai" | "manual" | "db">("ai");
  
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const showModal = (title: string, message: ReactNode, type: "success" | "error" | "warning" | "confirm", extraProps?: Partial<ModalState>) => {
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-purple-400 font-medium">Iniciando Dashboard...</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => signOut(auth);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-purple-500/30">
      
      {/* Elementos de fondo decorativos */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]"></div>
      </div>

      {/* Modal Custom */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-3xl w-full max-w-md overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200">
            <div className={`h-1.5 w-full ${
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
              <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                {modal.message}
              </div>
              <div className="mt-8 flex justify-end gap-3">
                {modal.type === 'confirm' ? (
                  <>
                    <button onClick={modal.onCancel || closeModal} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2.5 rounded-xl transition-colors font-medium border border-slate-700 focus:ring-2 focus:ring-slate-500">
                      {modal.cancelText || "Cancelar"}
                    </button>
                    <button onClick={modal.onConfirm || closeModal} className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-emerald-500/20 focus:ring-2 focus:ring-emerald-500">
                      {modal.confirmText || "Confirmar"}
                    </button>
                  </>
                ) : (
                  <button onClick={closeModal} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl transition-colors font-medium border border-slate-700">
                    Entendido
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header & Navegación */}
      <div className="relative z-10 border-b border-slate-800/80 bg-slate-950/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center py-4 gap-4">
            <h1 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 tracking-tight">
              Verdad o Reto Admin
            </h1>
            <div className="flex items-center gap-4 bg-slate-900/50 p-1.5 rounded-full border border-slate-800/80">
              <span className="text-slate-400 text-xs sm:text-sm px-3 truncate max-w-[150px] sm:max-w-xs font-medium">
                {user.email}
              </span>
              <button onClick={handleLogout} className="flex items-center gap-2 text-xs sm:text-sm bg-slate-800 hover:bg-red-500/10 hover:text-red-400 text-slate-300 px-4 py-2 rounded-full transition-all border border-slate-700 hover:border-red-500/20">
                <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 sm:gap-6 mt-2 overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveTab("ai")} className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'ai' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}>
              <Sparkles className="w-4 h-4" /> Ingreso Mágico (IA)
            </button>
            <button onClick={() => setActiveTab("manual")} className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'manual' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}>
              <PenLine className="w-4 h-4" /> Ingreso Manual
            </button>
            <button onClick={() => setActiveTab("db")} className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'db' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}>
              <Database className="w-4 h-4" /> Base de Datos
            </button>
          </div>
        </div>
      </div>

      <main className="relative z-10 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === "ai" && <AIEntryForm userUid={user.uid} showModal={showModal} closeModal={closeModal} />}
        {activeTab === "manual" && <ManualEntryForm userUid={user.uid} showModal={showModal} />}
        {activeTab === "db" && <DataTable showModal={showModal} />}
      </main>
    </div>
  );
}
