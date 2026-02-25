<<<<<<< HEAD
# 💬 FastChat - Chat Éphémère Sécurisé

Application web de chat en temps réel avec messages éphémères.

## 🎯 Fonctionnalités

- ✅ Chat de groupe en temps réel
- ✅ Messages éphémères (disparaissent à la fin de la session)
- ✅ Connexion sécurisée (email + mot de passe)
- ✅ Détection de double connexion
- ✅ Identifiants anonymes avec pastilles de couleur
- ✅ Modification/suppression de messages
- ✅ Protection anti-copie et anti-screenshot

## 🛠️ Technologies

**Frontend :**
- HTML5, CSS3 (Tailwind), JavaScript
- Socket.io Client

**Backend :**
- **Python** : FastAPI (authentification)
- **Node.js** : Express + Socket.io (chat temps réel)
- **Base de données** : MongoDB

## 📦 Installation

### Prérequis
- Python 3.8+
- Node.js 16+
- MongoDB 4.4+

### 1. Backend Python
```bash
cd Backend-python
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 2. Backend Node.js
```bash
cd Backend-nodejs
npm install
node server.js
```

### 3. Frontend
```bash
cd Frontend_css
python -m http.server 8080
```

Ouvrir : http://localhost:8080

## 🔐 Configuration

Créer un fichier `.env` dans `Backend-python/` et `Backend-nodejs/` :
```env
MONGODB_URI=mongodb://localhost:27017/
SECRET_KEY=votre-cle-secrete-longue-et-aleatoire
PORT=3000  # Node.js uniquement
```

⚠️ Utiliser la **même SECRET_KEY** dans les 2 fichiers !

## 📝 Auteur

Bryan TAKAM

## 📜 Licence

MIT
=======
# Fastchat-Project
Application de chat éphémère et sécurisée 
>>>>>>> 51746a18ce8abbd7b0fc0e3e6988768ac7cb7045
