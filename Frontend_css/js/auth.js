// 🔐 FASTCHAT - Gestion de l'authentification

// Configuration
const API_URL = 'http://localhost:8000';  // Backend Python

// Éléments DOM
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const btnFaceLogin = document.getElementById('btn-face-login');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const successMessage = document.getElementById('success-message');
const successText = document.getElementById('success-text');
const loading = document.getElementById('loading');
const faceModal = document.getElementById('face-modal');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnCapture = document.getElementById('btn-capture');
const btnCancelFace = document.getElementById('btn-cancel-face');

let stream = null;  // Stream de la webcam

// ==================== GESTION DES ONGLETS ====================

tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('bg-white/20');
    tabLogin.classList.remove('text-white/70');
    tabRegister.classList.remove('bg-white/20');
    tabRegister.classList.add('text-white/70');
    
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('bg-white/20');
    tabRegister.classList.remove('text-white/70');
    tabLogin.classList.remove('bg-white/20');
    tabLogin.classList.add('text-white/70');
    
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
});

// ==================== FONCTIONS UTILITAIRES ====================

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

function showSuccess(message) {
    successText.textContent = message;
    successMessage.classList.remove('hidden');
    setTimeout(() => {
        successMessage.classList.add('hidden');
    }, 3000);
}

function showLoading() {
    loading.classList.remove('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

// ==================== CONNEXION CLASSIQUE ====================

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    showLoading();
    
    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email, 
                password,
                platform: 'web'
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Stocker le token et les infos user
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            showSuccess('Connexion réussie ! Redirection...');
            
            // Redirection vers le chat
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 1000);
        } else {
            showError(data.detail || 'Erreur de connexion');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showError('Impossible de se connecter au serveur');
    } finally {
        hideLoading();
    }
});

// ==================== INSCRIPTION ====================

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    // Validation du mot de passe
    if (password.length < 6) {
        showError('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                username,
                email, 
                password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('Inscription réussie ! Vous pouvez maintenant vous connecter.');
            
            // Basculer vers l'onglet connexion
            setTimeout(() => {
                tabLogin.click();
                document.getElementById('login-email').value = email;
            }, 2000);
        } else {
            showError(data.detail || 'Erreur lors de l\'inscription');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showError('Impossible de se connecter au serveur');
    } finally {
        hideLoading();
    }
});

// ==================== RECONNAISSANCE FACIALE ====================

btnFaceLogin.addEventListener('click', async () => {
    // Ouvrir la modal
    faceModal.classList.remove('hidden');
    
    try {
        // Demander l'accès à la webcam
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }
        });
        
        video.srcObject = stream;
    } catch (error) {
        console.error('Erreur webcam:', error);
        showError('Impossible d\'accéder à la webcam');
        faceModal.classList.add('hidden');
    }
});

btnCancelFace.addEventListener('click', () => {
    // Arrêter la webcam
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    faceModal.classList.add('hidden');
});

btnCapture.addEventListener('click', async () => {
    // Capturer une image de la vidéo
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0);
    
    // Convertir en base64
    const imageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
    
    // Arrêter la webcam
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    faceModal.classList.add('hidden');
    showLoading();
    
    try {
        const response = await fetch(`${API_URL}/api/auth/login-face`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                image: imageBase64,
                platform: 'web'
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Stocker le token et les infos user
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            showSuccess('Reconnaissance faciale réussie ! Redirection...');
            
            // Redirection vers le chat
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 1000);
        } else {
            showError(data.detail || 'Visage non reconnu');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showError('Impossible de se connecter au serveur');
    } finally {
        hideLoading();
    }
});

// ==================== SÉCURITÉ ====================

// Désactiver le clic droit
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Désactiver les raccourcis clavier de copie
document.addEventListener('keydown', (e) => {
    // Ctrl+C, Ctrl+S, Ctrl+P, Ctrl+U, F12
    if (
        (e.ctrlKey && (e.key === 'c' || e.key === 's' || e.key === 'p' || e.key === 'u')) ||
        e.key === 'F12'
    ) {
        e.preventDefault();
    }
});

// Détecter si la page est mise en arrière-plan (possible screenshot)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('⚠️ Activité suspecte détectée (page cachée)');
        // On pourrait logger ceci côté serveur
    }
});

// ==================== VÉRIFICATION AU CHARGEMENT ====================

// Si l'utilisateur est déjà connecté, rediriger vers le chat
window.addEventListener('load', () => {
    const token = localStorage.getItem('token');
    if (token) {
        // Vérifier si le token est toujours valide
        fetch(`${API_URL}/api/auth/verify-token`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (response.ok) {
                window.location.href = 'chat.html';
            } else {
                // Token invalide, le supprimer
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        })
        .catch(error => {
            console.error('Erreur de vérification du token:', error);
        });
    }
});
