const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const router = express.Router();
const {JWT_SECRET, JWT_SECRET2} = require('../config');
router.post('/getOtp', (req, res) => {
    const {phone_number, sms_code} = req.body;
    console.log('body: ', req.body);
    console.log('phone: ', phone_number);
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
        const message = 'HR assistant, код регистрации : ' + sms_code;
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
        const {phoneNumber, password, companyName, fullName, whatsAppNumber, email, smsCode} = req.body;

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
                        res.status(200).json({message: 'Организация успешно зарегистрирована'});
                    });
                });
            } else {
                res.status(400).json({error: 'Неверный или истекший SMS-код'});
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/login', (req, res) => {
    try {
        const {phone_number, password} = req.body;
        const query = 'SELECT * FROM organizations WHERE PhoneNumber = ?';
        connection.query(query, [phone_number], async (error, results) => {
            if (error) {
                res.status(500).json({message: 'Server error'});
                return;
            }

            if (results.length === 0) {
                res.status(401).json({message: 'Authentication failed1'});
                return;
            }

            const org = results[0];
            const passwordMatch = await bcrypt.compare(password, org.Password);

            if (!passwordMatch) {
                res.status(401).json({message: 'Authentication failed2'});
                return;
            }
            delete org.Password;
            // Если аутентификация успешна, генерируем токены
            const accessToken = jwt.sign({org}, JWT_SECRET, {expiresIn: '365d'});
            const refreshToken = jwt.sign({OrganizationId: org.Id}, JWT_SECRET2, {expiresIn: '365d'});

            // Сохраняем refresh token в базе данных
            const insertQuery = 'INSERT INTO refresh_tokens_org (OrganizationId, token) VALUES (?, ?)';
            connection.query(insertQuery, [org.Id, refreshToken], (insertError) => {
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
router.get('/getAllResumes', async (req, res) => {
    try {
        const {categoryId, cityId} = req.query;

        let sql = `
            SELECT 
                r.*, 
                u.FullName, u.Email, u.CityId, u.PhoneNumber AS Phone, u.Photo,
                GROUP_CONCAT(DISTINCT rc.CategoryId) AS categories,
                GROUP_CONCAT(DISTINCT e.SchoolName, '|', e.Specialization, '|', e.GraduationYear) AS education,
                GROUP_CONCAT(DISTINCT l.LanguageName, '|', l.ProficiencyLevel) AS languages,
                GROUP_CONCAT(DISTINCT s.SkillName) AS skills,
                GROUP_CONCAT(DISTINCT we.EmployerName, '|', we.Period, '|', we.Description) AS workExperience
            FROM resumes r
            INNER JOIN users u ON r.UserId = u.Id
            LEFT JOIN resume_categories rc ON r.Id = rc.ResumeId
            LEFT JOIN education e ON r.Id = e.ResumeId
            LEFT JOIN languages l ON r.Id = l.ResumeId
            LEFT JOIN skills s ON r.Id = s.ResumeId
            LEFT JOIN workexperience we ON r.Id = we.ResumeId
        `;

        const values = [];
        if (categoryId) {
            sql += ' WHERE rc.CategoryId = ?';
            values.push(categoryId);
        }

        if (cityId) {
            if (values.length) {
                sql += ' AND u.CityId = ?';
            } else {
                sql += ' WHERE u.CityId = ?';
            }
            values.push(cityId);
        }

        sql += ' GROUP BY r.Id ORDER BY r.Id DESC';

        connection.query(sql, values, (error, results) => {
            if (error) {
                console.error(error);
                return res.status(500).json({message: 'Server error'});
            }

            const detailedResumes = results.map(resume => ({
                ...resume,
                categories: resume.categories ? resume.categories.split(',') : [],
                education: resume.education ? resume.education.split(',').map(e => {
                    const [SchoolName, Specialization, GraduationYear] = e.split('|');
                    return {SchoolName, Specialization, GraduationYear};
                }) : [],
                languages: resume.languages ? resume.languages.split(',').map(l => {
                    const [LanguageName, ProficiencyLevel] = l.split('|');
                    return {LanguageName, ProficiencyLevel};
                }) : [],
                skills: resume.skills ? resume.skills.split(',') : [],
                workExperience: resume.workExperience ? resume.workExperience.split(',').map(we => {
                    const [EmployerName, Period, Description] = we.split('|');
                    return {EmployerName, Period, Description};
                }) : []
            }));

            res.status(200).json(detailedResumes);
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});
router.get('/getAllResumesByOrg', async (req, res) => {
    try {
        const {categoryId, cityId} = req.query;
        let companyId = 0;
        const token = req.headers.authorization.split(' ')[1]; // Получаем токен из заголовк
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            companyId = decoded.org.Id; // Получаем ID организации из токена
        }

        // Шаг 1: Извлекаем все связанные категории для companyId
        const categoryQuery = `
            SELECT CategoryId FROM OrganizationCategories WHERE CompanyId = ?
        `;
        const categoryIds = await new Promise((resolve, reject) => {
            connection.query(categoryQuery, [companyId], (error, results) => {
                if (error) {
                    return reject(error);
                }
                // Возвращаем массив ID категорий
                const ids = results.map(row => row.CategoryId);
                resolve(ids);
            });
        });

        // Шаг 2: Формируем основной запрос с условием фильтрации по городу и/или категории
        let sql = `
            SELECT 
                r.*, 
                u.FullName, u.Email, u.CityId, u.PhoneNumber AS Phone, u.Photo,u.Gender,u.Birthdate,
                GROUP_CONCAT(DISTINCT rc.CategoryId ORDER BY rc.CategoryId) AS categories,
                GROUP_CONCAT(DISTINCT CONCAT(e.SchoolName, '|', e.Specialization, '|', e.GraduationYear) ORDER BY e.Id) AS education,
                GROUP_CONCAT(DISTINCT CONCAT(l.LanguageName, '|', l.ProficiencyLevel) ORDER BY l.Id) AS languages,
                GROUP_CONCAT(DISTINCT s.SkillName ORDER BY s.Id) AS skills,
                GROUP_CONCAT(DISTINCT CONCAT(we.EmployerName, '|', we.Period, '|', we.Description) ORDER BY we.Id) AS workExperience
            FROM resumes r
            INNER JOIN users u ON r.UserId = u.Id
            LEFT JOIN resume_categories rc ON r.Id = rc.ResumeId
            LEFT JOIN education e ON r.Id = e.ResumeId
            LEFT JOIN languages l ON r.Id = l.ResumeId
            LEFT JOIN skills s ON r.Id = s.ResumeId
            LEFT JOIN workexperience we ON r.Id = we.ResumeId
        `;

        const values = [];
        let whereConditions = [];

        if (categoryId) {
            whereConditions.push("rc.CategoryId = ?");
            values.push(categoryId);
        }

        if (cityId) {
            whereConditions.push("u.CityId = ?");
            values.push(cityId);
        }

        if (whereConditions.length) {
            sql += " WHERE " + whereConditions.join(" AND ");
        }

        sql += " GROUP BY r.Id ORDER BY r.Id DESC";

        // Шаг 3: Выполняем запрос и фильтруем результаты
        connection.query(sql, values, (error, results) => {
            if (error) {
                console.error(error);
                return res.status(500).json({message: 'Server error'});
            }

            // Фильтрация резюме на основе связанных категорий
            const detailedResumes = results.map(resume => {
                const resumeCategories = resume.categories ? resume.categories.split(',') : [];
                const hasLinkedCategory = resumeCategories.some(catId => categoryIds.includes(parseInt(catId)));

                return {
                    ...resume,
                    Email: hasLinkedCategory ? resume.Email : '',
                    Phone: hasLinkedCategory ? resume.Phone : '',
                    categories: resume.categories ? resume.categories.split(',') : [],
                    education: resume.education ? resume.education.split(',').map(e => {
                        const [SchoolName, Specialization, GraduationYear] = e.split('|');
                        return {SchoolName, Specialization, GraduationYear};
                    }) : [],
                    languages: resume.languages ? resume.languages.split(',').map(l => {
                        const [LanguageName, ProficiencyLevel] = l.split('|');
                        return {LanguageName, ProficiencyLevel};
                    }) : [],
                    skills: resume.skills ? resume.skills.split(',') : [],
                    workExperience: resume.workExperience ? resume.workExperience.split(',').map(we => {
                        const [EmployerName, Period, Description] = we.split('|');
                        return {EmployerName, Period, Description};
                    }) : []
                    // Преобразуем остальные данные аналогично
                };
            });

            res.status(200).json(detailedResumes);
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

router.get('/getAllCandidates', async (req, res) => {
    try {
        // Предполагается, что companyId извлекается из токена аутентификации
        let companyId = 0;
        const token = req.headers.authorization.split(' ')[1]; // Получаем токен из заголовк
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            companyId = decoded.org.Id; // Получаем ID организации из токена
        }
        const {categoryId, cityId} = req.query;

        let sql = `
            SELECT 
                c.id, c.fullName, c.position, c.cityId, c.birthDate, c.photo, 
                c.categoryId, c.comment, c.aboutMe, c.workExperienceYears, c.additionalInfo,
                IF(oc.CompanyId IS NULL, '', c.email) AS email, 
                IF(oc.CompanyId IS NULL, '', c.phone) AS phone,
                (SELECT GROUP_CONCAT(CONCAT(we.companyName, '|', we.position, '|', we.period, '|', we.description) SEPARATOR ';') 
                    FROM work_experience we WHERE we.candidateId = c.id) AS workExperience,
                (SELECT GROUP_CONCAT(CONCAT(e.schoolName, '|', e.period, '|', e.description) SEPARATOR ';') 
                    FROM work_education e WHERE e.candidateId = c.id) AS education,
                (SELECT GROUP_CONCAT(s.skills SEPARATOR ';') 
                    FROM work_skills s WHERE s.candidateId = c.id) AS skills
            FROM candidates c
            LEFT JOIN OrganizationCategories oc ON c.categoryId = oc.CategoryId AND oc.CompanyId = ?
        `;


        const whereConditions = [];
        const values = [companyId];

        if (categoryId) {
            whereConditions.push("c.categoryId = ?");
            values.push(categoryId);
        }

        if (cityId) {
            whereConditions.push("c.cityId = ?");
            values.push(cityId);
        }

        if (whereConditions.length > 0) {
            sql += " WHERE " + whereConditions.join(" AND ");
        }

        connection.query(sql, values, (error, results) => {
            if (error) {
                console.error('Ошибка при получении списка кандидатов:', error);
                return res.status(500).json({message: 'Ошибка при получении списка кандидатов'});
            }

            const candidates = results.map(candidate => ({
                ...candidate,
                workExperience: candidate.workExperience ? candidate.workExperience.split(';').map(item => {
                    const [companyName, position, period, description] = item.split('|');
                    return {companyName, position, period, description};
                }) : [],
                education: candidate.education ? candidate.education.split(';').map(item => {
                    const [schoolName, period, description] = item.split('|');
                    return {schoolName, period, description};
                }) : [],
                skills: candidate.skills ? candidate.skills.split(';') : [],
            }));

            res.json(candidates);
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

router.put('/updateOrganization', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1]; // Получаем токен из заголовк
        const decoded = jwt.verify(token, JWT_SECRET);
        const organizationId = decoded.org.Id; // Получаем ID организации из токена

        if (!organizationId) {
            return res.status(401).json({message: 'Invalid or expired token'});
        }

        const {companyName, whatsAppNumber, email, fullName} = req.body;

        // Подготовка запроса на обновление данных организации
        const updateQuery = `
            UPDATE organizations 
            SET CompanyName = ?, WhatsAppNumber = ?, Email = ?, FullName = ?
            WHERE Id = ?
        `;
        const queryParams = [companyName, whatsAppNumber, email, fullName, organizationId];

        // Выполнение запроса на обновление
        connection.query(updateQuery, queryParams, (error, results) => {
            if (error) {
                console.error('Error updating organization:', error);
                return res.status(500).json({message: 'Error updating organization'});
            }
            if (results.affectedRows === 0) {
                return res.status(404).json({message: 'Organization not found'});
            }
            res.status(200).json({message: 'Organization updated successfully'});
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({message: 'Server error'});
    }
});
router.post('/refresh', (req, res) => {
    const {refreshToken} = req.body;

    if (!refreshToken) {
        return res.status(401).json({message: 'Refresh token is required'});
    }

    // Проверяем refreshToken в базе данных
    const refreshTokenQuery = 'SELECT OrganizationId FROM refresh_tokens_org WHERE token = ?';
    connection.query(refreshTokenQuery, [refreshToken], (error, tokens) => {
        if (error || tokens.length === 0) {
            return res.status(403).json({message: 'Invalid refresh token'});
        }

        const {OrganizationId} = tokens[0];

        try {
            // Проверяем валидность refreshToken
            jwt.verify(refreshToken, JWT_SECRET2);

            // Получаем данные организации для включения в accessToken
            const orgQuery = 'SELECT * FROM organizations WHERE Id = ?';
            connection.query(orgQuery, [OrganizationId], (orgError, orgResults) => {
                if (orgError || orgResults.length === 0) {
                    return res.status(500).json({message: 'Organization not found'});
                }

                const orgData = orgResults[0];

                // Генерируем новый accessToken с данными организации
                const accessToken = jwt.sign({
                    org: {
                        Id: OrganizationId,
                        CompanyName: orgData.CompanyName,
                        Email: orgData.Email,
                        PhoneNumber: orgData.PhoneNumber,
                        WhatsAppNumber: orgData.WhatsAppNumber,
                        FullName: orgData.FullName
                    }
                }, JWT_SECRET, {expiresIn: '365d'});

                // Генерируем новый refreshToken
                const newRefreshToken = jwt.sign({OrganizationId: OrganizationId}, JWT_SECRET2, {expiresIn: '365d'});

                // Удаляем старый refreshToken из базы данных
                const deleteOldRefreshTokenQuery = 'DELETE FROM refresh_tokens_org WHERE token = ?';
                connection.query(deleteOldRefreshTokenQuery, [refreshToken], (deleteError) => {
                    if (deleteError) {
                        return res.status(500).json({message: 'Error deleting old refresh token'});
                    }

                    // Сохраняем новый refreshToken в базе данных
                    const insertNewRefreshTokenQuery = 'INSERT INTO refresh_tokens_org (OrganizationId, token) VALUES (?, ?)';
                    connection.query(insertNewRefreshTokenQuery, [OrganizationId, newRefreshToken], (insertError) => {
                        if (insertError) {
                            return res.status(500).json({message: 'Error creating new refresh token'});
                        }

                        // Возвращаем новые токены
                        res.status(200).json({
                            accessToken,
                            refreshToken: newRefreshToken
                        });
                    });
                });
            });
        } catch (err) {
            return res.status(403).json({message: 'Invalid or expired refresh token'});
        }
    });
});

module.exports = router;
