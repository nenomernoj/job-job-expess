const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const app = express();
const port = 3000; // Порт, на котором будет работать сервер
// Маршрут для обработки корневого URL
app.get('/', (req, res) => {
    res.send('Привет, мир123!');
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use('/auth', authRoutes); // Роуты для регистрации и аутентификации
app.use('/api', apiRoutes);   // Роуты API для фронтенда

app.listen(3000, () => {
    console.log('Server is listening on port 3000');
});