import { useState } from "react";

type Props = {
  onSuccess: () => void;
};

function AdminLogin({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!password) return;

    setLoading(true);

    try {
      const ok = await window.api.loginAdmin(password);

      if (ok) {
        setError("");
        onSuccess();
      } else {
        setError("Contraseña incorrecta");
      }
    } catch (err) {
      console.log(err);
      setError("Error al iniciar sesión");
    }

    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") login();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white px-4">
      {/* 🔥 LOGO */}
      <img src="./logo.ico" alt="izTrack" className="w-20 mb-6 opacity-90" />

      {/* 🔥 CARD */}
      <div className="bg-slate-800 p-6 rounded-2xl shadow-xl w-80">
        <h2 className="text-lg font-semibold mb-4 text-center">Acceso Admin</h2>

        <input
          type="password"
          placeholder="Contraseña"
          className="w-full px-3 py-2 rounded bg-white text-black mb-2 outline-none focus:ring-2 focus:ring-blue-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKey}
        />

        {/* ERROR */}
        {error && (
          <p className="text-red-400 text-sm mb-3 text-center">{error}</p>
        )}

        <button
          onClick={login}
          disabled={!password || loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 py-2 rounded transition"
        >
          {loading ? "Verificando..." : "Ingresar"}
        </button>
      </div>

      {/* 🔥 FOOTER */}
      <p className="text-xs text-slate-500 mt-6">
        Panel administrativo • izTrack
      </p>
    </div>
  );
}

export default AdminLogin;
