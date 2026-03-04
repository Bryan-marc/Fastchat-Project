"""
🐍 FASTCHAT - Backend Python (FastAPI)
Gestion de l'authentification et reconnaissance faciale
"""

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from pymongo import MongoClient
from jose import jwt, JWTError
import bcrypt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# Configuration
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/')
SECRET_KEY = os.getenv('SECRET_KEY', 'votre-cle-secrete-a-changer')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Initialisation de FastAPI
app = FastAPI(
    title="FastChat API",
    description="API d'authentification avec reconnaissance faciale",
    version="1.0.0"
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connexion MongoDB
try:
    mongo_client = MongoClient(MONGODB_URI)
    db = mongo_client['fastchat']
    users_collection = db['users']
    print("✅ Connecté à MongoDB")
except Exception as e:
    print(f"❌ Erreur de connexion à MongoDB: {e}")
    exit(1)

# ==================== MODÈLES PYDANTIC ====================

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    platform: str = "web"

class FaceLogin(BaseModel):
    image: str  
    platform: str = "web"

class EnrollFace(BaseModel):
    email: EmailStr
    image: str  

# ==================== FONCTIONS UTILITAIRES ====================

def create_access_token(data: dict):
    """Créer un token JWT"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def hash_password(password: str) -> bytes:
    """Hasher un mot de passe avec bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

def verify_password(plain_password: str, hashed_password: bytes) -> bool:
    """Vérifier un mot de passe"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)

# ==================== ROUTES ====================

@app.get("/")
async def root():
    """Page d'accueil de l'API"""
    return {
        "message": "FastChat API - Authentification",
        "version": "1.0.0",
        "endpoints": {
            "register": "/api/auth/register",
            "login": "/api/auth/login",
            "login_face": "/api/auth/login-face",
            "enroll_face": "/api/auth/enroll-face",
            "verify_token": "/api/auth/verify-token"
        }
    }

@app.post("/api/auth/register")
async def register(user: UserRegister):
    """Inscription d'un nouvel utilisateur"""
    
    existing_user = users_collection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet email est déjà utilisé"
        )
    
    existing_username = users_collection.find_one({"username": user.username})
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce nom d'utilisateur est déjà pris"
        )
    
    password_hash = hash_password(user.password)
    
    user_doc = {
        "username": user.username,
        "email": user.email,
        "passwordHash": password_hash,
        "faceEncoding": None,
        "createdAt": datetime.utcnow()
    }
    
    result = users_collection.insert_one(user_doc)
    
    return {
        "message": "Inscription réussie",
        "userId": str(result.inserted_id)
    }

@app.post("/api/auth/login")
async def login(credentials: UserLogin):
    """Connexion classique (email + mot de passe)"""
    
    user = users_collection.find_one({"email": credentials.email})
    
    if not user:
        raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Aucun compte associé à cet email. Veuillez vous inscrire."
    )
    
    if not verify_password(credentials.password, user['passwordHash']):
        raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Mot de passe incorrect"
    )
    
    token_data = {
        "userId": str(user['_id']),
        "email": user['email'],
        "username": user['username']
    }
    token = create_access_token(token_data)
    
    return {
        "token": token,
        "user": {
            "userId": str(user['_id']),
            "email": user['email'],
            "username": user['username']
        }
    }

#@app.post("/api/auth/enroll-face")
#async def enroll_face(data: EnrollFace):
#pass
    """Enregistrer le visage d'un utilisateur pour la reconnaissance faciale"""
    
    # Trouver l'utilisateur
    user = users_collection.find_one({"email": data.email})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    # Décoder l'image
    try:
        image_np = decode_base64_image(data.image)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Détecter les visages dans l'image
    face_locations = face_recognition.face_locations(image_np)
    
    if len(face_locations) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun visage détecté dans l'image"
        )
    
    if len(face_locations) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plusieurs visages détectés. Assurez-vous d'être seul dans l'image"
        )
    
    # Extraire les caractéristiques du visage
    face_encodings = face_recognition.face_encodings(image_np, face_locations)
    face_encoding = face_encodings[0].tolist()
    
    # Sauvegarder dans MongoDB
    users_collection.update_one(
        {"_id": user['_id']},
        {"$set": {"faceEncoding": face_encoding}}
    )
    
    return {
        "message": "Visage enregistré avec succès",
        "email": data.email
    }

#@app.post("/api/auth/login-face")
#async def login_face(data: FaceLogin):
#pass
    """Connexion par reconnaissance faciale"""
    
    # Décoder l'image
    try:
        image_np = decode_base64_image(data.image)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Détecter les visages
    face_locations = face_recognition.face_locations(image_np)
    
    if len(face_locations) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun visage détecté dans l'image"
        )
    
    if len(face_locations) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plusieurs visages détectés"
        )
    
    # Extraire les caractéristiques
    face_encodings = face_recognition.face_encodings(image_np, face_locations)
    unknown_encoding = face_encodings[0]
    
    # Récupérer tous les utilisateurs qui ont un visage enregistré
    users_with_faces = users_collection.find({"faceEncoding": {"$ne": None}})
    
    # Comparer avec chaque utilisateur
    for user in users_with_faces:
        known_encoding = np.array(user['faceEncoding'])
        
        # Comparer les encodages (tolérance de 0.4 = ~60% de similarité)
        matches = face_recognition.compare_faces(
            [known_encoding],
            unknown_encoding,
            tolerance=0.4
        )
        
        if matches[0]:
            # Visage reconnu !
            token_data = {
                "userId": str(user['_id']),
                "email": user['email'],
                "username": user['username']
            }
            token = create_access_token(token_data)
            
            return {
                "token": token,
                "user": {
                    "userId": str(user['_id']),
                    "email": user['email'],
                    "username": user['username']
                }
            }
    
    # Aucun match trouvé
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Visage non reconnu. Veuillez vous inscrire ou utiliser la connexion classique."
    )

@app.get("/api/auth/verify-token")
async def verify_token(authorization: str = None):
    """Vérifier si un token JWT est valide"""
    
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant ou invalide"
        )
    
    token = authorization.split(' ')[1]
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {
            "valid": True,
            "userId": payload.get("userId"),
            "email": payload.get("email")
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré"
        )
        # ==================== RÉINITIALISATION MOT DE PASSE ====================

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    new_password: str
    reset_code: str

reset_codes = {}

@app.post("/api/auth/request-password-reset")
async def request_password_reset(data: PasswordResetRequest):
    """Demander un code de réinitialisation de mot de passe"""
    
    user = users_collection.find_one({"email": data.email})
    
    if not user:
        return {
            "message": "Si cet email existe, un code de réinitialisation a été envoyé"
        }
    
    import random
    reset_code = str(random.randint(100000, 999999))
    
    from datetime import datetime, timedelta
    reset_codes[data.email] = {
        "code": reset_code,
        "expires_at": datetime.utcnow() + timedelta(minutes=10)
    }
    
    print(f"🔑 CODE DE RÉINITIALISATION pour {data.email}: {reset_code}")
    print(f"⏰ Expire dans 10 minutes")
    
    return {
        "message": "Si cet email existe, un code de réinitialisation a été envoyé",
        "dev_code": reset_code  
    }

@app.post("/api/auth/reset-password")
async def reset_password(data: PasswordResetConfirm):
    """Réinitialiser le mot de passe avec le code"""
    
    if data.email not in reset_codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code invalide ou expiré"
        )
    
    reset_data = reset_codes[data.email]
    
    if datetime.utcnow() > reset_data["expires_at"]:
        del reset_codes[data.email]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code expiré. Veuillez en demander un nouveau"
        )
    
    if reset_data["code"] != data.reset_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code incorrect"
        )
    
    new_password_hash = hash_password(data.new_password)
    
    # Mettre à jour dans MongoDB
    users_collection.update_one(
        {"email": data.email},
        {"$set": {"passwordHash": new_password_hash}}
    )
    
    del reset_codes[data.email]
    
    print(f"✅ Mot de passe réinitialisé pour {data.email}")
    
    return {
        "message": "Mot de passe réinitialisé avec succès"
    }

# ==================== LANCEMENT DU SERVEUR ====================

if __name__ == "__main__":
    import uvicorn
    print("🚀 Démarrage du serveur FastAPI...")
    print(f"📡 API disponible sur http://0.0.0.0:8000")
    print(f"📖 Documentation interactive sur http://0.0.0.0:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
