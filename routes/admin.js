const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const express = require("express");
const {JWT_SECRET} = require("../config");
const router = express.Router();
// Транспорт для nodemailer
const allowedPhones = ['77078528400', '77068180777', '77711737021'];
const connection = require('../db');
const sharp = require("sharp");
const fs = require("fs");
const multer = require("multer");  // Подключите вашу конфигурацию MySQL
const upload = multer({dest: 'uploads/'});
router.post('/addUser', async (req, res) => {
    try {
        // 1. Авторизация по токену
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET); // Вместо 'YOUR_SECRET_KEY' укажите ваш секретный ключ
        const authorizedPhoneNumber = decoded.user.PhoneNumber;

        // 2. Проверка номера телефона
        // Здесь перечислены номера телефонов, которым разрешено добавлять пользователей
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied'});
        }

        // 3. Генерация пароля
        const generatedPassword = crypto.randomBytes(5).toString('hex');
        const {fullName, birthDate, gender, cityId, phoneNumber, email} = req.body;
        // 4. Отправка пароля на почту
        const insertUserQuery = `
            INSERT INTO users (
                FullName, BirthDate, Gender, CityId, PhoneNumber, Email, Password
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        connection.query(insertUserQuery, [fullName, birthDate, gender, cityId, phoneNumber, email, generatedPassword], (error, results) => {
            if (error) {
                console.log(error);
                if (error.errno === 1062) {
                    return res.status(500).json({message: 'Уже зарегистрирован'});
                } else {
                    return res.status(500).json({message: error});
                }
            } else {
                return res.status(200).json({
                    message: 'Успешно зарегистрирован', insertedId: results.insertId
                });
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.put('/updateUser', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;

        // Проверка телефона из списка разрешенных
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        const {fullName, birthDate, gender, cityId, phoneNumber, email, id} = req.body;

        const updateUserQuery = `
            UPDATE users
            SET FullName = ?, BirthDate = ?, Gender = ?, CityId = ?, PhoneNumber = ?, Email = ?
            WHERE Id = ?;
        `;

        connection.query(updateUserQuery, [fullName, birthDate, gender, cityId, phoneNumber, email, id], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error', error});
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({message: 'User not found.'});
            }

            res.status(200).json({message: 'User updated successfully.'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.delete('/deleteUser', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;

        // Проверка телефона из списка разрешенных
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        const {id} = req.body;

        const deleteUserQuery = 'DELETE FROM users WHERE Id = ?';

        connection.query(deleteUserQuery, [id], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error', error});
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({message: 'User not found.'});
            }

            res.status(200).json({message: 'User deleted successfully.'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.get('/users', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const currentUserId = decoded.user.Id;
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const getUsersQuery = `
            SELECT Id, FullName, BirthDate, Gender, CityId, PhoneNumber, Email
            FROM users
            WHERE Id != ?;
        `;

        connection.query(getUsersQuery, [currentUserId], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error', error});
            }

            res.status(200).json(results);
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.get('/getUserById/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        const userId = req.params.id;

        // Сначала получите информацию о пользователе
        connection.query('SELECT * FROM users WHERE Id = ?', [userId], (userError, userResults) => {
            if (userError) {
                return res.status(500).json({message: 'Server error'});
            }
            if (userResults.length === 0) {
                return res.status(404).json({message: 'User not found'});
            }

            const user = userResults[0];

            const getResumesQuery = `
                SELECT 
                    r.Id, r.Information, 
                    u.FullName, u.BirthDate, u.Gender, u.CityId, u.PhoneNumber, u.Email,
                    GROUP_CONCAT(DISTINCT rc.Id, '|', rc.CategoryId) AS categories,
                    GROUP_CONCAT(DISTINCT e.Id, '|', e.SchoolName, '|', e.Specialization, '|', e.GraduationYear) AS education,
                    GROUP_CONCAT(DISTINCT l.Id, '|', l.LanguageName, '|', l.ProficiencyLevel) AS languages,
                    GROUP_CONCAT(DISTINCT s.Id, '|', s.SkillName) AS skills,
                    GROUP_CONCAT(DISTINCT we.Id, '|', we.EmployerName, '|', we.Period, '|', we.Description) AS workExperience
                FROM resumes r
                INNER JOIN users u ON r.UserId = u.Id
                LEFT JOIN resume_categories rc ON r.Id = rc.ResumeId
                LEFT JOIN education e ON r.Id = e.ResumeId
                LEFT JOIN languages l ON r.Id = l.ResumeId
                LEFT JOIN skills s ON r.Id = s.ResumeId
                LEFT JOIN workexperience we ON r.Id = we.ResumeId
                WHERE r.UserId = ?
                GROUP BY r.Id
            `;

            connection.query(getResumesQuery, [userId], (resumeError, resumeResults) => {
                if (resumeError) {
                    return res.status(500).json({message: 'Server error'});
                }

                const detailedResumes = resumeResults.map(resume => {
                    return {
                        ...resume, categories: resume.categories ? resume.categories.split(',').map(e => {
                            const [Id, CategoryId] = e.split('|');
                            return {Id, CategoryId};
                        }) : [], education: resume.education ? resume.education.split(',').map(e => {
                            const [Id, SchoolName, Specialization, GraduationYear] = e.split('|');
                            return {Id, SchoolName, Specialization, GraduationYear};
                        }) : [], languages: resume.languages ? resume.languages.split(',').map(l => {
                            const [Id, LanguageName, ProficiencyLevel] = l.split('|');
                            return {Id, LanguageName, ProficiencyLevel};
                        }) : [], skills: resume.skills ? resume.skills.split(',').map(s => {
                            const [Id, SkillName] = s.split('|');
                            return {Id, SkillName};
                        }) : [], workExperience: resume.workExperience ? resume.workExperience.split(',').map(we => {
                            const [Id, EmployerName, Period, Description] = we.split('|');
                            return {Id, EmployerName, Period, Description};
                        }) : []
                    };
                });

                // Объедините пользовательские данные с данными резюме
                const responseData = {
                    ...user, resumes: detailedResumes
                };

                res.status(200).json(responseData);
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/createResume', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];  // Извлечь токен из заголовка 'Authorization'
    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        // Проверка JWT токена
        const decoded = jwt.verify(token, JWT_SECRET);  // Замените 'your_jwt_secret' на ваш секретный ключ
        const currentUserId = decoded.user.Id;
        const authorizedPhoneNumber = decoded.user.PhoneNumber;


        // Получение информации из тела запроса
        const {information, id} = req.body;
        const userId = id;  // Получите ID пользователя из декодированного токена
        // Проверка, предоставил ли пользователь информацию
        if (!information) {
            return res.status(400).json({message: 'Information field is required'});
        }

        // SQL-запрос для добавления нового резюме
        const query = 'INSERT INTO resumes (Information, UserId) VALUES (?, ?)';
        connection.query(query, [information, userId], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            res.status(200).json({message: 'Resume successfully created', resumeId: results.insertId});
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.post('/experience', (req, res) => {
    const token = req.headers.authorization.split(' ')[1]; // Извлекаем токен из заголовка 'Authorization'

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        // Проверка JWT токена
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        // Получение данных из тела запроса
        const {EmployerName, Period, Description, ResumeId} = req.body;

        // Проверка, предоставлены ли все необходимые поля
        if (!EmployerName || !Period || !Description || !ResumeId) {
            return res.status(400).json({message: 'All fields are required'});
        }
        const insertQuery = 'INSERT INTO workexperience (EmployerName, Period, Description, ResumeId) VALUES (?, ?, ?, ?)';
        connection.query(insertQuery, [EmployerName, Period, Description, ResumeId], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            res.status(200).json({
                message: 'Work experience successfully added', workExperienceId: results.insertId
            });
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.put('/experience/:id', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const {EmployerName, Period, Description, ResumeId} = req.body;
        const workExperienceId = req.params.id;
        const updateQuery = 'UPDATE workexperience SET EmployerName = ?, Period = ?, Description = ?, ResumeId = ? WHERE Id = ?';
        connection.query(updateQuery, [EmployerName, Period, Description, ResumeId, workExperienceId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            res.status(200).json({message: 'Work experience successfully updated'});
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.delete('/experience/:id', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const workExperienceId = req.params.id;
        const deleteQuery = 'DELETE FROM workexperience WHERE Id = ?';
        connection.query(deleteQuery, [workExperienceId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            res.status(200).json({message: 'Work experience successfully deleted'});
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.post('/education', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        const {SchoolName, Specialization, GraduationYear, ResumeId} = req.body;

        if (!SchoolName || !Specialization || !GraduationYear || !ResumeId) {
            return res.status(400).json({message: 'All fields are required'});
        }
        const insertQuery = 'INSERT INTO education (SchoolName, Specialization, GraduationYear, ResumeId) VALUES (?, ?, ?, ?)';
        connection.query(insertQuery, [SchoolName, Specialization, GraduationYear, ResumeId], (error, results) => {
            if (error) {
                console.log(error);
                return res.status(500).json({message: 'Server error'});
            }

            res.status(200).json({message: 'Education successfully added', educationId: results.insertId});
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.put('/education/:id', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const {SchoolName, Specialization, GraduationYear, ResumeId} = req.body;
        const educationId = req.params.id;

        const checkQuery = 'SELECT resumes.UserId FROM education JOIN resumes ON education.ResumeId = resumes.Id WHERE education.Id = ?';
        const updateQuery = 'UPDATE education SET SchoolName = ?, Specialization = ?, GraduationYear = ?, ResumeId = ? WHERE Id = ?';
        connection.query(updateQuery, [SchoolName, Specialization, GraduationYear, ResumeId, educationId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            res.status(200).json({message: 'Education successfully updated'});
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.delete('/education/:id', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const educationId = req.params.id;
        const deleteQuery = 'DELETE FROM education WHERE Id = ?';
        connection.query(deleteQuery, [educationId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            res.status(200).json({message: 'Education successfully deleted'});
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.post('/language', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const {LanguageName, ProficiencyLevel, ResumeId} = req.body;
        const query = 'INSERT INTO languages (LanguageName, ProficiencyLevel, ResumeId) VALUES (?, ?, ?)';
        connection.query(query, [LanguageName, ProficiencyLevel, ResumeId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Language added successfully'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.put('/language/:id', async (req, res) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        const {LanguageName, ProficiencyLevel, ResumeId} = req.body;
        const languageId = req.params.id;
        const updateQuery = 'UPDATE languages SET LanguageName = ?, ProficiencyLevel = ?, ResumeId = ? WHERE Id = ?';
        connection.query(updateQuery, [LanguageName, ProficiencyLevel, ResumeId, languageId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Language updated successfully'});
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.delete('/language/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        const languageId = req.params.id;
        // Проверяем владельца резюме перед удалением языка
        const deleteQuery = 'DELETE FROM languages WHERE Id = ?';
        connection.query(deleteQuery, [languageId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Language deleted successfully'});
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/skill', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }

        const {SkillName, ResumeId} = req.body;

        const addQuery = 'INSERT INTO skills (SkillName, ResumeId) VALUES (?, ?)';
        connection.query(addQuery, [SkillName, ResumeId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Skill added successfully'});
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.put('/skill/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const {SkillName} = req.body;
        const skillId = req.params.id;
        const updateQuery = 'UPDATE skills SET SkillName = ? WHERE Id = ?';
        connection.query(updateQuery, [SkillName, skillId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Skill updated successfully'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.delete('/skill/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const skillId = req.params.id;
        const deleteQuery = 'DELETE FROM skills WHERE Id = ?';
        connection.query(deleteQuery, [skillId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Skill deleted successfully'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/category', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const {ResumeId, CategoryId} = req.body;

        // Проверяем принадлежность резюме текущему пользователю
        const resumeOwnerCheckQuery = 'SELECT UserId FROM resumes WHERE Id = ?';
        connection.query(resumeOwnerCheckQuery, [ResumeId], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            if (results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'You are not authorized to modify this resume.'});
            }
            const insertQuery = 'INSERT INTO resume_categories (ResumeId, CategoryId) VALUES (?, ?)';
            connection.query(insertQuery, [ResumeId, CategoryId], (error, results) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(201).json({message: 'Category added to resume successfully.'});
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.delete('/category/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const categoryId = req.params.id;
        const deleteQuery = 'DELETE FROM resume_categories WHERE Id = ?';
        connection.query(deleteQuery, [categoryId], (error) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Category removed from resume successfully'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.get('/category', (req, res) => {
    let selectQuery = 'SELECT * FROM categories';
    connection.query(selectQuery, (error, results) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        res.status(200).json(results);
    });
});
router.delete('/categoryDelete/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const categoryId = req.params.id;
        const deleteQuery = 'DELETE FROM categories WHERE Id = ?';
        connection.query(deleteQuery, [categoryId], (error) => {
            if (error) {
                console.log(error);
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Category removed from resume successfully'});
        });
    } catch (error) {
        console.error(error);
        res.status(401).json({message: 'Server error'});
    }
});
router.post('/categoryAdd', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        if (!allowedPhones.includes(authorizedPhoneNumber)) {
            return res.status(403).json({message: 'Access denied.'});
        }
        const {ResumeId, CategoryId} = req.body;
        const categoryExistsQuery = 'SELECT * FROM resume_categories WHERE ResumeId = ? AND CategoryId = ?';
        connection.query(categoryExistsQuery, [ResumeId, CategoryId], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            if (results.length > 0) {
                return res.status(400).json({message: 'This category already exists for the resume.'});
            }

            // Если все проверки пройдены, добавляем новую категорию к резюме
            const insertQuery = 'INSERT INTO resume_categories (ResumeId, CategoryId) VALUES (?, ?)';
            connection.query(insertQuery, [ResumeId, CategoryId], (error, results) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(201).json({message: 'Category added to resume successfully.'});
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.delete('/categoryDel/:id', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const authorizedPhoneNumber = decoded.user.PhoneNumber;
        const Id = req.params.id;
        const deleteQuery = 'DELETE FROM resume_categories WHERE Id = ?';
        connection.query(deleteQuery, [Id], (error) => {
            if (error) {
                console.error(error);
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Category removed from resume successfully'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});


router.post('/addOrgCat', (req, res) => {
    const {CategoryId, CompanyId, EndDate} = req.body;
    const query = `
        INSERT INTO OrganizationCategories (CategoryId, CompanyId, EndDate) 
        VALUES (?, ?, ?)
    `;

    connection.query(query, [CategoryId, CompanyId, EndDate || null], (error, results) => {
        if (error) {
            console.error('Error adding organization category:', error);
            return res.status(500).json({message: 'Error adding organization category'});
        }
        res.status(201).json({message: 'Organization category added successfully', id: results.insertId});
    });
});

router.get('/getOrgsCats', (req, res) => {
    const query = `
        SELECT oc.Id, oc.CategoryId, oc.CompanyId, oc.EndDate, c.Name AS CategoryName, o.CompanyName
        FROM OrganizationCategories oc
        JOIN categories c ON oc.CategoryId = c.Id
        JOIN organizations o ON oc.CompanyId = o.Id
    `;

    connection.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching organization categories:', error);
            return res.status(500).json({message: 'Error fetching organization categories'});
        }
        res.status(200).json(results);
    });
});

router.delete('/deleteOrgCat/:id', (req, res) => {
    const {id} = req.params;
    const sql = `DELETE FROM OrganizationCategories WHERE Id = ?`;
    connection.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Ошибка при удалении связи:', error);
            return res.status(500).json({message: 'Ошибка при удалении связи'});
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({message: 'Связь не найдена'});
        }
        res.status(200).json({message: 'Связь успешно удалена'});
    });
});

router.get('/getOrgsList', (req, res) => {
    const sql = 'SELECT * FROM organizations';
    connection.query(sql, (error, results) => {
        if (error) {
            console.error('Ошибка при получении списка организаций:', error);
            res.status(500).json({message: 'Ошибка при получении списка организаций'});
            return;
        }
        res.json(results);
    });
});

router.get('/candidates', (req, res) => {
    const sql = 'SELECT * FROM candidates';
    connection.query(sql, (error, results) => {
        if (error) {
            console.error('Ошибка при получении списка кандидатов:', error);
            res.status(500).json({message: 'Ошибка при получении списка кандидатов'});
            return;
        }
        res.json(results);
    });
});
router.post('/candidates', (req, res) => {
    const {
        fullName,
        phone,
        email,
        cityId,
        birthDate,
        photo,
        position,
        categoryId,
        comment,
        aboutMe,
        workExperienceYears,
        additionalInfo
    } = req.body;
    const sql = 'INSERT INTO candidates (fullName, phone, email, cityId, birthDate, photo, position, categoryId, comment, aboutMe, workExperienceYears, additionalInfo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    connection.query(sql, [fullName, phone, email, cityId, birthDate, photo, position, categoryId, comment, aboutMe, workExperienceYears, additionalInfo], (error, results) => {
        if (error) {
            console.error('Ошибка при создании кандидата:', error);
            res.status(500).json({message: 'Ошибка при создании кандидата'});
            return;
        }
        res.status(201).json({message: 'Кандидат успешно создан', id: results.insertId});
    });
});
router.put('/candidates/:id', (req, res) => {
    const {
        fullName,
        phone,
        email,
        cityId,
        birthDate,
        position,
        categoryId,
        comment,
        aboutMe,
        workExperienceYears,
        additionalInfo
    } = req.body;
    const {id} = req.params;
    const sql = 'UPDATE candidates SET fullName = ?, phone = ?, email = ?, cityId = ?, birthDate = ?, photo = ?, position = ?, categoryId = ?, comment = ?, aboutMe = ?, workExperienceYears = ?, additionalInfo = ? WHERE id = ?';
    connection.query(sql, [fullName, phone, email, cityId, birthDate, position, categoryId, comment, aboutMe, workExperienceYears, additionalInfo, id], (error, results) => {
        if (error) {
            console.error('Ошибка при редактировании кандидата:', error);
            res.status(500).json({message: 'Ошибка при редактировании кандидата'});
            return;
        }
        if (results.affectedRows === 0) {
            res.status(404).json({message: 'Кандидат не найден'});
            return;
        }
        res.json({message: 'Кандидат успешно обновлен'});
    });
});
router.delete('/candidates/:id', (req, res) => {
    const {id} = req.params;
    const sql = 'DELETE FROM candidates WHERE id = ?';
    connection.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Ошибка при удалении кандидата:', error);
            res.status(500).json({message: 'Ошибка при удалении кандидата'});
            return;
        }
        if (results.affectedRows === 0) {
            res.status(404).json({message: 'Кандидат не найден'});
            return;
        }
        res.json({message: 'Кандидат успешно удален'});
    });
});

router.post('/upload-candidate-image/:id', upload.single('file'), async (req, res) => {
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
            const {id} = req.params;
            const userId = id;

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

            const oldImageQuery = 'SELECT photo FROM candidates WHERE id = ?';
            connection.query(oldImageQuery, [userId], (error, results) => {
                if (error) {
                    console.error('Error fetching old image path:', error);
                    return;
                }

                if (results[0] && results[0].photo) {
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

                const updateQuery = 'UPDATE candidates SET photo = ? WHERE id = ?';
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
router.get('/candidate/:id', async (req, res) => {
    const { id } = req.params;

    // Запрос данных кандидата
    const candidateQuery = 'SELECT * FROM candidates WHERE id = ?';

    // Запрос опыта работы кандидата
    const experienceQuery = 'SELECT * FROM work_experience WHERE candidateId = ?';

    // Запрос образования кандидата
    const educationQuery = 'SELECT * FROM work_education WHERE candidateId = ?';

    // Запрос навыков кандидата
    const skillsQuery = 'SELECT * FROM work_skills WHERE candidateId = ?';

    try {
        // Получаем основные данные кандидата
        connection.query(candidateQuery, [id], (err, candidateResults) => {
            if (err) {
                console.error('Error fetching candidate:', err);
                return res.status(500).json({ message: 'Error fetching candidate' });
            }

            if (candidateResults.length === 0) {
                return res.status(404).json({ message: 'Candidate not found' });
            }

            const candidate = candidateResults[0];

            // Получаем опыт работы
            connection.query(experienceQuery, [id], (err, experienceResults) => {
                if (err) {
                    console.error('Error fetching work experience:', err);
                    return res.status(500).json({ message: 'Error fetching work experience' });
                }

                // Получаем образование
                connection.query(educationQuery, [id], (err, educationResults) => {
                    if (err) {
                        console.error('Error fetching education:', err);
                        return res.status(500).json({ message: 'Error fetching education' });
                    }

                    // Получаем навыки
                    connection.query(skillsQuery, [id], (err, skillsResults) => {
                        if (err) {
                            console.error('Error fetching skills:', err);
                            return res.status(500).json({ message: 'Error fetching skills' });
                        }

                        // Формируем и отправляем итоговый ответ
                        const response = {
                            candidate,
                            experience: experienceResults,
                            education: educationResults,
                            skills: skillsResults // Пример обработки навыков
                        };

                        res.json(response);
                    });
                });
            });
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/candidate/:id/work_experience', (req, res) => {
    const { id } = req.params;
    const { companyName, position, period, description } = req.body;

    const sql = 'INSERT INTO work_experience (companyName, position, period, description, candidateId) VALUES (?, ?, ?, ?, ?)';

    connection.query(sql, [companyName, position, period, description, id], (error, results) => {
        if (error) {
            console.error('Ошибка при добавлении опыта работы:', error);
            res.status(500).json({ message: 'Ошибка при добавлении опыта работы' });
            return;
        }
        res.status(201).json({ message: 'Опыт работы успешно добавлен', workExperienceId: results.insertId });
    });
});

router.delete('/work_experience/:workExperienceId', (req, res) => {
    const { workExperienceId } = req.params;

    const sql = 'DELETE FROM work_experience WHERE id = ?';

    connection.query(sql, [workExperienceId], (error, results) => {
        if (error) {
            console.error('Ошибка при удалении опыта работы:', error);
            res.status(500).json({ message: 'Ошибка при удалении опыта работы' });
            return;
        }
        if (results.affectedRows === 0) {
            res.status(404).json({ message: 'Запись опыта работы не найдена' });
            return;
        }
        res.json({ message: 'Опыт работы успешно удален' });
    });
});

router.post('/candidate/:id/education', (req, res) => {
    const { id } = req.params;
    const { name, period, description } = req.body;

    const sql = 'INSERT INTO work_education (schoolname, period, description, candidateId) VALUES (?, ?, ?, ?)';

    connection.query(sql, [name, period, description, id], (error, results) => {
        if (error) {
            console.error('Ошибка при добавлении записи об образовании:', error);
            res.status(500).json({ message: 'Ошибка при добавлении записи об образовании' });
            return;
        }
        res.status(201).json({ message: 'Запись об образовании успешно добавлена', educationId: results.insertId });
    });
});

router.delete('/educationWork/:educationId', (req, res) => {
    const { educationId } = req.params;

    const sql = 'DELETE FROM work_education WHERE id = ?';

    connection.query(sql, [educationId], (error, results) => {
        if (error) {
            console.error('Ошибка при удалении записи об образовании:', error);
            res.status(500).json({ message: 'Ошибка при удалении записи об образовании' });
            return;
        }
        if (results.affectedRows === 0) {
            res.status(404).json({ message: 'Запись об образовании не найдена' });
            return;
        }
        res.json({ message: 'Запись об образовании успешно удалена' });
    });
});

router.post('/candidate/:id/key_skills', (req, res) => {
    const { id } = req.params;
    const { skills } = req.body; // Предполагаем, что навыки передаются как строка

    const sql = 'INSERT INTO work_skills (candidateId, skills) VALUES (?, ?)';

    connection.query(sql, [id, skills], (error, results) => {
        if (error) {
            console.error('Ошибка при добавлении ключевых навыков:', error);
            res.status(500).json({ message: 'Ошибка при добавлении ключевых навыков' });
            return;
        }
        res.status(201).json({ message: 'Ключевые навыки успешно добавлены', keySkillId: results.insertId });
    });
});

router.delete('/key_skills/:keySkillId', (req, res) => {
    const { keySkillId } = req.params;

    const sql = 'DELETE FROM work_skills WHERE id = ?';

    connection.query(sql, [keySkillId], (error, results) => {
        if (error) {
            console.error('Ошибка при удалении ключевых навыков:', error);
            res.status(500).json({ message: 'Ошибка при удалении ключевых навыков' });
            return;
        }
        if (results.affectedRows === 0) {
            res.status(404).json({ message: 'Запись ключевых навыков не найдена' });
            return;
        }
        res.json({ message: 'Ключевые навыки успешно удалены' });
    });
});



module.exports = router;