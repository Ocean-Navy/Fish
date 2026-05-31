.PHONY: serve-app serve-api smoke zip

serve-app:
	cd app && python3 -m http.server 5173

serve-api:
	cd backend && python3 server.py

smoke:
	python3 backend/ocean_supply.py

zip:
	cd .. && zip -r fish-landing-agent-spec.zip fish-landing-agent-spec
