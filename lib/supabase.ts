import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const hasPlaceholderConfig =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes("your-project-ref") ||
  supabaseAnonKey.includes("your-supabase-anon-key");

export const supabase = hasPlaceholderConfig
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);
