const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const connection = require('../db');  // Подключите вашу конфигурацию MySQL
const {JWT_SECRET, JWT_SECRET2} = require('../config');

router.post('/add-to-favorites', async (req, res) => {
    try {
        // 1. Получаем ID пользователя из токена
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;

        // 2. Получаем TargetId и Type из тела запроса
        const { TargetId, Type } = req.body;

        // 3. Проверяем валидность входных данных
        if (!TargetId || (Type !== 'j' && Type !== 'r')) {
            return res.status(400).json({ message: 'Invalid input data' });
        }

        // Проверка на дублирование избранного
        const checkDuplicateQuery = 'SELECT * FROM favorites WHERE UserId = ? AND TargetId = ? AND Type = ?';
        connection.query(checkDuplicateQuery, [userId, TargetId, Type], (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                return res.status(400).json({ message: 'Item already added to favorites' });
            } else {
                // 4. Добавляем запись в таблицу избранного
                const addToFavoritesQuery = 'INSERT INTO favorites (UserId, TargetId, Type) VALUES (?, ?, ?)';
                connection.query(addToFavoritesQuery, [userId, TargetId, Type], (error) => {
                    if (error) {
                        console.error(error);
                        return res.status(500).json({ message: 'Server error' });
                    }
                    res.status(200).json({ message: 'Successfully added to favorites' });
                });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.get('/get-favorites', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        if(token.length < 20){
            return res.status(400).json({ message: 'Auth error' })
        } else {


            const decoded = jwt.verify(token, JWT_SECRET);
            const userId = decoded.user.Id;
            const getFavoritesQuery = 'SELECT TargetId, Type FROM favorites WHERE UserId = ? ORDER BY Id DESC';
            connection.query(getFavoritesQuery, [userId], async (error, favoriteItems) => {
                if (error) {
                    console.error(error);
                    return res.status(500).json({message: 'Server error'});
                }

                const resumePromises = [];
                const jobPromises = [];
                favoriteItems.forEach(item => {
                    if (item.Type === 'r') {
                        resumePromises.push(
                            new Promise((resolve, reject) => {
                                const getResumeQuery = `
                                SELECT r.*, u.FullName, u.Email 
                                FROM resumes r
                                INNER JOIN users u ON r.UserId = u.Id
                                WHERE r.Id = ?
                            `;
                                connection.query(getResumeQuery, [item.TargetId], (err, results) => {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve({...item, resumeData: results[0]});
                                    }
                                });
                            })
                        );
                    } else if (item.Type === 'j') {
                        jobPromises.push(
                            new Promise((resolve, reject) => {
                                const getJobQuery = 'SELECT * FROM jobs WHERE Id = ?';
                                connection.query(getJobQuery, [item.TargetId], (err, results) => {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve({...item, jobData: results[0]});
                                    }
                                });
                            })
                        );
                    }
                });

                try {
                    const resumes = await Promise.all(resumePromises);
                    const jobs = await Promise.all(jobPromises);
                    res.status(200).json([...resumes, ...jobs]);
                } catch (err) {
                    console.error(err);
                    res.status(500).json({message: 'Server error during data retrieval'});
                }
            });
        }} catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error...' });
    }
});
router.delete('/remove-from-favorites', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;
        const { TargetId, Type } = req.body;

        if (!TargetId || (Type !== 'j' && Type !== 'r')) {
            return res.status(400).json({ message: 'Invalid input data' });
        }

        const removeFromFavoritesQuery = 'DELETE FROM favorites WHERE UserId = ? AND TargetId = ? AND Type = ?';
        connection.query(removeFromFavoritesQuery, [userId, TargetId, Type], (error, results) => {
            if (error) {
                console.error(error);
                return res.status(500).json({ message: 'Server error' });
            }
            if (results.affectedRows === 0) {
                return res.status(404).json({ message: 'Item not found in favorites' });
            }
            res.status(200).json({ message: 'Successfully removed from favorites' });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
module.exports = router;