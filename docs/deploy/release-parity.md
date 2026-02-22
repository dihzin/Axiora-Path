# Release Parity (Local x GitHub x Vercel x Render)

## Objetivo
Garantir que Web e API estão no mesmo commit e build antes de validar funcionalidades.

## Endpoints de versão
- Web: `GET /api/version`
- API: `GET /health`

Ambos retornam `commit`, `build` e `env`.

## Variáveis recomendadas

### API (Render)
- `AXIORA_APP_ENV=production`
- `AXIORA_GIT_SHA` (opcional; fallback para `RENDER_GIT_COMMIT`)
- `AXIORA_BUILD_ID` (opcional; fallback para `RENDER_SERVICE_ID`)

### Web (Vercel)
- `NEXT_PUBLIC_API_URL=https://...`
- `NEXT_PUBLIC_GIT_SHA` (opcional; fallback para `VERCEL_GIT_COMMIT_SHA`)

## Verificação automática
No repositório:

```bash
npm run parity:check -- --web=https://axiora-path-web.vercel.app --api=https://axiora-api.onrender.com
```

Resultado esperado:
- `OK web_vs_api`
- `OK local_vs_web`
- `OK local_vs_api`

Se houver `FAIL`:
1. Verifique se Render/Vercel estão em `main`.
2. Faça redeploy de ambos.
3. Limpe cache/PWA no dispositivo de teste.
4. Reexecute o comando.

## Checklist rápido antes de validar funcionalidade
1. `git rev-parse HEAD` = commit esperado.
2. `/api/version` mostra mesmo commit no Web.
3. `/health` mostra mesmo commit na API.
4. `npm run parity:check ...` passa.
5. Só então validar fluxo funcional (ex.: trilha, matéria, jogos).

