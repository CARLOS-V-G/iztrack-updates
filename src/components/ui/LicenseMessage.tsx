import { XCircle, ShieldAlert, CheckCircle } from "lucide-react";

type Props = {
  message: string;
  type: "error" | "warning" | "success";
};

export function LicenseMessage({ message, type }: Props) {
  const styles = {
    error: {
      bg: "bg-red-100",
      text: "text-red-600",
      icon: <XCircle className="w-5 h-5" />,
    },
    warning: {
      bg: "bg-yellow-100",
      text: "text-yellow-600",
      icon: <ShieldAlert className="w-5 h-5" />,
    },
    success: {
      bg: "bg-green-100",
      text: "text-green-600",
      icon: <CheckCircle className="w-5 h-5" />,
    },
  };

  const style = styles[type];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg ${style.bg} ${style.text}`}
    >
      {style.icon}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
