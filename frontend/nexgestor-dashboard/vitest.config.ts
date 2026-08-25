import path from "node:path"
import { defineConfig } from "vitest/config"

// Espelha o alias "~*" do vite.config.ts, pra que os testes importem
// "~lib/..." / "~components/..." igual ao resto do app.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false
  },
  resolve: {
    alias: [
      { find: /^~assets\/(.*)\.(png|jpg|jpeg|svg|gif)$/, replacement: path.resolve(__dirname, "src/test/__mocks__/asset.ts") },
      { find: /^~(.*)$/, replacement: path.resolve(__dirname, "src/$1") }
    ]
  }
})
