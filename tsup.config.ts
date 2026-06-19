import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/models.ts", "src/tokenizer.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  dts: false,
});
