import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "data/**"] },
  ...tseslint.configs.recommended,
  // eslint-config-prettier MUST be last: it disables stylistic rules that
  // would conflict with Prettier.
  prettier,
);
