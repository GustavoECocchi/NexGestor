import path from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Alias "~*" → "./src/*", mesma convenção do repo (extensão usa o mesmo
// padrão via Plasmo). "~style.css" e "~assets/logo.png" resolvem para
// "src/style.css" e "src/assets/logo.png".
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^~(.*)$/, replacement: path.resolve(import.meta.dirname, "src/$1") }]
  }
})
