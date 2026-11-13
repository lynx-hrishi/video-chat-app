import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['94c4c39b1c69.ngrok-free.app'],
    proxy: {  
      "/api": "http://localhost:3000",
      "/get-user-id": "https://treaty-ricky-employer-arranged.trycloudflare.com/",
      "/user": "http://localhost:3000",
      "/events/be": "http://localhost:3000"
    }
  }
})
