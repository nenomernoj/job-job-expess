const https = require('https');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const app = express();
const port = 443;
const options = {
    key: fs.readFileSync('key.pem'),     // Путь к вашему ключу
    cert: fs.readFileSync('cert.pem'),    // Путь к вашему сертификату
    passphrase: '11111'
};
// Маршрут для обработки корневого URL
app.get('/', (req, res) => {
    res.send('Привет, мир123!');
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use('/auth', authRoutes); // Роуты для регистрации и аутентификации
app.use('/api', apiRoutes);   // Роуты API для фронтенда

https.createServer(options, app).listen(port, () => {
    console.log(`Сервер Express.js запущен с SSL на порту ${port}`);
});

/*
app.listen(3000, () => {
    console.log('Server is listening on port 3000');
});*/
