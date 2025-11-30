import uvicorn
import argparse
import os
import sys
import threading
import time

# 1. Explicitly import the app object. 
# This tells PyInstaller to bundle 'app' and its dependencies.
from app.main import app


def _parent_watcher():
    """
    Best-effort guard: if the parent process dies (e.g., Tauri crash/force-quit),
    exit the backend to avoid orphaned sidecars and port collisions.
    """
    ppid = os.getppid()
    while True:
        try:
            # On Unix, kill(pid, 0) checks existence. If parent becomes init (ppid == 1), exit.
            if ppid == 1:
                os._exit(0)
            os.kill(ppid, 0)
        except OSError:
            os._exit(0)
        time.sleep(3)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LiteFetch API Runner")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8333, help="Port to run the backend on")
    parser.add_argument("--dir", type=str, default="./workspace", help="Workspace directory for data")
    parser.add_argument("--reload", action="store_true", help="Enable autoreload (dev only)")
    
    args = parser.parse_args()
    
    # Set environment var for Storage Engine to pick up
    os.environ["LITEFETCH_WORKSPACE"] = args.dir

    # Start parent watcher thread (daemon) to avoid orphaned sidecar if parent dies
    threading.Thread(target=_parent_watcher, daemon=True).start()
    
    print(f"🚀 Starting LiteFetch on http://127.0.0.1:{args.port}")
    print(f"📂 Workspace: {os.path.abspath(args.dir)}")
    
    # 2. Pass the 'app' object directly, not the string "app.main:app"
    # 3. Force reload=False because hot-reloading doesn't work in a frozen binary
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=False, 
    )
