# Comandos Para Iniciar o Projeto (Sempre que abrir)

## 0) Abrir na pasta do projeto
```powershell
cd "D:\Desenvolvimento de Apps\Axiora-Path"
```

## 1) Garantir Node no PATH (somente nesta janela do PowerShell)
```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
node -v
npm -v
```

## 2) Subir infraestrutura (Postgres + Redis)
```powershell
cd "D:\Desenvolvimento de Apps\Axiora-Path"
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml ps
```

## 3) Subir API (Terminal 1)
```powershell
cd "D:\Desenvolvimento de Apps\Axiora-Path\apps\api"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 4) Subir Web (Terminal 2)
```powershell
cd "D:\Desenvolvimento de Apps\Axiora-Path"
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm run dev --workspace @axiora/web
```

## 5) URLs locais
- Web: http://localhost:3000
- API Docs: http://localhost:8000/docs
- Health API: http://localhost:8000/health

## 6) Parar tudo
### Parar API/Web
No terminal de cada serviço: `Ctrl + C`

### Parar infraestrutura
```powershell
cd "D:\Desenvolvimento de Apps\Axiora-Path"
docker compose -f infra/docker/docker-compose.yml down
```

