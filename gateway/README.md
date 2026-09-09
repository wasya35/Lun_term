# AG-TS AlgoPack Gateway

Крошечный сервис-шлюз для доступа к MOEX ALGOPACK. Разворачивается на **Timeweb Cloud
App Platform** из GitHub-репозитория (Docker). Держит API-ключ ALGOPACK на сервере;
терминал ходит к нему через `api.php?fn=algopack` со стороны SprintHost.

## Что делает
`GET /moex/iss/....json?...` + заголовок `X-Gate-Secret: <секрет>` →
подставляет `https://apim.moex.com` + `Authorization: Bearer <ключ>` → отдаёт JSON.
Белый список путей: `/iss/analyticalproducts/futoi/`, `/iss/datashop/algopack/`, `/iss/engines/`.
`GET /` или `/health` → `ok` (health-check).

## Переменные окружения (задать в панели Timeweb, НЕ в коде)
- `ALGOPACK_KEY` — API-ключ ALGOPACK (Bearer).
- `GATEWAY_SECRET` — длинная случайная строка; та же прописывается в `gw_secret.php` на SprintHost.
- `PORT` — обычно Timeweb задаёт сам; иначе 8080.

## Проверка после деплоя
- `https://<адрес-шлюза>/health` → `ok`.
- `curl -H "X-Gate-Secret: СЕКРЕТ" "https://<адрес-шлюза>/moex/iss/analyticalproducts/futoi/securities/Si.json?latest=1"`
  → JSON с блоком `futoi` (или `403`, если секрет неверный).
