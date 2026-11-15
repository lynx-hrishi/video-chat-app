import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    path.resolve(__dirname, "src/**/*.{js,jsx,ts,tsx}"),
  ],
  theme: { extend: {} },
  plugins: [],
};
