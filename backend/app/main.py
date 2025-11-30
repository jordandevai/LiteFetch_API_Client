from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import router

app = FastAPI(title="LiteFetch Core")

# Enable CORS for local development (Frontend on different port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Secure this in production/package
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

@app.get("/")
def health_check():
    return {"status": "LiteFetch Engine Running"}
