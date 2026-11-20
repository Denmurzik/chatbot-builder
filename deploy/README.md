# Развёртывание на сервере

Стек: PostgreSQL, Redis, миграции, `api`, `engine`, `mock-clinic` и `web` (nginx со статикой SPA и прокси `/api/`, `/webhook/` на `api`). Порты хоста не публикуются; HTTPS и домен обслуживает Nginx Proxy Manager (NPM), `web` подключается к его сети `proxy_manager_default` с алиасом `chatbot-web`.

## Первичная установка

```bash
git clone https://github.com/Denmurzik/chatbot-builder.git ~/chatbot-builder
cd ~/chatbot-builder
cp deploy/.env.prod.example deploy/.env.prod
# значения: openssl rand -base64 32 (JWT_SECRET, VAULT_KEY, VAULT_HASH_KEY, POSTGRES_PASSWORD, MOCK_CLINIC_API_KEY)
nano deploy/.env.prod
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

`VAULT_KEY` и `VAULT_HASH_KEY` — base64 ровно 32 байта. После первого запуска их менять нельзя: зашифрованные секреты окружений перестанут расшифровываться.

## Обновление

```bash
cd ~/chatbot-builder
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

Миграции применяет сервис `migrate` перед стартом `api` и `engine`.

## Proxy Host в Nginx Proxy Manager

- Domain Names: `chatbot.nsumonkey.top`
- Scheme: `http`, Forward Hostname / IP: `chatbot-web`, Forward Port: `80`
- Включить Websockets Support
- Вкладка SSL: сертификат Let's Encrypt, включить Force SSL

DNS-запись домена должна указывать на сервер.

## Первый автор

Скрипт `seed` в production не используется: зарегистрируйтесь через интерфейс (`https://chatbot.nsumonkey.top`). В окружении бота для тестового API клиники укажите адрес `http://mock-clinic:4010` и ключ `MOCK_CLINIC_API_KEY`.

## Проверка без сервера

```bash
docker compose -f deploy/docker-compose.prod.yml -f deploy/docker-compose.local.yml \
  --env-file deploy/.env.prod.example up -d --build
curl http://127.0.0.1:18180/                 # HTML SPA
curl -i http://127.0.0.1:18180/api/auth/me   # 401
docker compose -f deploy/docker-compose.prod.yml -f deploy/docker-compose.local.yml \
  --env-file deploy/.env.prod.example down -v
```
