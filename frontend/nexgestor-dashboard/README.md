# Dashboard NexGestor

Frontend ativo: Vite + React + TypeScript. Substitui a extensão descontinuada.

- Iniciar backend e dashboard: [README da raiz](../../README.md#desenvolvimento-local).
- Usar a interface: [COMO-USAR.md](../../COMO-USAR.md).
- API: [contrato](../../docs/CONTRATO_API_FRONTEND.md).
- Requisitos e histórico: [mapa da documentação](../../docs/README.md).

`VITE_API_BASE` configura a API no processo ou `.env` local. O desenvolvimento
aceita localhost; o build de produção exige endereço de destino e rejeita
localhost. Scripts disponíveis em `package.json`: dev, build, preview, test,
test:watch e lint. Verificação TypeScript: `npx tsc -b`.
