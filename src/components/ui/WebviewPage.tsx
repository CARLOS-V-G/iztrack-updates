import { useState, useRef, useEffect } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Globe, AlertTriangle } from "lucide-react";

interface WebviewPageProps {
  src: string;
  label: string;
}

export function WebviewPage({ src, label }: WebviewPageProps) {
  const wvRef = useRef<Electron.WebviewTag>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    const wv = wvRef.current;
    if (!wv) return;

    const onStop = () => {
      setLoading(false);
      setError(false);
      try {
        setCanGoBack(wv.canGoBack());
        setCanGoForward(wv.canGoForward());
      } catch {}
    };

    const onFail = () => {
      setLoading(false);
      setError(true);
    };

    wv.addEventListener("did-stop-loading", onStop);
    wv.addEventListener("did-fail-load", onFail);

    return () => {
      wv.removeEventListener("did-stop-loading", onStop);
      wv.removeEventListener("did-fail-load", onFail);
    };
  }, [src]);

  const goBack = () => {
    try { wvRef.current?.goBack(); } catch {}
  };

  const goForward = () => {
    try { wvRef.current?.goForward(); } catch {}
  };

  const reload = () => {
    setLoading(true);
    setError(false);
    try { wvRef.current?.reload(); } catch {}
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Nav bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white/95 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
            title="Atrás"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goForward}
            disabled={!canGoForward}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
            title="Adelante"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={reload}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all duration-200"
            title="Recargar"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-500 font-mono truncate">
          <Globe className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
          <span className="truncate">{src}</span>
        </div>
      </div>

      {/* Webview container */}
        <div className="flex-1 relative flex flex-col min-h-0">
          {/* Loading overlay */}
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg animate-bounce-in">
                <RotateCcw className="w-6 h-6 text-white animate-spin" />
              </div>
              <p className="text-sm text-slate-500 mt-4 animate-pulse-soft">Cargando {label}...</p>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-sm font-medium text-slate-700">No se pudo cargar {label}</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Verifica tu conexión a internet</p>
              <button
                type="button"
                onClick={reload}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200"
              >
                Reintentar
              </button>
            </div>
          )}

          <webview ref={wvRef} src={src} allowpopups style={{ width: "100%", height: "100%", border: "none" }} />
        </div>
    </div>
  );
}
