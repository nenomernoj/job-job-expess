const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const profileRoutes = require('./routes/profile');
const resumesRoutes = require('./routes/resumes');
const jobsRoutes = require('./routes/job');
const adminRoutes = require('./routes/admin')
const favoritesRoutes = require('./routes/favorites');
const authOrgRoutes = require('./routes/auth_company');
const app = express();
const port = 3000; // Порт, на котором будет работать сервер
// Маршрут для обработки корневого URL
app.get('/', (req, res) => {
    res.send('work');
});
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use('/auth', authRoutes); // Роуты для регистрации и аутентификации
app.use('/profile', profileRoutes);   // Роуты API для фронтенда*/
app.use('/resumes', resumesRoutes);
app.use('/jobs', jobsRoutes);
app.use('/adminApi', adminRoutes);
app.use('/favorites', favoritesRoutes);
app.use('/org', authOrgRoutes);
app.use('/images', express.static('processed_images'));
app.listen(3000, () => {
    console.log('Server is listening on port 3000');
});