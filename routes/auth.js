// routes/auth.js
const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const router = express.Router();
router.post('/getOtp', (req, res) => {
    const {phone_number, sms_code} = req.body;
    if (!phone_number || phone_number.length !== 11 || !containsOnlyNumbers(phone_number)) {
        res.status(500).json({error: 'Неверный номер телефона'});
        return;
    }

    const checkUserExist = 'SELECT * FROM users WHERE PhoneNumber = ?';
    connection.query(checkUserExist, [phone_number], (err, usersRows) => {
        if (usersRows.length === 0) {
            // Проверка наличия существующей записи с тем же номером телефона и временем менее 2 минут назад
            const checkQuery = 'SELECT * FROM SMSVerification WHERE phone_number = ?';
            connection.query(checkQuery, [phone_number], (err, rows) => {
                if (rows.length > 0) {
                    const currentTime = new Date();
                    const sendDate = new Date(rows[0].added_time);
                    const timeDifference = currentTime - sendDate; // Разница в миллисекундах
                    if (timeDifference >= 2 * 60 * 1000) {
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
        } else {
            res.status(500).json({error: 'Такой номер телефона уже зарегистрирован'});
        }
    });

    // Функция для вставки новой записи
    function insertNewRecord() {
        const sms_code = Math.floor(Math.random() * 9000) + 1000;
        const apiKey = 'kz0eeea0ff46739705065c0c7045f1edbf5d6a63ad5f58106936249e536af043c75037';
        const recipient = phone_number;
        const message = 'Job Job, код регистрации : ' + sms_code;
        axios.post(`https://api.mobizon.kz/service/message/sendSmsMessage?output=json&api=v1&apiKey=${apiKey}`, {
            recipient: recipient, text: message,
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        })
            .then((response) => {
                const insertQuery = 'INSERT INTO SMSVerification (phone_number, sms_code) VALUES (?, ?)';
                connection.query(insertQuery, [phone_number, sms_code], (err, result) => {
                    if (err) {
                        console.error('Ошибка вставки записи: ' + err.message);
                        res.status(500).json({error: 'Ошибка вставки записи'});
                    } else {
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
        const {fullName, birthDate, gender, cityId, email} = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const query = 'INSERT INTO users (Photo, FullName, BirthDate, Gender, cityId, Email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
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
router.post('/login', (req, res) => {
    try {
        const {phone_number, password} = req.body;
        const query = 'SELECT * FROM users WHERE PhoneNumber = ?';
        connection.query(query, [phone_number], async (error, results) => {
            if (error) {
                res.status(500).json({message: 'Server error'});
                return;
            }

            if (results.length === 0) {
                res.status(401).json({message: 'Authentication failed1'});
                return;
            }

            const user = results[0];
            const passwordMatch = await bcrypt.compare(password, user.Password);

            if (!passwordMatch) {
                res.status(401).json({message: 'Authentication failed2'});
                return;
            }
            delete user.Password;
            // Если аутентификация успешна, генерируем токены
            const accessToken = jwt.sign({user}, 'f859b067-c135-42ac-adb6-38489bf0c9d1', {expiresIn: '1h'});
            const refreshToken = jwt.sign({userId: user.Id}, 'f859b067-c135-42ac-adb6-38489bf0c9d2', {expiresIn: '7d'});

            // Сохраняем refresh token в базе данных
            const insertQuery = 'INSERT INTO refresh_tokens (userId, token) VALUES (?, ?)';
            connection.query(insertQuery, [user.Id, refreshToken], (insertError) => {
                if (insertError) {
                    console.log(insertError);
                    res.status(500).json({message: 'Server error during refresh token storage'});
                    return;
                }

                res.status(200).json({accessToken, refreshToken});
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/refresh-token', (req, res) => {
    try {
        const oldRefreshToken = req.body.refreshToken;
        if (!oldRefreshToken) {
            return res.status(401).json({message: 'Refresh token is required'});
        }

        // Проверяем refresh token в вашей базе данных
        const query = 'SELECT * FROM refresh_tokens WHERE token = ?';
        connection.query(query, [oldRefreshToken], (error, results) => {
            if (error || results.length === 0) {
                return res.status(401).json({message: 'Invalid refresh token'});
            }

            // Если refresh token валиден, верифицируем его
            jwt.verify(oldRefreshToken, 'f859b067-c135-42ac-adb6-38489bf0c9d2', (err, user) => {
                if (err) {
                    return res.status(403).json({message: 'Invalid refresh token'});
                }
                // Генерируем новую пару токенов
                const userQuery = 'SELECT * FROM users WHERE id = ?';
                connection.query(userQuery, [user.userId], async (userError, userResults) => {
                    if (userError || userResults.length === 0) {
                        return res.status(500).json({message: 'Unable to retrieve user information'});
                    }

                    const user = userResults[0];
                    delete user.Password;
                    const newAccessToken = jwt.sign({user}, 'f859b067-c135-42ac-adb6-38489bf0c9d1', {expiresIn: '1h'});
                    const newRefreshToken = jwt.sign({userId: user.Id}, 'f859b067-c135-42ac-adb6-38489bf0c9d2', {expiresIn: '7d'});

                    // Удаляем старый refresh token из базы данных
                    const deleteQuery = 'DELETE FROM refresh_tokens WHERE token = ?';
                    connection.query(deleteQuery, [oldRefreshToken], (deleteError) => {
                        if (deleteError) {
                            return res.status(500).json({message: 'Server error during old refresh token removal'});
                        }

                        // Сохраняем новый refresh token в базе данных
                        console.log('RT: ', user);
                        const insertQuery = 'INSERT INTO refresh_tokens (userId, token) VALUES (?, ?)';
                        connection.query(insertQuery, [user.Id, newRefreshToken], (insertError) => {
                            if (insertError) {
                                console.log(insertError);
                                return res.status(500).json({message: 'Server error during new refresh token storage'});
                            }

                            res.json({accessToken: newAccessToken, refreshToken: newRefreshToken});
                        });
                    });
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/verify-and-register', (req, res) => {
    try {
        const {sms_code, phone_number, password} = req.body;

        // Проверяем наличие SMS-кода
        const verificationQuery = 'SELECT * FROM smsverification WHERE phone_number = ? AND sms_code = ?';
        connection.query(verificationQuery, [phone_number, sms_code], async (verificationError, verificationResults) => {
            if (verificationError) {
                res.status(500).json({message: 'Server error during verification'});
                return;
            }

            if (verificationResults.length === 0) {
                res.status(401).json({message: 'Invalid phone_number or sms_code'});
                return;
            }

            // Удаляем запись из таблицы smsverification
            const deleteQuery = 'DELETE FROM smsverification WHERE phone_number = ? AND sms_code = ?';
            connection.query(deleteQuery, [phone_number, sms_code], async (deleteError) => {
                if (deleteError) {
                    res.status(500).json({message: 'Server error during deletion'});
                    return;
                }

                // Хэшируем пароль перед сохранением
                const hashedPassword = await bcrypt.hash(password, 10);

                // Добавляем пользователя в таблицу users
                const insertQuery = 'INSERT INTO users (PhoneNumber, Password) VALUES (?, ?)';
                connection.query(insertQuery, [phone_number, hashedPassword], (insertError) => {
                    if (insertError) {
                        res.status(500).json({message: 'Server error during user registration'});
                        return;
                    }

                    res.status(200).json({message: 'User registered successfully'});
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
module.exports = router;
