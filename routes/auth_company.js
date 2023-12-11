const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const router = express.Router();
const {JWT_SECRET, JWT_SECRET2} = require('../config');
router.post('/getOtp', (req, res) => {
    const {phone_number, sms_code} = req.body;
    if (!phone_number || phone_number.length !== 11 || !containsOnlyNumbers(phone_number)) {
        res.status(500).json({error: 'Неверный номер телефона'});
        return;
    }

    const checkUserExist = 'SELECT * FROM organizations WHERE PhoneNumber = ?';
    connection.query(checkUserExist, [phone_number], (err, usersRows) => {
        if (usersRows.length === 0) {
            // Проверка наличия существующей записи с тем же номером телефона и временем менее 2 минут назад
            const checkQuery = 'SELECT * FROM smsverification WHERE phone_number = ?';
            connection.query(checkQuery, [phone_number], (err, rows) => {
                if (rows && rows.length > 0) {
                    const currentTime = new Date();
                    const sendDate = new Date(rows[0].added_time);
                    const timeDifference = currentTime - sendDate; // Разница в миллисекундах
                    if (timeDifference >= 2 * 60 * 1000) {
                        const deleteQuery = 'DELETE FROM smsverification WHERE phone_number = ?';
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
                const insertQuery = 'INSERT INTO smsverification (phone_number, sms_code) VALUES (?, ?)';
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
router.post('/registerOrganization', async (req, res) => {
    try {
        const { phoneNumber, password, companyName, fullName, whatsAppNumber, email, smsCode } = req.body;

        // Проверка наличия SMS-кода в базе данных
        const checkSMSCode = 'SELECT * FROM smsverification WHERE phone_number = ? AND sms_code = ?';
        connection.query(checkSMSCode, [phoneNumber, smsCode], async (err, rows) => {
            if (err) {
                console.error('Ошибка при проверке SMS-кода: ' + err.message);
                return res.status(500).json({error: 'Ошибка при проверке SMS-кода'});
            }

            if (rows.length > 0) {
                // Хеширование пароля перед сохранением
                const hashedPassword = await bcrypt.hash(password, 10);

                // Вставка данных организации в базу данных
                const insertOrganization = `
                    INSERT INTO organizations (PhoneNumber, Password, CompanyName, FullName, WhatsAppNumber, Email)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;
                connection.query(insertOrganization, [phoneNumber, hashedPassword, companyName, fullName, whatsAppNumber, email], (error, results) => {
                    if (error) {
                        console.error('Ошибка при регистрации организации: ' + error.message);
                        return res.status(500).json({error: 'Ошибка при регистрации организации'});
                    }

                    // Удаление использованного SMS-кода
                    const deleteSMSCode = 'DELETE FROM smsverification WHERE phone_number = ?';
                    connection.query(deleteSMSCode, [phoneNumber], (err) => {
                        if (err) {
                            console.error('Ошибка при удалении SMS-кода: ' + err.message);
                        }
                        // Возвращаем успешный ответ
                        res.status(200).json({ message: 'Организация успешно зарегистрирована' });
                    });
                });
            } else {
                res.status(400).json({error: 'Неверный или истекший SMS-код'});
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;