import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
export default defineConfig({server:{host:'0.0.0.0',port:3000,proxy:{'/api':'http://localhost:3001'}},plugins:[tanstackRouter({target:'react',autoCodeSplitting:true}),tailwindcss(),tsConfigPaths(),react()],build:{outDir:'build'}})
