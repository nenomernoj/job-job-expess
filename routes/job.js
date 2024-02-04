// routes/auth.js
const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connection = require('../db');
const router = express.Router();
const {JWT_SECRET, JWT_SECRET2} = require('../config');
router.post('/job', async (req, res) => {
    const {
        title,
        salary,
        workSchedule,
        responsibilities,
        requirements,
        address,
        contactPhone,
        contactWhatsApp,
        author,
        categoryId,
        status,
        cityId
    } = req.body;

    const insertQuery = 'INSERT INTO jobs (Title, Salary, WorkSchedule, Responsibilities, Requirements, Address, ContactPhone, ContactWhatsApp, Author, CreationDate, CategoryId, Status, CityId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)';

    connection.query(insertQuery, [title, salary, workSchedule, responsibilities, requirements, address, contactPhone, contactWhatsApp, author, categoryId, status, cityId], (error, results) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        res.status(201).json({message: 'Job created successfully.'});
    });
});
// Получить все работы
// Получить все работы с возможностью фильтрации
router.get('/jobs', (req, res) => {
    let selectQuery = 'SELECT * FROM jobs WHERE Status = 1';

    const queryParams = [];

    if (req.query.CityId) {
        selectQuery += ' AND CityId = ?';
        queryParams.push(req.query.CityId);
    }

    if (req.query.CategoryId) {
        selectQuery += ' AND CategoryId = ?';
        queryParams.push(req.query.CategoryId);
    }
    selectQuery += ' ORDER BY Id DESC';
    connection.query(selectQuery, queryParams, (error, results) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        res.status(200).json(results);
    });
});
router.get('/jobs_paging', (req, res) => {
    let selectQuery = 'SELECT * FROM jobs WHERE Status = 1';
    const queryParams = [];

    // Получаем параметры пагинации из запроса или используем значения по умолчанию
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;

    // Рассчитываем OFFSET для SQL запроса
    const offset = (page - 1) * pageSize;

    if (req.query.CityId) {
        selectQuery += ' AND CityId = ?';
        queryParams.push(req.query.CityId);
    }

    if (req.query.CategoryId) {
        selectQuery += ' AND CategoryId = ?';
        queryParams.push(req.query.CategoryId);
    }

    // Добавляем к запросу сортировку и пагинацию
    selectQuery += ' ORDER BY Id DESC LIMIT ? OFFSET ?';
    // Добавляем параметры пагинации в массив параметров запроса
    queryParams.push(pageSize, offset);

    connection.query(selectQuery, queryParams, (error, results) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        res.status(200).json(results);
    });
});

router.get('/jobsAll', (req, res) => {
    let selectQuery = 'SELECT * FROM jobs ORDER BY Id';
    connection.query(selectQuery, (error, results) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        res.status(200).json(results);
    });
});

// Получить конкретную работу по Id
router.get('/job/:id', (req, res) => {
    const jobId = req.params.id;
    const selectQuery = 'SELECT * FROM jobs WHERE Id = ?';

    connection.query(selectQuery, [jobId], (error, result) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        if (result.length === 0) return res.status(404).json({message: 'Job not found.'});
        res.status(200).json(result[0]);
    });
});

router.put('/job/:id', (req, res) => {
    const jobId = req.params.id;
    const {
        title,
        salary,
        workSchedule,
        responsibilities,
        requirements,
        address,
        contactPhone,
        contactWhatsApp,
        categoryId,
        status,
        cityId
    } = req.body;

    const updateQuery = 'UPDATE jobs SET Title = ?, Salary = ?, WorkSchedule = ?, Responsibilities = ?, Requirements = ?, Address = ?, ContactPhone = ?, ContactWhatsApp = ?, CategoryId = ?, Status = ? , CityId = ? WHERE Id = ?';

    connection.query(updateQuery, [title, salary, workSchedule, responsibilities, requirements, address, contactPhone, contactWhatsApp, categoryId, status, cityId, jobId], (error, results) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        if (results.affectedRows === 0) return res.status(404).json({message: 'Job not found.'});
        res.status(200).json({message: 'Job updated successfully.'});
    });
});

router.delete('/job/:id', (req, res) => {
    const jobId = req.params.id;

    const deleteQuery = 'DELETE FROM jobs WHERE Id = ?';

    connection.query(deleteQuery, [jobId], (error, results) => {
        if (error) return res.status(500).json({message: 'Server error', error});
        if (results.affectedRows === 0) return res.status(404).json({message: 'Job not found.'});
        res.status(200).json({message: 'Job deleted successfully.'});
    });
});
module.exports = router;