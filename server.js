// Gerekli modülleri içe aktar
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

// Uygulama ve sunucu kurulumu
const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

  // Kullanıcı sohbete katıldığında
  socket.on('join chat', ({ username, avatarUrl }) => {
    onlineUsers[socket.id] = { username, avatarUrl };
    console.log(`${username} sohbete katıldı.`);
    
    // Tüm istemcilere güncel kullanıcı listesini gönder
    io.emit('update user list', onlineUsers);

    // Yeni kullanıcıya hoş geldin mesajı gönder
    socket.broadcast.emit('chat message', {
        user: 'System',
        text: `${username} sohbete katıldı.`
    });
  });

  // Bir kullanıcı mesaj gönderdiğinde
  socket.on('chat message', (msg) => {
    const userData = onlineUsers[socket.id] || { username: 'Anonymous' };
    io.emit('chat message', { user: userData.username, text: msg, avatarUrl: userData.avatarUrl, timestamp: new Date() });
  });

  // Kullanıcı bağlantısı kesildiğinde
  socket.on('disconnect', () => {
    const userData = onlineUsers[socket.id];
    if (userData) {
      console.log(`${userData.username} ayrıldı.`);
      delete onlineUsers[socket.id];
      // Tüm istemcilere güncel kullanıcı listesini ve ayrılma mesajını gönder
      io.emit('update user list', onlineUsers);
      io.emit('chat message', { user: 'System', text: `${userData.username} sohbetten ayrıldı.` });
    }
  });

  // --- WebRTC Sinyalizasyon Mantığı ---

  // Bir kullanıcıdan gelen teklifi hedef kullanıcıya ilet
  socket.on('webrtc-offer', ({ offer, targetSocketId }) => {
    socket.to(targetSocketId).emit('webrtc-offer', { offer, senderSocketId: socket.id });
  });

  // Bir kullanıcıdan gelen cevabı hedef kullanıcıya ilet
  socket.on('webrtc-answer', ({ answer, targetSocketId }) => {
    socket.to(targetSocketId).emit('webrtc-answer', { answer, senderSocketId: socket.id });
  });

  // Bir kullanıcıdan gelen ICE adayını hedef kullanıcıya ilet
  socket.on('webrtc-ice-candidate', ({ candidate, targetSocketId }) => {
    socket.to(targetSocketId).emit('webrtc-ice-candidate', { candidate, senderSocketId: socket.id });
  });

  // Bir kullanıcı ekran paylaşımını durdurduğunda diğerlerine haber ver
  socket.on('stop-screen-share', () => {
    const userData = onlineUsers[socket.id];
    if (userData) {
      socket.broadcast.emit('user-stopped-sharing', { socketId: socket.id, username: userData.username });
    }
  });
});

// Sunucuyu dinlemeye başla
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});