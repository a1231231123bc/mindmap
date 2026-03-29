# Screen Studio

Легкий веб-инструмент для совместного проектирования экранов.

## Что умеет

- создавать проекты и шарить их по ссылке
- хранить несколько экранов внутри одного проекта
- собирать экран из готовых блоков
- редактировать тексты, CTA, списки, палитру и viewport
- оставлять комментарии к выбранному экрану
- синхронизировать изменения между открытыми вкладками через SSE

## Запуск

```bash
npm run dev
```

Открой:

```text
http://localhost:3010
```

## Docker

Собрать и поднять:

```bash
docker compose up --build -d
```

Остановить:

```bash
docker compose down
```

`./data` примонтирована в контейнер как volume, поэтому проекты сохраняются между рестартами.

## GitHub Autodeploy

В репозитории предусмотрен workflow `.github/workflows/deploy.yml`.

Он на каждом `push` в `main`:

- синхронизирует код на VPS через `rsync`
- не перезаписывает `data/projects.json`
- выполняет `docker compose up -d --build --remove-orphans`
- проверяет `/health`

Нужные GitHub Secrets:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_SSH_KEY`

## Как устроено

- `server.mjs` — HTTP API, выдача статики, SSE-канал
- `public/` — фронтенд на чистом JS/CSS
- `data/projects.json` — простое JSON-хранилище

## Ограничения текущей версии

- это single-node решение: collaboration идет через один запущенный сервер
- данные хранятся в JSON, без БД и аутентификации
- конфликт-менеджмент минимальный: последнее сохранение побеждает

Если понадобится, следующий логичный шаг — вынести storage в Postgres и заменить SSE на WebSocket presence-слой.
