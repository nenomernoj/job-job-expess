const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const connection = require('../db');  // Подключите вашу конфигурацию MySQL
const {JWT_SECRET, JWT_SECRET2} = require('../config');
router.get('/userResumes', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;

        const getResumesQuery = `
            SELECT 
                r.Id, r.Information, 
                GROUP_CONCAT(DISTINCT rc.CategoryId) AS categories, 
                GROUP_CONCAT(DISTINCT e.Id, '|', e.SchoolName, '|', e.Specialization, '|', e.GraduationYear) AS education,
                GROUP_CONCAT(DISTINCT l.Id, '|', l.LanguageName, '|', l.ProficiencyLevel) AS languages,
                GROUP_CONCAT(DISTINCT s.Id, '|', s.SkillName) AS skills,
                GROUP_CONCAT(DISTINCT we.Id, '|', we.EmployerName, '|', we.Period, '|', we.Description) AS workExperience
            FROM resumes r
            LEFT JOIN resume_categories rc ON r.Id = rc.ResumeId
            LEFT JOIN education e ON r.Id = e.ResumeId
            LEFT JOIN languages l ON r.Id = l.ResumeId
            LEFT JOIN skills s ON r.Id = s.ResumeId
            LEFT JOIN workexperience we ON r.Id = we.ResumeId
            WHERE r.UserId = ?
            GROUP BY r.Id
        `;

        connection.query(getResumesQuery, [userId], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }

            const detailedResumes = results.map(resume => {
                return {
                    ...resume,
                    categories: resume.categories ? resume.categories.split(',') : [],
                    education: resume.education ? resume.education.split(',').map(e => {
                        const [Id, SchoolName, Specialization, GraduationYear] = e.split('|');
                        return {Id, SchoolName, Specialization, GraduationYear};
                    }) : [],
                    languages: resume.languages ? resume.languages.split(',').map(l => {
                        const [Id, LanguageName, ProficiencyLevel] = l.split('|');
                        return {Id, LanguageName, ProficiencyLevel};
                    }) : [],
                    skills: resume.skills ? resume.skills.split(',').map(s => {
                        const [Id, SkillName] = s.split('|');
                        return {Id, SkillName};
                    }) : [],
                    workExperience: resume.workExperience ? resume.workExperience.split(',').map(we => {
                        const [Id, EmployerName, Period, Description] = we.split('|');
                        return {Id, EmployerName, Period, Description};
                    }) : []
                };
            });

            res.status(200).json(detailedResumes);
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});


router.post('/addNew', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];  // Извлечь токен из заголовка 'Authorization'

    if (!token) {
        return res.status(403).json({message: 'No token provided'});
    }

    try {
        // Проверка JWT токена
        const decoded = jwt.verify(token, JWT_SECRET);  // Замените 'your_jwt_secret' на ваш секретный ключ
        const userId = decoded.user.Id;  // Получите ID пользователя из декодированного токена

        // Получение информации из тела запроса
        const {information} = req.body;

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
        const decoded = jwt.verify(token, JWT_SECRET); // Замените 'your_jwt_secret' на ваш секретный ключ
        const userId = decoded.user.Id;

        // Получение данных из тела запроса
        const {EmployerName, Period, Description, ResumeId} = req.body;

        // Проверка, предоставлены ли все необходимые поля
        if (!EmployerName || !Period || !Description || !ResumeId) {
            return res.status(400).json({message: 'All fields are required'});
        }

        // Проверка, принадлежит ли резюме данному пользователю
        const checkQuery = 'SELECT * FROM resumes WHERE Id = ? AND UserId = ?';
        connection.query(checkQuery, [ResumeId, userId], (error, results) => {
            if (error) {
                return res.status(500).json({message: 'Server error'});
            }
            if (results.length === 0) {
                return res.status(403).json({message: 'This resume does not belong to you'});
            }

            // Добавление записи об опыте работы
            const insertQuery = 'INSERT INTO workexperience (EmployerName, Period, Description, ResumeId) VALUES (?, ?, ?, ?)';
            connection.query(insertQuery, [EmployerName, Period, Description, ResumeId], (error, results) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(200).json({
                    message: 'Work experience successfully added', workExperienceId: results.insertId
                });
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
        const userId = decoded.user.Id;

        const {EmployerName, Period, Description, ResumeId} = req.body;
        const workExperienceId = req.params.id;

        const checkQuery = 'SELECT resumes.UserId FROM workexperience JOIN resumes ON workexperience.ResumeId = resumes.Id WHERE workexperience.Id = ?';
        connection.query(checkQuery, [workExperienceId], (error, results) => {
            if (error || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'You do not have permission to edit this work experience'});
            }

            const updateQuery = 'UPDATE workexperience SET EmployerName = ?, Period = ?, Description = ?, ResumeId = ? WHERE Id = ?';
            connection.query(updateQuery, [EmployerName, Period, Description, ResumeId, workExperienceId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(200).json({message: 'Work experience successfully updated'});
            });
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
        const userId = decoded.user.Id;

        const workExperienceId = req.params.id;

        const checkQuery = 'SELECT resumes.UserId FROM workexperience JOIN resumes ON workexperience.ResumeId = resumes.Id WHERE workexperience.Id = ?';
        connection.query(checkQuery, [workExperienceId], (error, results) => {
            if (error || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'You do not have permission to delete this work experience'});
            }

            const deleteQuery = 'DELETE FROM workexperience WHERE Id = ?';
            connection.query(deleteQuery, [workExperienceId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(200).json({message: 'Work experience successfully deleted'});
            });
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
        const userId = decoded.user.Id;

        const {SchoolName, Specialization, GraduationYear, ResumeId} = req.body;

        if (!SchoolName || !Specialization || !GraduationYear || !ResumeId) {
            return res.status(400).json({message: 'All fields are required'});
        }

        const checkQuery = 'SELECT * FROM resumes WHERE Id = ? AND UserId = ?';
        connection.query(checkQuery, [ResumeId, userId], (error, results) => {
            if (error) {
                console.log(error);
                return res.status(500).json({message: 'Server error'});
            }
            if (results.length === 0) {
                return res.status(403).json({message: 'This resume does not belong to you'});
            }

            const insertQuery = 'INSERT INTO education (SchoolName, Specialization, GraduationYear, ResumeId) VALUES (?, ?, ?, ?)';
            connection.query(insertQuery, [SchoolName, Specialization, GraduationYear, ResumeId], (error, results) => {
                if (error) {
                    console.log(error);
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(200).json({message: 'Education successfully added', educationId: results.insertId});
            });
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
        const userId = decoded.user.Id;

        const {SchoolName, Specialization, GraduationYear, ResumeId} = req.body;
        const educationId = req.params.id;

        const checkQuery = 'SELECT resumes.UserId FROM education JOIN resumes ON education.ResumeId = resumes.Id WHERE education.Id = ?';
        connection.query(checkQuery, [educationId], (error, results) => {
            if (error || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'You do not have permission to edit this education'});
            }

            const updateQuery = 'UPDATE education SET SchoolName = ?, Specialization = ?, GraduationYear = ?, ResumeId = ? WHERE Id = ?';
            connection.query(updateQuery, [SchoolName, Specialization, GraduationYear, ResumeId, educationId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(200).json({message: 'Education successfully updated'});
            });
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
        const userId = decoded.user.Id;

        const educationId = req.params.id;

        const checkQuery = 'SELECT resumes.UserId FROM education JOIN resumes ON education.ResumeId = resumes.Id WHERE education.Id = ?';
        connection.query(checkQuery, [educationId], (error, results) => {
            if (error || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'You do not have permission to delete this education'});
            }

            const deleteQuery = 'DELETE FROM education WHERE Id = ?';
            connection.query(deleteQuery, [educationId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }

                res.status(200).json({message: 'Education successfully deleted'});
            });
        });
    } catch (err) {
        return res.status(401).json({message: 'Invalid token'});
    }
});
router.post('/language', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1]; // Bearer <token>
        const decoded = jwt.verify(token, JWT_SECRET);

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
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;

        const {LanguageName, ProficiencyLevel, ResumeId} = req.body;
        const languageId = req.params.id;

        // Проверяем владельца резюме перед редактированием
        const checkOwnerQuery = 'SELECT UserId FROM resumes WHERE Id = ?';
        connection.query(checkOwnerQuery, [ResumeId], (err, results) => {
            if (err) {
                return res.status(500).json({message: 'Server error'});
            }

            if (results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'Unauthorized'});
            }

            const updateQuery = 'UPDATE languages SET LanguageName = ?, ProficiencyLevel = ?, ResumeId = ? WHERE Id = ?';
            connection.query(updateQuery, [LanguageName, ProficiencyLevel, ResumeId, languageId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }
                res.status(200).json({message: 'Language updated successfully'});
            });
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
        const userId = decoded.user.Id;

        const languageId = req.params.id;

        // Проверяем владельца резюме перед удалением языка
        const checkOwnerQuery = 'SELECT resumes.UserId FROM languages JOIN resumes ON languages.ResumeId = resumes.Id WHERE languages.Id = ?';
        connection.query(checkOwnerQuery, [languageId], (err, results) => {
            if (err) {
                return res.status(500).json({message: 'Server error'});
            }

            if (results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'Unauthorized'});
            }

            const deleteQuery = 'DELETE FROM languages WHERE Id = ?';
            connection.query(deleteQuery, [languageId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }
                res.status(200).json({message: 'Language deleted successfully'});
            });
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/skill', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;

        const {SkillName, ResumeId} = req.body;

        // Проверка владельца резюме
        const checkOwnerQuery = 'SELECT UserId FROM resumes WHERE Id = ?';
        connection.query(checkOwnerQuery, [ResumeId], (err, results) => {
            if (err || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'Unauthorized'});
            }

            const addQuery = 'INSERT INTO skills (SkillName, ResumeId) VALUES (?, ?)';
            connection.query(addQuery, [SkillName, ResumeId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }
                res.status(200).json({message: 'Skill added successfully'});
            });
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
        const userId = decoded.user.Id;

        const {SkillName} = req.body;
        const skillId = req.params.id;

        const checkOwnerQuery = 'SELECT resumes.UserId FROM skills JOIN resumes ON skills.ResumeId = resumes.Id WHERE skills.Id = ?';
        connection.query(checkOwnerQuery, [skillId], (err, results) => {
            if (err || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'Unauthorized'});
            }

            const updateQuery = 'UPDATE skills SET SkillName = ? WHERE Id = ?';
            connection.query(updateQuery, [SkillName, skillId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }
                res.status(200).json({message: 'Skill updated successfully'});
            });
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
        const userId = decoded.user.Id;

        const skillId = req.params.id;

        const checkOwnerQuery = 'SELECT resumes.UserId FROM skills JOIN resumes ON skills.ResumeId = resumes.Id WHERE skills.Id = ?';
        connection.query(checkOwnerQuery, [skillId], (err, results) => {
            if (err || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'Unauthorized'});
            }

            const deleteQuery = 'DELETE FROM skills WHERE Id = ?';
            connection.query(deleteQuery, [skillId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }
                res.status(200).json({message: 'Skill deleted successfully'});
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/category', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;
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

            // Проверка на наличие уже существующей категории для этого резюме
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
        const userId = decoded.user.Id;

        const categoryId = req.params.id;

        const checkOwnerQuery = 'SELECT resumes.UserId FROM resume_categories JOIN resumes ON resume_categories.ResumeId = resumes.Id WHERE resume_categories.Id = ?';
        connection.query(checkOwnerQuery, [categoryId], (err, results) => {
            if (err || results.length === 0 || results[0].UserId !== userId) {
                return res.status(403).json({message: 'Unauthorized'});
            }

            const deleteQuery = 'DELETE FROM resume_categories WHERE Id = ?';
            connection.query(deleteQuery, [categoryId], (error) => {
                if (error) {
                    return res.status(500).json({message: 'Server error'});
                }
                res.status(200).json({message: 'Category removed from resume successfully'});
            });
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
        const userId = decoded.user.Id;
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
        res.status(500).json({message: 'Server error'});
    }
});

router.post('/categoryAdd', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;
        const {name} = req.body;
        // Проверяем принадлежность резюме текущему пользователю
        // Если все проверки пройдены, добавляем новую категорию к резюме
        const insertQuery = 'INSERT INTO categories (Name) VALUES (?)';
        connection.query(insertQuery, [name], (error, results) => {
            if (error) {
                console.log(error);
                return res.status(500).json({message: 'Server error'});
            }

            res.status(201).json({message: 'Category added'});
        });
    } catch (error) {
        console.error(error);
        res.status(401).json({message: 'Server error'});
    }
});
router.put('/categoryEdit/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.user.Id;
        const {name} = req.body;
        const id = req.params.id;
        const updateQuery = 'UPDATE categories SET Name = ? WHERE Id = ?';
        connection.query(updateQuery, [name, id], (error) => {
            if (error) {
                console.log(error);
                return res.status(500).json({message: 'Server error'});
            }
            res.status(200).json({message: 'Skill updated successfully'});
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
module.exports = router;
