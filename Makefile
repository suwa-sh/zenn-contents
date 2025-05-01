article:
	npx zenn new:article

book:
	npx zenn new:book

preview:
	npx zenn preview & echo $$! > .zenn-preview.pid
	open http://localhost:8000

preview-down:
	if [ -f .zenn-preview.pid ]; then \
		kill `cat .zenn-preview.pid` || true; \
		rm .zenn-preview.pid; \
	fi
