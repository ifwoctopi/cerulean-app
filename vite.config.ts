import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Only these .env names are ever exposed to the browser (plus anything starting VITE_).
// Secret keys (SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL) are NOT listed, so they stay private.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ["VITE_", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 8765, strictPort: true },
});
