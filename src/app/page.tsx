"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

interface ProcessedQuestion {
  id: string; // Generado en frontend para key
  original: string;
  corrected: string;
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ProcessedQuestion[]>([]);

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

      if (!res.ok) throw new Error("Error en la API");
      
      const data = await res.json();
      const newResults = data.result.map((item: any) => ({
        id: Math.random().toString(36).substring(7),
        original: item.original,
        corrected: item.corrected,
      }));

      setResults((prev) => [...newResults, ...prev]);
      setRawText(""); // Limpiar input después de procesar
    } catch (error) {
      alert("Hubo un error al procesar las preguntas. Revisa la consola.");
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

  const handleApprove = async (id: string) => {
    // Aquí implementaremos el Paso 4: Embedding y Guardado
    alert("Próximamente: Verificar duplicados e insertar en Firestore.");
  };

  const handleReject = (id: string) => {
    setResults(results.filter(r => r.id !== id));
  };

  return (
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
