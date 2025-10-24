article:
	npx zenn new:article

book:
	npx zenn new:book

preview:
	@if [ -f .zenn-preview.pid ] && kill -0 `cat .zenn-preview.pid` 2>/dev/null; then \
		echo "⚠️  Preview is already running (PID: `cat .zenn-preview.pid`)"; \
		exit 1; \
	fi

	@if lsof -i :18000 >/dev/null 2>&1; then \
		echo "⚠️  Port 18000 is already in use"; \
		echo "   Run 'make preview-restart' to force restart"; \
		exit 1; \
	fi
	@echo "✅ Starting preview server..."
	@npx zenn preview --host 0.0.0.0 --port 18000 & echo $$! > .zenn-preview.pid
	@sleep 2
	@open http://localhost:18000

preview-down:
	@if [ -f .zenn-preview.pid ]; then \
		echo "🛑 Stopping preview server (PID: `cat .zenn-preview.pid`)..."; \
		kill `cat .zenn-preview.pid` 2>/dev/null || true; \
		rm .zenn-preview.pid; \
		echo "✅ Preview server stopped"; \
	else \
		echo "ℹ️ preview server is NOT running"; \
	fi

push:
	git add .
	git commit -m "chore"
	git pull origin
	git push origin main
