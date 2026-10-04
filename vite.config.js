import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export default defineConfig(({command})=>{
  if(command==='build'&&existsSync(new URL('./public/review',import.meta.url)))throw Error('复核影像必须移出 public/review 后才能发布。请保存在项目 outputs 中。');
  return { base: './', build: {target: 'es2022', rollupOptions: {input: {
    campus: fileURLToPath(new URL('./index.html', import.meta.url)),
    plan: fileURLToPath(new URL('./plan.html', import.meta.url))
  }}}, server: {strictPort: true} };
});
