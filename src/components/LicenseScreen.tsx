import { useState } from "react";
import logo from "../assets/logo.png";
import { LicenseMessage } from "../components/ui/LicenseMessage";

type LicenseResponse = {
  ok: boolean;
  message: string;
  userId?: string;
  companyId?: string;
  branchId?: string;
};

function LicenseScreen() {
  const [email, setEmail] = useState("");
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  // 🔥 ESTADO MENSAJE PRO
  const [licenseStatus, setLicenseStatus] = useState<{
    message: string;
    type: "error" | "warning" | "success";
  } | null>(null);

  // 🚀 ACTIVAR LICENCIA
  const activar = async () => {
    setLoading(true);

    const res = (await window.api.validateLicense({
      email,
      key,
    })) as LicenseResponse;
    setLoading(false);

    if (res.ok) {
      setLicenseStatus({
        message: res.message,
        type: "success",
      });

      localStorage.setItem("email", email);
      localStorage.setItem("license", key);

      if (res.companyId) localStorage.setItem("companyId", res.companyId);
      if (res.branchId) localStorage.setItem("branchId", res.branchId);

      await window.api.saveLicense({ email, key });

      setTimeout(() => {
        location.reload();
      }, 1000);
    } else {
      let type: "error" | "warning" = "error";

      if (res.message.includes("dispositivo")) {
        type = "warning";
      }

      setLicenseStatus({
        message: res.message,
        type,
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white px-6">
      {/* 🔥 LOGO */}
      <img src={logo} className="w-24 mb-6 rounded-xl" />

      {/* 🧾 TÍTULO */}
      <h1 className="text-2xl font-bold mb-2">Activar izTrack</h1>
      <p className="text-slate-400 mb-6 text-sm text-center">
        Ingresá tu email y licencia para comenzar
      </p>

      {/* 📧 EMAIL */}
      <input
        className="w-full max-w-sm px-4 py-2 rounded bg-white text-black mb-3 outline-none"
        placeholder="Email"
        value={email}
        autoFocus
        onChange={(e) => setEmail(e.target.value)}
      />

      {/* 🔑 LICENCIA */}
      <input
        className="w-full max-w-sm px-4 py-2 rounded bg-white text-black mb-4 outline-none"
        placeholder="Licencia"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />

      {/* 🚀 BOTÓN */}
      <button
        onClick={activar}
        disabled={!email || !key || loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 px-4 py-2 rounded w-full max-w-sm transition"
      >
        {loading ? "Activando..." : "Activar"}
      </button>

      {/* 🔥 MENSAJE PRO */}
      {licenseStatus && (
        <div className="mt-4 w-full max-w-sm">
          <LicenseMessage
            message={licenseStatus.message}
            type={licenseStatus.type}
          />
        </div>
      )}

      {/* 📞 CONTACTO */}
      <div className="text-center text-sm text-slate-400 mt-6">
        ¿No tenés licencia?
        <br />
        <a
          href="mailto:cv5944341@gmail.com"
          className="text-blue-400 hover:underline"
        >
          cv5944341@gmail.com
        </a>
        <br />
        <a
          href="https://wa.me/5491168912994"
          target="_blank"
          className="text-green-400 hover:underline"
        >
          WhatsApp +54 9 11 6891-2994
        </a>
      </div>
    </div>
  );
}

export default LicenseScreen;
