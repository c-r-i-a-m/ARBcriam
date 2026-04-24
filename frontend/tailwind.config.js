module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#FAFAFA",
        panel: "#F7F7FF",
        panelBorder: "#D9D5EA",
        panelHover: "#EFEDFF",
        purple: {
          dim:    "#E8E4FF",
          soft:   "#7C4FF5",
          mid:    "#27187E",
          vivid:  "#321F2C",
          glow:   "#9D6FFF",
          bright: "#27187E",
        },
        accent: {
          cyan:   "#00d4ff",
          green:  "#008F5A",
          red:    "#D7264B",
          orange: "#ff7b2f",
          yellow: "#B88A00",
        },
        text: {
          primary:   "#321F2C",
          secondary: "#4F4664",
          muted:     "#756C86",
          dim:       "#AAA3BA",
        },
      },
      fontFamily: {
        display: ["'Orbitron'", "sans-serif"],
        mono:    ["'JetBrains Mono'", "monospace"],
        body:    ["'DM Sans'", "sans-serif"],
      },
      boxShadow: {
        "glow-purple": "0 12px 28px rgba(39,24,126,0.18), 0 0 26px rgba(124,79,245,0.12)",
        "glow-sm":     "0 8px 18px rgba(39,24,126,0.16)",
        "glow-cyan":   "0 0 16px rgba(0,212,255,0.24)",
        "glow-red":    "0 8px 18px rgba(215,38,75,0.18)",
        "panel":       "0 14px 36px rgba(50,31,44,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flicker":    "flicker 2s ease-in-out infinite",
        "scan":       "scan 4s linear infinite",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
        scan: {
          "0%":   { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 100%" },
        },
      },
    },
  },
  plugins: [],
};
