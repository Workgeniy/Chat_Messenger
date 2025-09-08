import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/api":      { target: "http://localhost:5157", changeOrigin: true },
            "/chatHub":  { target: "http://localhost:5157", ws: true, changeOrigin: true },
            "/chathub":  { target: "http://localhost:5157", ws: true, changeOrigin: true }, // на всякий случай регистр
            "/avatars":  { target: "http://localhost:5157", changeOrigin: true },
        },
    },
});