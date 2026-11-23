import js from '@eslint/js';
import globals from 'globals';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default [
 {ignores:['**/node_modules/**','**/.next/**','.local/**','**/next-env.d.ts','**/generated/**']},
 {files:['**/*.js','**/*.mjs'],...js.configs.recommended,languageOptions:{globals:{...globals.node,...globals.browser}},rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}},
 ...nextVitals.map(c=>({...c,files:['apps/web/**/*.{ts,tsx}']})),
 ...nextTs.map(c=>({...c,files:['apps/web/**/*.{ts,tsx}']})),
 {files:['apps/web/**/*.{ts,tsx}'],settings:{next:{rootDir:'apps/web/'}},rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'react-hooks/set-state-in-effect':'off','no-empty':['error',{allowEmptyCatch:true}]}}
];
