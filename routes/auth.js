// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const router = express.Router();

// Регистрация пользователя
router.post('/register', async (req, res) => {
    try {
        console.log(req.body);
        const {photo, fullName, birthDate, gender, cityId, phoneNumber, email, password} = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const query = 'INSERT INTO users (Photo, FullName, BirthDate, Gender, cityId, PhoneNumber, Email, Password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        connection.query(query, [photo, fullName, birthDate, gender, cityId, phoneNumber, email, hashedPassword], (error, results) => {
            if (error) {
                console.error(error);
                res.status(500).json({message: error.sqlMessage});
            } else {
                res.status(201).json({message: 'User registered successfully'});
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error4'});
    }
});

// Аутентификация пользователя и выдача токена
router.post('/login', async (req, res) => {
    try {
        const {login, password} = req.body;
        console.log(req.body);
        const query = 'SELECT * FROM users WHERE PhoneNumber = ?';
        connection.query(query, [login], async (error, results) => {
            if (error) {
                res.status(500).json({message: 'Server error2'});
            } else if (results.length === 0) {
                res.status(401).json({message: 'Authentication failed'});
            } else {
                const user = results[0];
                const passwordMatch = await bcrypt.compare(password, user.Password);

                if (passwordMatch) {
                    const token = jwt.sign({userId: user.id}, 'f859b067-c135-42ac-adb6-38489bf0c9d1', {expiresIn: '1h'});
                    res.status(200).json({token});
                } else {
                    res.status(401).json({message: 'Authentication failed'});
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error1'});
    }
});

module.exports = router;
