"""Run from the repository root with the project's virtual-environment Python."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "task",
        choices=[
            "db",
            "up",
            "down",
            "migrate",
            "seed-demo",
            "check-demo",
            "clean-demo",
            "seed",
            "api",
            "test",
            "lint",
            "docker-test",
        ],
    )
    task = parser.parse_args().task
    load_dotenv(ROOT / ".env", override=False)
    commands = {
        "db": ["docker", "compose", "up", "-d", "db"],
        "up": ["docker", "compose", "up", "-d", "--build"],
        "down": ["docker", "compose", "down"],
        "migrate": [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            "backend/alembic.ini",
            "upgrade",
            "head",
        ],
        # Demo-only fake data. Seeding refuses to run next to provider-imported accounts.
        "seed-demo": [sys.executable, "-m", "app.db.seed", "seed"],
        "check-demo": [sys.executable, "-m", "app.db.seed", "clean", "--dry-run"],
        "clean-demo": [sys.executable, "-m", "app.db.seed", "clean"],
        # Old name of seed-demo, kept so existing habits and scripts keep working.
        "seed": [sys.executable, "-m", "app.db.seed", "seed"],
        "api": [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            os.getenv("BACKEND_BIND", "127.0.0.1"),
            "--port",
            os.getenv("BACKEND_PORT", "8000"),
            "--no-access-log",
        ],
        "test": [sys.executable, "-m", "pytest", "backend/tests", "-q"],
        "lint": [sys.executable, "-m", "ruff", "check", "backend", "scripts"],
        "docker-test": [
            "docker",
            "compose",
            "run",
            "--rm",
            "--no-deps",
            "backend",
            "python",
            "-m",
            "pytest",
            "-q",
        ],
    }
    try:
        subprocess.run(commands[task], cwd=ROOT, check=True)
    except FileNotFoundError:
        parser.exit(
            1, "Required executable is unavailable; see README.md prerequisites.\n"
        )
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from None
    except KeyboardInterrupt:
        raise SystemExit(130) from None


if __name__ == "__main__":
    main()
