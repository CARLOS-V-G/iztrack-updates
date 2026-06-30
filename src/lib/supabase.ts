import { createClient } from "@supabase/supabase-js";

// En dev (npm run dev): usa VITE_SUPABASE_URL del .env → local Docker
// En prod build (npm run build): usa VITE_SUPABASE_URL del .env.production → remoto
const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    "https://fdnoudylvoyamsbwygdt.supabase.co";

const supabaseKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "sb_publishable_Wz4Y-edWnLTubNlLJUw8jg_Nf5zv4kd";

export const supabase = createClient(supabaseUrl, supabaseKey);
