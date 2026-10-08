from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, videos, analysis

app = FastAPI(title="Speech Improvement Platform")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(videos.router)
app.include_router(analysis.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Speech Improvement Platform API"}
