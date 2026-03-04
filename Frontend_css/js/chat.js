// 💬 FASTCHAT - Gestion du chat temps réel

// Configuration
const SOCKET_URL = 'https://fastchat-socket.onrender.com';  // Backend Node.js

// Récupération des infos utilisateur
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

// Si pas de token, rediriger vers la connexion
if (!token || !user.userId) {
    window.location.href = 'index.html';
}

// Éléments DOM
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const participantsList = document.getElementById('participants-list');
const participantCount = document.getElementById('participant-count');
const btnLeave = document.getElementById('btn-leave');
const leaveModal = document.getElementById('leave-modal');
const btnConfirmLeave = document.getElementById('btn-confirm-leave');
const btnCancelLeave = document.getElementById('btn-cancel-leave');
const editModal = document.getElementById('edit-modal');
const editContent = document.getElementById('edit-content');
const btnSaveEdit = document.getElementById('btn-save-edit');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

// Variables globales
let socket = null;
let participants = [];
let messages = [];
let currentPartialId = '';
let currentColorBadge = '';
let editingMessageId = null;

// ==================== CONNEXION SOCKET.IO ====================

let forceLogin = false; // Flag pour forcer la connexion

// Vérifier si on doit forcer la connexion
const forceLogin = localStorage.getItem('forceLogin') === 'true';

// Si on force, retirer le flag immédiatement
if (forceLogin) {
    localStorage.removeItem('forceLogin');
    console.log('🔄 Reconnexion forcée...');
}

// ==================== CONNEXION SOCKET.IO ====================

// Vérifier si on doit forcer la connexion
const shouldForceLogin = localStorage.getItem('forceLogin') === 'true';
if (shouldForceLogin) {
    localStorage.removeItem('forceLogin');
    console.log('🔄 Reconnexion forcée activée');
}

socket = io(SOCKET_URL, {
    auth: { 
        token,
        forceLogin: shouldForceLogin
    }
});

socket.on('connect', () => {
    console.log('✅ Connecté au serveur Socket.io');
});

socket.on('connect_error', (error) => {
    console.error('❌ Erreur de connexion:', error);
    alert('Impossible de se connecter au serveur de chat');
    window.location.href = 'index.html';
});

// ==================== GESTION DOUBLE CONNEXION ====================

socket.on('already-connected', (data) => {
    console.log('⚠️ Utilisateur déjà connecté ailleurs');
    
    // Afficher le message de confirmation
    if (confirm(`⚠️ ${data.message}\n\nVoulez-vous déconnecter l'autre session et vous connecter ici ?`)) {
        // L'utilisateur a confirmé
        localStorage.setItem('forceLogin', 'true');
        window.location.reload(); // Recharger la page
    } else {
        // L'utilisateur a annulé
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        alert('Connexion annulée. Retour à la page de connexion.');
        window.location.href = 'index.html';
    }
});

// ==================== ÉVÉNEMENTS SOCKET.IO ====================

// Réception de l'ID partiel et de la couleur
socket.on('user-info', (data) => {
    currentPartialId = data.partialId;
    currentColorBadge = data.colorBadge;
    console.log(`Mon ID partiel: ${currentPartialId}, Couleur: ${currentColorBadge}`);
});

// Historique des messages (quand on rejoint)
socket.on('message-history', (history) => {
    messages = history;
    renderMessages();
});

// Liste des participants
socket.on('participants-list', (list) => {
    participants = list;
    updateParticipantsList();
});

// Nouveau participant a rejoint
socket.on('participant-joined', (participant) => {
    participants.push(participant);
    updateParticipantsList();
    addSystemMessage(`${participant.partialId} a rejoint le chat`);
});

// Participant a quitté
socket.on('participant-left', (userId) => {
    const participant = participants.find(p => p.userId === userId);
    if (participant) {
        addSystemMessage(`${participant.partialId} a quitté le chat`);
        participants = participants.filter(p => p.userId !== userId);
        updateParticipantsList();
    }
});

// Nouveau message reçu
socket.on('new-message', (message) => {
    messages.push(message);
    addMessageToDOM(message);
    scrollToBottom();
});

// Message modifié
socket.on('message-edited', (data) => {
    const message = messages.find(m => m.messageId === data.messageId);
    if (message) {
        message.content = data.newContent;
        message.modifiedAt = data.modifiedAt;
        
        const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (messageElement) {
            const contentElement = messageElement.querySelector('.message-content');
            contentElement.textContent = data.newContent;
            contentElement.classList.add('message-edited');
        }
    }
});

// Message supprimé
socket.on('message-deleted', (data) => {
    messages = messages.filter(m => m.messageId !== data.messageId);
    
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
});

// Erreur de modification (délai dépassé)
socket.on('edit-error', (data) => {
    alert(data.error);
});

// Déconnexion forcée depuis une autre session
socket.on('force-disconnect', (data) => {
    alert(`⚠️ ${data.reason}\n\nVous avez été déconnecté.`);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});

// Session terminée
socket.on('session-ended', () => {
    alert('La session de chat est terminée. Tous les messages ont été supprimés.');
    window.location.href = 'index.html';
});
// Appeler la fonction une première fois
attachSocketEvents();

// ==================== ENVOI DE MESSAGE ====================

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const content = messageInput.value.trim();
    
    if (content === '') return;
    
    // Émettre le message au serveur
    socket.emit('send-message', {
        content,
        timestamp: new Date()
    });
    
    // Vider l'input
    messageInput.value = '';
    messageInput.focus();
});

// ==================== AFFICHAGE DES MESSAGES ====================

function renderMessages() {
    messagesContainer.innerHTML = `
        <div class="text-center text-gray-400 text-sm">
            <p>🔒 Chat éphémère sécurisé</p>
            <p class="mt-1">Les messages disparaîtront à la fin de la session</p>
        </div>
    `;
    
    messages.forEach(message => {
        addMessageToDOM(message, false);
    });
    
    scrollToBottom();
}

function addMessageToDOM(message, animate = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start gap-3 ${animate ? 'message-animate' : ''}`;
    messageDiv.setAttribute('data-message-id', message.messageId);
    
    const isMyMessage = message.partialId === currentPartialId;
    
    messageDiv.innerHTML = `
        <div class="flex-shrink-0">
            <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background-color: ${message.colorBadge}">
                <span class="text-white font-bold text-sm">${message.partialId.slice(-2)}</span>
            </div>
        </div>
        
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-gray-300">${message.partialId}</span>
                <span class="text-xs text-gray-500">${formatTime(message.sentAt)}</span>
            </div>
            
            <div class="bg-gray-800 rounded-lg p-3 inline-block max-w-full">
                <p class="text-white message-content ${message.modifiedAt ? 'message-edited' : ''}">${escapeHtml(message.content)}</p>
            </div>
            
            ${isMyMessage ? `
                <div class="message-actions mt-2 flex gap-2">
                    <button 
                        onclick="editMessage('${message.messageId}', '${escapeHtml(message.content)}')" 
                        class="text-xs text-purple-400 hover:text-purple-300"
                    >
                        ✏️ Modifier
                    </button>
                    <button 
                        onclick="deleteMessage('${message.messageId}')" 
                        class="text-xs text-red-400 hover:text-red-300"
                    >
                        🗑️ Supprimer
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'text-center text-gray-500 text-sm py-2 message-animate';
    messageDiv.innerHTML = `<p>ℹ️ ${text}</p>`;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== GESTION DES PARTICIPANTS ====================

function updateParticipantsList() {
    participantCount.textContent = participants.length;
    
    participantsList.innerHTML = '';
    
    participants.forEach(participant => {
        const participantDiv = document.createElement('div');
        participantDiv.className = 'participant-item flex items-center gap-3 p-3 rounded-lg cursor-pointer';
        
        participantDiv.innerHTML = `
            <div class="w-3 h-3 rounded-full" style="background-color: ${participant.colorBadge}"></div>
            <span class="text-white text-sm">${participant.partialId}</span>
            ${participant.partialId === currentPartialId ? '<span class="ml-auto text-xs text-purple-400">(Vous)</span>' : ''}
        `;
        
        participantsList.appendChild(participantDiv);
    });
}

// ==================== MODIFICATION DE MESSAGE ====================

window.editMessage = function(messageId, content) {
    const message = messages.find(m => m.messageId === messageId);
    
    if (!message) return;
    
    // Vérifier le délai de 10 minutes
    const now = new Date();
    const sentAt = new Date(message.sentAt);
    const diffMinutes = (now - sentAt) / 1000 / 60;
    
    if (diffMinutes > 10) {
        alert('⏰ Délai de modification dépassé (10 minutes maximum)');
        return;
    }
    
    // Ouvrir la modal de modification
    editingMessageId = messageId;
    editContent.value = content;
    editModal.classList.remove('hidden');
    editContent.focus();
};

btnSaveEdit.addEventListener('click', () => {
    const newContent = editContent.value.trim();
    
    if (newContent === '') {
        alert('Le message ne peut pas être vide');
        return;
    }
    
    // Émettre la modification au serveur
    socket.emit('edit-message', {
        messageId: editingMessageId,
        newContent
    });
    
    // Fermer la modal
    editModal.classList.add('hidden');
    editingMessageId = null;
});

btnCancelEdit.addEventListener('click', () => {
    editModal.classList.add('hidden');
    editingMessageId = null;
});

// ==================== SUPPRESSION DE MESSAGE ====================

window.deleteMessage = function(messageId) {
    if (confirm('❌ Voulez-vous vraiment supprimer ce message ?')) {
        socket.emit('delete-message', { messageId });
    }
};

// ==================== QUITTER LE CHAT ====================

btnLeave.addEventListener('click', () => {
    leaveModal.classList.remove('hidden');
});

btnConfirmLeave.addEventListener('click', () => {
    // Déconnecter le socket
    socket.disconnect();
    
    // Supprimer les infos locales
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Rediriger vers la page de connexion
    window.location.href = 'index.html';
});

btnCancelLeave.addEventListener('click', () => {
    leaveModal.classList.add('hidden');
});

// ==================== SÉCURITÉ ====================

// Désactiver le clic droit
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Désactiver les raccourcis clavier
document.addEventListener('keydown', (e) => {
    if (
        (e.ctrlKey && (e.key === 'c' || e.key === 's' || e.key === 'p' || e.key === 'u')) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C'))
    ) {
        e.preventDefault();
    }
});

// Détecter activité suspecte
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('⚠️ Activité suspecte détectée (page cachée)');
        // Potentiellement un screenshot
    }
});

// Bloquer l'impression
window.addEventListener('beforeprint', (e) => {
    e.preventDefault();
    alert('🚫 L\'impression est désactivée pour des raisons de sécurité');
    return false;
});

// ==================== DÉCONNEXION EN CAS DE FERMETURE ====================

window.addEventListener('beforeunload', () => {
    if (socket && socket.connected) {
        socket.disconnect();
    }
});

// ==================== AUTO-FOCUS SUR L'INPUT ====================

messageInput.focus();
