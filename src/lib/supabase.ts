import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://fdnoudylvoyamsbwygdt.supabase.co";
const supabaseKey = "sb_publishable_Wz4Y-edWnLTubNlLJUw8jg_Nf5zv4kd";

export const supabase = createClient(supabaseUrl, supabaseKey);
