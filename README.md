# Ethiqia Backend (Render-ready)

Express API con login/registro, posts y estimación de autenticidad.
MongoDB y OpenAI son opcionales (si no defines variables, usa modo demo en memoria).

## Deploy (GUI)
1. New → Web Service → Upload ZIP o GitHub.
2. Runtime: Node. Build: `npm install`. Start: `npm start`.
3. Env vars:
   - JWT_SECRET=change_this_secret
   - ETHIQIA_AI_ENABLED=true
   - (opcional) MONGO_URI=...
   - (opcional) OPENAI_API_KEY=sk-...
4. Deploy y prueba `/api/health`.

## Endpoints
- GET /api/health
- POST /api/auth/register
- POST /api/auth/login
- GET /api/posts
- POST /api/posts (multipart: text, media) con Bearer token
