// routes/auth.js
const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const router = express.Router();
router.post('/insert-sms', (req, res) => {
    console.log('test');
    const {phone_number, sms_code} = req.body;
    if (!phone_number || phone_number.length !== 11 || !containsOnlyNumbers(phone_number)) {
        res.status(500).json({error: 'Неверный номер телефона'});
        return;
    }
    // Проверка наличия существующей записи с тем же номером телефона и временем менее 2 минут назад
    const checkQuery = 'SELECT * FROM SMSVerification WHERE phone_number = ?';
    connection.query(checkQuery, [phone_number], (err, rows) => {
        console.log(rows);
        if (rows.length > 0) {
            const currentTime = new Date();
            const sendDate = new Date(rows[0].added_time);
            const timeDifference = currentTime - sendDate; // Разница в миллисекундах
            console.log('cT:', currentTime, '2:', sendDate);
            console.log(timeDifference);
            if (timeDifference >= 2 * 60 * 1000) {
                console.log('Прошло более 2 минут');
                const deleteQuery = 'DELETE FROM SMSVerification WHERE phone_number = ?';
                connection.query(deleteQuery, [phone_number], (err, result) => {
                    if (err) {
                        console.error('Ошибка при удалении записи: ' + err.message);
                        res.status(500).json({error: 'Ошибка при удалении записи'});
                        return;
                    }

                    // После удаления вставляем новую запись
                    insertNewRecord();
                });
            } else {
                res.status(500).json({error: 'Прошло менее 2 минут'});
            }
        } else {
            // Если запись не существует, сразу вставляем новую запись
            insertNewRecord();
        }
    });

    // Функция для вставки новой записи
    function insertNewRecord() {
        const sms_code = Math.floor(Math.random() * 9000) + 1000;
        const apiKey = 'kz0eeea0ff46739705065c0c7045f1edbf5d6a63ad5f58106936249e536af043c75037';
        const recipient = phone_number;
        const message = 'Ваш код регистрации: ' + sms_code;
        axios.post(`https://api.mobizon.com/service/message/sendSmsMessage?output=json&api=v1&apiKey=${apiKey}`, {
            from: 'Job Job',
            recipient: recipient,
            text: message,
        })
            .then((response) => {
                console.log(response);
                const insertQuery = 'INSERT INTO SMSVerification (phone_number, sms_code) VALUES (?, ?)';
                connection.query(insertQuery, [phone_number, sms_code], (err, result) => {
                    if (err) {
                        console.error('Ошибка вставки записи: ' + err.message);
                        res.status(500).json({error: 'Ошибка вставки записи'});
                    } else {
                        console.log('Запись успешно добавлена');
                        res.status(200).json({message: 'Смс код выслан'});
                    }
                });
            })
            .catch((error) => {
                console.error('Ошибка отправки SMS:', error);
                res.status(500).json({error: 'Ошибка отправки SMS'});
            });
    }

    function containsOnlyNumbers(inputString) {
        // Используем регулярное выражение для проверки, что строка состоит только из цифр
        const regex = /^[0-9]+$/;
        return regex.test(inputString);
    }
});
// Регистрация пользователя
router.post('/update-profile', async (req, res) => {
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
