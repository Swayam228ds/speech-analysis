from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.database import get_connection
from app.schemas.common import UserCreate, UserResponse, Token
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user
)
from app.utils.config import settings
import psycopg2

router = APIRouter(tags=["auth"])

@router.post("/register", response_model=UserResponse)
def register(user: UserCreate):
    connection = get_connection()
    cursor = connection.cursor()
    
    # Check if user exists
    cursor.execute("SELECT id FROM users WHERE username = %s OR email = %s;", (user.username, user.email))
    if cursor.fetchone():
        cursor.close()
        connection.close()
        raise HTTPException(status_code=400, detail="Username or email already registered")
    
    hashed_password = get_password_hash(user.password)
    
    try:
        cursor.execute(
            """
            INSERT INTO users (username, email, password_hash)
            VALUES (%s, %s, %s) RETURNING id, username, email;
            """,
            (user.username, user.email, hashed_password)
        )
        new_user = cursor.fetchone()
        connection.commit()
    except psycopg2.Error as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred.")
    finally:
        cursor.close()
        connection.close()
        
    return UserResponse(id=new_user[0], username=new_user[1], email=new_user[2])

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    connection = get_connection()
    cursor = connection.cursor()
    
    cursor.execute("SELECT id, username, password_hash FROM users WHERE username = %s;", (form_data.username,))
    user = cursor.fetchone()
    cursor.close()
    connection.close()
    
    if not user or not verify_password(form_data.password, user[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user[1]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(id=current_user["id"], username=current_user["username"], email=current_user["email"])
