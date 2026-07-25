import path from "node:path"
import { defineConfig } from "vitest/config"

// Espelha o alias "~*" do tsconfig.json (mesma convenção do Plasmo), pra que
// os testes importem "~lib/..." / "~components/..." igual ao resto do app.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    css: false
  },
  resolve: {
    alias: [
      // "~*" no tsconfig é fusão direta (~lib/x → ./lib/x, sem "/" entre o
      // til e o resto) — precisa de regex com backreference, um alias de
      // string simples ("~") só casa com prefixo seguido de "/".
      { find: /^~assets\/(.*)\.(png|jpg|jpeg|svg|gif)$/, replacement: path.resolve(__dirname, "test/__mocks__/asset.ts") },
      { find: /^~(.*)$/, replacement: path.resolve(__dirname, "$1") }
    ]
  }
})
