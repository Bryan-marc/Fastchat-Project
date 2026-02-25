/**
 * 🟢 FASTCHAT - Backend Node.js (Socket.io)
 * Gestion du chat en temps réel
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/';
const SECRET_KEY = process.env.SECRET_KEY || 'votre-cle-secrete-a-changer';

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Initialisation Socket.io
const io = socketIO(server, {
    cors: {
        origin: "*",  
        methods: ["GET", "POST"]
    }
});

// Connexion MongoDB
let db;
MongoClient.connect(MONGODB_URI)
    .then(client => {
        db = client.db('fastchat');
        console.log('✅ Connecté à MongoDB');
    })
    .catch(err => {
        console.error('❌ Erreur de connexion à MongoDB:', err);
        process.exit(1);
    });

let activeSession = {
    sessionId: `session_${Date.now()}`,
    participants: [],
    messages: [],
    isActive: true,
    startedAt: new Date()
};

// 🆕 Tracking des utilisateurs connectés par email
let connectedUsers = new Map(); // { email: { socketId, partialId, connectedAt } }

const COLORS = [
    '#FF5733', '#33FF57', '#3357FF', '#F333FF',
    '#FF33F3', '#33FFF3', '#F3FF33', '#FF8C33',
    '#8C33FF', '#33FF8C', '#FF8C8C', '#8CFF33'
];

// ==================== FONCTIONS UTILITAIRES ====================

function generatePartialId() {
    return `User_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

function getRandomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        return decoded;
    } catch (error) {
        return null;
    }
}

// ==================== ROUTES EXPRESS ====================

app.get('/', (req, res) => {
    res.json({
        message: 'FastChat Server - Socket.io',
        version: '1.0.0',
        activeParticipants: activeSession.participants.length,
        sessionId: activeSession.sessionId
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date(),
        participants: activeSession.participants.length
    });
});

// ==================== MIDDLEWARE SOCKET.IO ====================

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Token manquant'));
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
        return next(new Error('Token invalide'));
    }
    
    socket.userId = decoded.userId;
    socket.email = decoded.email;
    socket.username = decoded.username;
    
    next();
});

// ==================== ÉVÉNEMENTS SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log(`✅ Utilisateur connecté: ${socket.username} (${socket.userId})`);
    
    if (connectedUsers.has(socket.email)) {
        const existingUser = connectedUsers.get(socket.email);
        
        if (!socket.handshake.auth.forceLogin) {
            console.log(`⚠️ ${socket.email} est déjà connecté ! Demande de confirmation...`);
            
            socket.emit('already-connected', {
                message: 'Un compte est déjà actif avec cet email.',
                email: socket.email
            });
            
            setTimeout(() => {
                socket.disconnect(true);
            }, 500);
            
            return; 
        }
        
        console.log(`⚠️ ${socket.email} force la reconnexion. Déconnexion de l'ancienne session...`);
        
        const oldSocket = io.sockets.sockets.get(existingUser.socketId);
        if (oldSocket) {
            oldSocket.emit('force-disconnect', {
                reason: 'Nouvelle connexion confirmée depuis un autre appareil'
            });
            oldSocket.disconnect(true);
        }
        
        activeSession.participants = activeSession.participants.filter(
            p => p.socketId !== existingUser.socketId
        );
    }
    
    const partialId = generatePartialId();
    const colorBadge = getRandomColor();
    const connectedAt = new Date();
    
    const participant = {
        userId: socket.userId,
        socketId: socket.id,
        username: socket.username,
        email: socket.email,
        partialId,
        colorBadge,
        joinedAt: connectedAt,
        connectedAt: connectedAt 
    };
    
    activeSession.participants.push(participant);
    
    connectedUsers.set(socket.email, {
        socketId: socket.id,
        partialId,
        connectedAt
    });
    
    console.log(`👤 ${partialId} a rejoint (${activeSession.participants.length} participants)`);
    
    socket.emit('user-info', { partialId, colorBadge });
    
    socket.emit('message-history', activeSession.messages);
    
    const participantsWithTime = activeSession.participants.map(p => ({
        ...p,
        connectedAt: p.connectedAt,
        timeOnline: 0 
    }));
    
    socket.emit('participants-list', participantsWithTime);
    
    socket.broadcast.emit('participant-joined', participant);
    
    // ==================== ENVOI DE MESSAGE ====================
    
    socket.on('send-message', async (data) => {
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const message = {
            messageId,
            partialId,
            colorBadge,
            content: data.content,
            sentAt: new Date()
        };
        
        activeSession.messages.push(message);
        
        try {
            await db.collection('admin_logs').insertOne({
                sessionId: activeSession.sessionId,
                ...message,
                userId: socket.userId,
                username: socket.username
            });
        } catch (error) {
            console.error('Erreur de sauvegarde du message:', error);
        }
        
        io.emit('new-message', message);
        
        console.log(`💬 ${partialId}: ${data.content.substring(0, 50)}...`);
    });
    
    // ==================== MODIFICATION DE MESSAGE ====================
    
    socket.on('edit-message', async (data) => {
        const { messageId, newContent } = data;
        
        const message = activeSession.messages.find(m => m.messageId === messageId);
        
        if (!message) {
            socket.emit('edit-error', { error: 'Message non trouvé' });
            return;
        }
        
        if (message.partialId !== partialId) {
            socket.emit('edit-error', { error: 'Vous ne pouvez modifier que vos propres messages' });
            return;
        }
        
        // Vérifier le délai de 10 minutes
        const now = new Date();
        const sentAt = new Date(message.sentAt);
        const diffMinutes = (now - sentAt) / 1000 / 60;
        
        if (diffMinutes > 10) {
            socket.emit('edit-error', { error: 'Délai de modification dépassé (10 minutes maximum)' });
            return;
        }
        
        message.content = newContent;
        message.modifiedAt = new Date();
        
        try {
            await db.collection('admin_logs').updateOne(
                { messageId },
                {
                    $set: {
                        content: newContent,
                        modifiedAt: message.modifiedAt
                    }
                }
            );
        } catch (error) {
            console.error('Erreur de mise à jour du message:', error);
        }
        
        io.emit('message-edited', {
            messageId,
            newContent,
            modifiedAt: message.modifiedAt
        });
        
        console.log(`✏️ ${partialId} a modifié le message ${messageId}`);
    });
    
    // ==================== SUPPRESSION DE MESSAGE ====================
    
    socket.on('delete-message', async (data) => {
        const { messageId } = data;
        
        const message = activeSession.messages.find(m => m.messageId === messageId);
        
        if (!message) return;
        
        if (message.partialId !== partialId) {
            return;
        }
        
        activeSession.messages = activeSession.messages.filter(m => m.messageId !== messageId);
        
        try {
            await db.collection('admin_logs').updateOne(
                { messageId },
                { $set: { deletedAt: new Date() } }
            );
        } catch (error) {
            console.error('Erreur de suppression du message:', error);
        }
        
        io.emit('message-deleted', { messageId });
        
        console.log(`🗑️ ${partialId} a supprimé le message ${messageId}`);
    });
    
    // ==================== DÉCONNEXION ====================
    
    socket.on('disconnect', async () => {
        console.log(`❌ Utilisateur déconnecté: ${socket.username}`);
        
        activeSession.participants = activeSession.participants.filter(
            p => p.socketId !== socket.id
        );

        connectedUsers.delete(socket.email);

        io.emit('participant-left', socket.userId);
        
        console.log(`👤 ${partialId} a quitté (${activeSession.participants.length} participants restants)`);
        
        if (activeSession.participants.length === 0) {
            console.log('⚠️ Dernier participant déconnecté - Fin de session');
            
            // Sauvegarder les métadonnées de la session dans MongoDB
            try {
                await db.collection('sessions').updateOne(
                    { sessionId: activeSession.sessionId },
                    {
                        $set: {
                            isActive: false,
                            endedAt: new Date(),
                            totalMessages: activeSession.messages.length
                        }
                    },
                    { upsert: true }
                );
            } catch (error) {
                console.error('Erreur de sauvegarde de la session:', error);
            }
            
            activeSession.messages = [];
            
            io.emit('session-ended');
            
            activeSession = {
                sessionId: `session_${Date.now()}`,
                participants: [],
                messages: [],
                isActive: true,
                startedAt: new Date()
            };
            
            console.log(`🆕 Nouvelle session créée: ${activeSession.sessionId}`);
        }
    });
});

// ==================== LANCEMENT DU SERVEUR ====================

server.listen(PORT, () => {
    console.log('🚀 Serveur Node.js démarré');
    console.log(`📡 Socket.io disponible sur http://localhost:${PORT}`);
    console.log(`🔑 Secret Key: ${SECRET_KEY.substring(0, 10)}...`);
    console.log(`📊 Session ID: ${activeSession.sessionId}`);
});

// Gestion des erreurs non catchées
process.on('uncaughtException', (error) => {
    console.error('❌ Erreur non gérée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesse rejetée non gérée:', reason);
});
