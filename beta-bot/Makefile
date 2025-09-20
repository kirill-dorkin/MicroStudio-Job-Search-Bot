SHELL := /bin/bash

.PHONY: bot venv install run clean help

# One-shot: creates venv, installs deps, loads .env, runs bot
bot: install run

# Create virtual environment with Python 3.12/3.11/3.10 if available
venv:
	@set -e; \
	PY=$$(command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3); \
	if [ -z "$$PY" ]; then echo "Python 3.10+ not found"; exit 1; fi; \
	if [ ! -d .venv ]; then $$PY -m venv .venv; fi; \
	. .venv/bin/activate; python -V

# Install bot and local library dependencies into venv
install: venv
	@set -e; \
	. .venv/bin/activate; \
	python - <<'EOF'
import sys
if sys.version_info >= (3, 13):
    raise SystemExit("Python 3.13 is not supported yet. Use Python 3.12 or lower.")
EOF
	python -m pip install --upgrade pip setuptools wheel; \
	python -m pip install -r bot/requirements.txt; \
	python -m pip install -e .

# Load variables from .env and bot/.env then run the bot
run:
	@set -e; \
	. .venv/bin/activate; \
	if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	if [ -f bot/.env ]; then set -a; . ./bot/.env; set +a; fi; \
	python -m bot.main

clean:
	@rm -rf .venv

help:
	@echo "Targets:"; \
	echo "  make bot     # create venv, install deps, run bot"; \
	echo "  make venv    # create virtualenv (python3.12/3.11/3.10)"; \
	echo "  make install # install requirements into venv"; \
	echo "  make run     # run bot, auto-load .env and bot/.env"; \
	echo "  make clean   # remove venv"
