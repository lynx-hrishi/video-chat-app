import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['video-chat-app-1-tc5y.onrender.com'],
    proxy: {  
      "/api": "https://video-chat-app-cevy.onrender.com"
    }
  }
})
