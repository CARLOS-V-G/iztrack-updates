import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface MpNotification {
  action?: string;
  type?: string;
  data?: { id: string };
  id?: number;
}

interface MpPaymentResponse {
  id: number;
  status: string;
  transaction_amount: number;
  payer?: { email?: string };
  payment_method_id?: string;
  date_created?: string;
}

async function fetchPaymentData(paymentId: string): Promise<MpPaymentResponse | null> {
  if (!mpAccessToken) {
    console.log("MP_ACCESS_TOKEN not configured, returning basic data");
    return {
      id: Number(paymentId),
      status: "approved",
      transaction_amount: 0,
      payment_method_id: "unknown",
    };
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    },
  );

  if (!response.ok) {
    console.error(`Error fetching payment ${paymentId}: ${response.status}`);
    return null;
  }

  return response.json();
}

Deno.serve(async (req) => {
  try {
    const body = await req.text();

    if (!body) {
      return new Response(JSON.stringify({ ok: false, error: "Empty body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let notification: MpNotification;
    try {
      notification = JSON.parse(body);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const paymentId = notification.data?.id
      ? String(notification.data.id)
      : notification.id
        ? String(notification.id)
        : null;

    if (!paymentId) {
      console.error("No payment ID in notification");
      return new Response(JSON.stringify({ ok: false, error: "No payment ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const paymentData = await fetchPaymentData(paymentId);

    const amount = paymentData?.transaction_amount ?? 0;
    const status = paymentData?.status ?? "approved";
    const payerEmail = paymentData?.payer?.email ?? "";
    const paymentMethod = paymentData?.payment_method_id ?? "unknown";

    const { error } = await supabase.from("mp_payments").upsert(
      {
        payment_id: paymentId,
        amount: amount,
        status: status,
        payer_email: payerEmail,
        payment_method: paymentMethod,
        raw_data: paymentData || { id: notification.data?.id || notification.id },
      },
      { onConflict: "payment_id", ignoreDuplicates: false },
    );

    if (error) {
      console.error("Error inserting payment:", error.message);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Payment ${paymentId} saved (amount: ${amount}, status: ${status})`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
