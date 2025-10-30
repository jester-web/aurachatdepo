// Gerekli modülleri içe aktar
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mongoose = require('mongoose');

// Uygulama ve sunucu kurulumu
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- MongoDB Bağlantısı ---
const MONGO_URI = 'mongodb://localhost:27017/chatdb'; // Veritabanı adı burada belirtilir

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB bağlantısı başarılı.'))
  .catch(err => console.error('MongoDB bağlantı hatası:', err));

// --- Mesaj Şeması ve Modeli ---
const MessageSchema = new mongoose.Schema({
  username: String,
  text: String,
  avatarUrl: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema); // 'messages' koleksiyonu otomatik oluşur

// 'public' klasörünü statik dosyalar için sun
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa için yönlendirme
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Kullanıcıları saklamak için bir obje (socket.id -> { username, avatarUrl })
const onlineUsers = {};

// Socket.IO bağlantı mantığı
io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı:', socket.id);

  // Yeni bağlanan kullanıcıya eski mesajları gönder
  Message.find().sort({ timestamp: -1 }).limit(50).exec()
    .then(messages => {
      // Mesajları en eskiden en yeniye doğru göndermek için diziyi ters çeviriyoruz.
      socket.emit('load old messages', messages.reverse());
    })
    .catch(err => {
      console.error('Eski mesajlar yüklenirken hata:', err);
    });


  // Kullanıcı sohbete katıldığında
  socket.on('join chat', ({ username, avatarUrl }) => {
    onlineUsers[socket.id] = { username, avatarUrl };
    console.log(`${username} sohbete katıldı.`);
    
    // Tüm istemcilere güncel kullanıcı listesini gönder
    io.emit('update user list', onlineUsers);

    // Yeni kullanıcıya hoş geldin mesajı gönder
    socket.broadcast.emit('chat message', {
        username: 'System', // 'user' yerine 'username' kullan
        text: `${username} sohbete katıldı.`,
    });
  });

  // Bir kullanıcı mesaj gönderdiğinde
  socket.on('chat message', (msg) => {
    const userData = onlineUsers[socket.id] || { username: 'Anonymous', avatarUrl: '' };
    const messageData = {
      username: userData.username,
      text: msg, // 'text' alanı istemci tarafından bekleniyor
      avatarUrl: userData.avatarUrl,
      timestamp: new Date()
    };

    // Mesajı veritabanına kaydet
    const newMessage = new Message(messageData);
    newMessage.save();

    io.emit('chat message', messageData);
  });

  // Kullanıcı bağlantısı kesildiğinde
  socket.on('disconnect', () => {
    const userData = onlineUsers[socket.id];
    if (userData) {
      console.log(`${userData.username} ayrıldı.`);
      delete onlineUsers[socket.id];
      // Tüm istemcilere güncel kullanıcı listesini ve ayrılma mesajını gönder
      io.emit('update user list', onlineUsers);
      io.emit('chat message', { username: 'System', text: `${userData.username} sohbetten ayrıldı.` });
    }
  });

  // --- WebRTC Sinyalizasyon Mantığı ---

  // Bir kullanıcıdan gelen teklifi hedef kullanıcıya ilet
  socket.on('webrtc-offer', ({ offer, targetSocketId }) => { // İstemciden gelen olayı dinle
    // Hedef kullanıcıya teklifi ve gönderenin ID'sini yolla
    socket.to(targetSocketId).emit('webrtc-offer', { offer, senderSocketId: socket.id });
  });

  // Bir kullanıcıdan gelen cevabı hedef kullanıcıya ilet
  socket.on('webrtc-answer', ({ answer, targetSocketId }) => {
    // Hedef kullanıcıya cevabı ve gönderenin ID'sini yolla
    socket.to(targetSocketId).emit('webrtc-answer', { answer, senderSocketId: socket.id });
  });

  // Bir kullanıcıdan gelen ICE adayını hedef kullanıcıya ilet
  socket.on('webrtc-ice-candidate', ({ candidate, targetSocketId }) => {
    // Hedef kullanıcıya adayı ve gönderenin ID'sini yolla
    socket.to(targetSocketId).emit('webrtc-ice-candidate', { candidate, senderSocketId: socket.id });
  });

  // Bir kullanıcı ekran paylaşımını durdurduğunda diğerlerine haber ver
  socket.on('stop-screen-share', () => {
    const userData = onlineUsers[socket.id];
    if (userData) {
      socket.broadcast.emit('user-stopped-sharing', { socketId: socket.id, username: userData.username });
    }
  });

  // Kullanıcı konuşmaya başladığında/durduğunda diğerlerine haber ver
  socket.on('speaking', (isSpeaking) => {
    socket.broadcast.emit('user-speaking', { socketId: socket.id, isSpeaking });
  });

  // Özel mesajları yönlendir
  socket.on('private message', ({ recipientUsername, message }) => {
    const senderData = onlineUsers[socket.id];
    const recipientSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id].username === recipientUsername);

    if (recipientSocketId) {
      // Alıcıya ve gönderene özel mesajı gönder
      io.to(recipientSocketId).emit('chat message', { type: 'private', user: senderData.username, recipient: recipientUsername, text: message });
      socket.emit('chat message', { type: 'private', user: senderData.username, recipient: recipientUsername, text: message });
    }
  });
});

// Sunucuyu dinlemeye başla
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});