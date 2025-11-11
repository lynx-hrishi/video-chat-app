import path from "path";

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    path.resolve(__dirname, "src/**/*.{js,jsx,ts,tsx}"),
  ],
  theme: { extend: {} },
  plugins: [],
};
