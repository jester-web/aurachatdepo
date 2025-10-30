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
});

// Sunucuyu dinlemeye başla
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});