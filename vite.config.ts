import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter(),
    tanstackStart({
      server: { entry: "server" },
    }),
    tailwind(),
    react(),
  ],
  // Enable tsconfig path resolution natively in Vite
  resolve: { tsconfigPaths: true },
});
