import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['94c4c39b1c69.ngrok-free.app'],
    proxy: {  
      "/api": "https://video-chat-app-cevy.onrender.com"
    }
  }
})
