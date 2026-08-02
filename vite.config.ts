import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tanstackRouter(),
    tanstackStart({
      server: { entry: "server" },
    }),
    nitro({
      // Defaults to Vercel (your current production deploy). Set NITRO_PRESET=cloudflare_module
      // in your build environment to build for Cloudflare Workers instead.
      preset: (process.env.NITRO_PRESET as "vercel" | "cloudflare_module" | undefined) || "vercel",
      compatibilityDate: "2024-09-19",
      cloudflare: { deployConfig: true, nodeCompat: true },
    }),
    tailwind(),
    react(),
  ],
  resolve: { tsconfigPaths: true },
});