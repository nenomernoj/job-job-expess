const express = require('express');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const fs = require('fs');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const upload = multer({dest: 'uploads/'}); // это временное хранилище для загружаемых изображений
const {JWT_SECRET, JWT_SECRET2} = require('../config');
router.put('/update-user', (req, res) => {
    try {
        // 1. Извлеките токен из заголовка авторизации
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({message: 'Authorization header is missing'});
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({message: 'Token is missing'});
        }

        // 2. Верифицируйте токен
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({message: 'Invalid token'});
            }

            const userId = decoded.user.Id;
            // 3. Используйте userId, чтобы обновить информацию в базе данных
            const {fullName, birthDate, gender, cityId, email} = req.body;
            const updateQuery = 'UPDATE users SET FullName = ?, BirthDate = ?, Gender = ?, CityId = ?, Email = ? WHERE id = ?';

            connection.query(updateQuery, [fullName, birthDate, gender, cityId, email, userId], (error) => {
                if (error) {
                    console.log(error);
                    return res.status(500).json({message: 'Error updating user information'});
                }

                res.status(200).json({message: 'User information updated successfully'});
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
        // 1. Проверяем и верифицируем токен
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({message: 'Authorization header is missing'});
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({message: 'Token is missing'});
        }

        jwt.verify(token, JWT_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(403).json({message: 'Invalid token'});
            }

            const userId = decoded.user.Id;

            // 2. Обработка и сохранение изображения
            const processedImageBuffer = await sharp(req.file.path)
                .resize(400, 400, {
                    fit: 'cover',
                    position: 'center'
                })
                .toBuffer();
            // Путь для сохранения изображения на сервере
            const imageName = `${req.file.filename}.jpg`;
            const localImagePath = `processed_images/${imageName}`;
            await sharp(processedImageBuffer).toFile(localImagePath);

            // Полный путь для доступа к изображению через веб
            const baseImageUrl = 'https://api.bashunter.kz/images/';
            const fullImageUrl = baseImageUrl + imageName;
            fs.unlink(req.file.path, err => {
                if (err) {
                    console.error('Error while deleting the temporary file:', err);
                } else {
                    console.log('Temporary file deleted successfully');
                }
            });
            // Обновление пути изображения в базе данных для пользователя

            const oldImageQuery = 'SELECT photo FROM users WHERE id = ?';
            connection.query(oldImageQuery, [userId], (error, results) => {
                if (error) {
                    console.error('Error fetching old image path:', error);
                    return;
                }

                if (results[0].photo) {
                    const oldImagePath = results[0].photo;  // предполагаем, что это полный URL
                    const oldImageFileName = oldImagePath.split('/').pop();  // извлекаем имя файла из URL

                    fs.unlink(`processed_images/${oldImageFileName}`, err => {
                        if (err) {
                            console.error('Error while deleting the old profile image:', err);
                        } else {
                            console.log('Old profile image deleted successfully');
                        }
                    });
                }

                const updateQuery = 'UPDATE users SET photo = ? WHERE id = ?';
                connection.query(updateQuery, [fullImageUrl, userId], (error) => {
                    if (error) {
                        return res.status(500).json({message: 'Error updating user photo'});
                    }

                    res.status(200).json({message: 'Profile image updated successfully', imagePath: fullImageUrl});
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.delete('/deleteUser', (req, res) => {
    try {
        // 1. Извлеките токен из заголовка авторизации
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({message: 'Authorization header is missing'});
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({message: 'Token is missing'});
        }

        // 2. Верифицируйте токен
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({message: 'Invalid token'});
            }

            const userId = decoded.user.Id;
            // 3. Используйте userId, чтобы обновить информацию в базе данных
            const deleteUserQuery = 'DELETE FROM users WHERE Id = ?';

            connection.query(deleteUserQuery, [userId], (error) => {
                if (error) {
                    console.log(error);
                    return res.status(500).json({message: 'Error updating user information'});
                }

                res.status(200).json({message: 'Deleted!'});
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
module.exports = router;
