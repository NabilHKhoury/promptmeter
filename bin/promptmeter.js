#!/usr/bin/env node
// Thin launcher: the real CLI is the built ESM bundle. Dynamic import keeps the
// shebang here and lets `dist/index.js` run main() as a side effect.
import("../dist/index.js");
