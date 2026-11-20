// Run: node scripts/gen-theme-css.ts   (regenerates src/theme/tokens.css from src/theme/themes.ts)
import { writeFileSync } from "node:fs";
import { themeCss } from "../src/theme/themes.ts";

writeFileSync(new URL("../src/theme/tokens.css", import.meta.url), themeCss());
console.log("wrote src/theme/tokens.css");
