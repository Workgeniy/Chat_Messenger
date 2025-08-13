import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            // REST
            "/api": {
                target: "http://localhost:5157",
                changeOrigin: true,
            },
            "^/(chatHub|chathub)": {
                target: "http://localhost:5157",
                changeOrigin: true,
                ws: true,
            },
            "/avatars": {
                target: "http://localhost:5157",
                changeOrigin: true,
            },
        },
    },
});
