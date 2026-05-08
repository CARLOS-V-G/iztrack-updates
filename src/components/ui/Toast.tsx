import { useEffect } from "react";

export function Toast({
  message,
  type = "success",
  onClose,
}: {
  message: string;
  type?: "success" | "error" | "warning";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "bg-green-600",
    error: "bg-red-600",
    warning: "bg-yellow-500",
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <div
        className={`px-4 py-3 rounded-xl text-white shadow-lg ${colors[type]}`}
      >
        {message}
      </div>
    </div>
  );
}
