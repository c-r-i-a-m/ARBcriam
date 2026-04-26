module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#111315",
        panel: "#171A1D",
        panelBorder: "#2A3035",
        panelHover: "#20252A",
        purple: {
          dim:    "#1C2126",
          soft:   "#55616C",
          mid:    "#6C7782",
          vivid:  "#CDD2D7",
          glow:   "#8D969E",
          bright: "#F3F0E8",
        },
        accent: {
          cyan:   "#7B8B94",
          green:  "#8E9B86",
          red:    "#B57B84",
          orange: "#BCA58D",
          yellow: "#B8A98A",
        },
        text: {
          primary:   "#F3F0E8",
          secondary: "#BCC0C4",
          muted:     "#8F9499",
          dim:       "#676D73",
        },
      },
      fontFamily: {
        display: ["'Orbitron'", "sans-serif"],
        mono:    ["'JetBrains Mono'", "monospace"],
        body:    ["'DM Sans'", "sans-serif"],
      },
      boxShadow: {
        "glow-purple": "0 14px 40px rgba(0,0,0,0.26), 0 0 18px rgba(141,150,158,0.08)",
        "glow-sm":     "0 10px 28px rgba(0,0,0,0.28)",
        "glow-cyan":   "0 0 16px rgba(123,139,148,0.18)",
        "glow-red":    "0 10px 24px rgba(181,123,132,0.16)",
        "panel":       "0 18px 52px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
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
