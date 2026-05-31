.PHONY: install dev build typecheck lint verify serve-api smoke docker-build docker-up docker-down health zip

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

health:
	curl -fsS http://127.0.0.1:3000/api/health

zip:
	cd .. && zip -r opfish.zip opfish
