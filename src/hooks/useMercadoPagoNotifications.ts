import { useCallback, useEffect, useRef, useState } from "react";

type MpNotification = {
  payment: MpPayment;
  timestamp: number;
};

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
  }
}

export function useMercadoPagoNotifications() {
  const [latestPayment, setLatestPayment] = useState<MpPayment | null>(null);
  const [notifications, setNotifications] = useState<MpNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const latestRef = useRef<MpPayment | null>(null);

  const addNotification = useCallback((payment: MpPayment) => {
    latestRef.current = payment;
    setLatestPayment(payment);
    setNotifications((prev) =>
      [{ payment, timestamp: Date.now() }, ...prev].slice(0, 20),
    );
    setUnreadCount((c) => c + 1);
    playNotificationSound();
  }, []);

  useEffect(() => {
    const unsub = window.api.onMpPayment((payment) => {
      addNotification(payment);
    });
    return unsub;
  }, [addNotification]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const dismissLatest = useCallback(() => {
    setLatestPayment(null);
  }, []);

  return {
    latestPayment,
    notifications,
    unreadCount,
    markAllRead,
    dismissLatest,
  };
}
