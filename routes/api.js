// routes/api.js
const express = require('express');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const router = express.Router();

// Пример защищенного маршрута, требующего валидный Bearer-токен
router.get('/protected', verifyToken, (req, res) => {
    res.status(200).json({ message: 'Access granted to protected route' });
});

// Middleware для проверки Bearer-токена
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    jwt.verify(token, JWT_SECRET, (error, decoded) => {
        if (error) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        req.userId = decoded.userId;
        next();
    });
}

module.exports = router;
