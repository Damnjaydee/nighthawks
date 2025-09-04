/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Cormorant", "Georgia", "serif"],
      },
      colors: {
        bg: "#0b0b0b",
        ink: "#ffffff",
        gold: "#c4a15a",
      },
    },
  },
  plugins: [],
};
