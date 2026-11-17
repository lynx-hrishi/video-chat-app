import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['pair-video-chat-app.onrender.com'],
    proxy: {  
      // "/api": "https://video-chat-app-cevy.onrender.com"
      "/api": "http://localhost:3000"
    }
  }
})
