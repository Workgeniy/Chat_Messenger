import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:5157',
                changeOrigin: true
            },
            '/chatHub': {
                target: 'http://localhost:5157',
                ws: true,
                changeOrigin: true
            }
        }
    }
})