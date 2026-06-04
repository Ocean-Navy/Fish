BASIC_USER ?= fish

.PHONY: install dev build typecheck lint verify serve-api smoke docker-build docker-up docker-down preview-config preview-up preview-down nginx-password health zip

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

typecheck:
	npm run typecheck

lint:
	npm run lint

verify:
	npm run verify

serve-api:
	cd backend && python3 server.py

smoke:
	npm run smoke

docker-build:
	docker build -t opfish-web:latest .

docker-up:
	docker compose up --build

docker-down:
	docker compose down

preview-config:
	FISH_ENV_FILE=../.env.production.example docker compose -f deploy/docker-compose.preview.yml --env-file .env.production.example config

preview-up:
	docker compose -f deploy/docker-compose.preview.yml --env-file .env.production up --build -d

preview-down:
	docker compose -f deploy/docker-compose.preview.yml --env-file .env.production down

nginx-password:
	@test -n "$(BASIC_PASSWORD)" || (echo "Usage: make nginx-password BASIC_USER=fish BASIC_PASSWORD='long-password'" && exit 1)
	@mkdir -p deploy/nginx/auth
	@docker run --rm httpd:2.4-alpine htpasswd -nbB "$(BASIC_USER)" "$(BASIC_PASSWORD)" > deploy/nginx/auth/.htpasswd

health:
	curl -fsS http://127.0.0.1:3000/api/health

zip:
	cd .. && zip -r opfish.zip opfish
