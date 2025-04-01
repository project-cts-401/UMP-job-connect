const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../database/connection');

const saltRounds = 10;

router.get('/register/student', (req, res) => {
    res.render('student/register_student', { error: null });
});

router.post('/register/student', (req, res) => {
    const { name, email, student_number, password, confirmPassword } = req.body;

    if (!name || !email || !student_number || !password || !confirmPassword) {
        return res.render('register_student', { error: 'All fields are required!' });
    }
    if (password !== confirmPassword) {
        return res.render('register_student', { error: 'Passwords do not match!' });
    }
    if (password.length < 8) {
        return res.render('register_student', { error: 'Password must be at least 8 characters long!' });
    }
    const checkSql = `SELECT * FROM students WHERE email = ? OR student_number = ?`;
    db.get(checkSql, [email, student_number], (err, existingStudent) => {
        if (err) {
            console.error("DB Error checking student:", err.message);
            return res.render('register_student', { error: 'Something went wrong. Please try again.' });
        }
        if (existingStudent) {
            return res.render('register_student', { error: 'Email or Student Number already exists!' });
        }

        bcrypt.hash(password, saltRounds, (hashErr, hashedPassword) => {
            if (hashErr) {
                console.error("Hashing error:", hashErr.message);
                return res.render('register_student', { error: 'Something went wrong hashing password. Please try again.' });
            }

            const insertSql = `INSERT INTO students (name, email, student_number, password_hash) VALUES (?, ?, ?, ?)`;
            db.run(insertSql, [name, email, student_number, hashedPassword], (runErr) => {
                if (runErr) {
                    console.error("DB Error inserting student:", runErr.message);
                    if (runErr.message.includes('UNIQUE')) {
                         return res.render('register_student', { error: 'An unexpected unique constraint failed.' });
                    }
                    return res.render('register_student', { error: 'Something went wrong saving user. Please try again.' });
                }
                res.redirect('/auth/login');
            });
        });
    });
});

router.get('/register/admin', (req, res) => {
    res.render('admins/register_admin', { error: null });
});

router.post('/register/admin', (req, res) => {
    const { name, email, staff_number, password, confirmPassword } = req.body;

    if (!name || !email || !staff_number || !password || !confirmPassword) {
        return res.render('register_admin', { error: 'All fields are required!' });
    }
    if (password !== confirmPassword) {
        return res.render('register_admin', { error: 'Passwords do not match!' });
    }
     if (password.length < 6) {
        return res.render('register_admin', { error: 'Password must be at least 6 characters long!' });
    }

    const checkSql = `SELECT * FROM faculty_admins WHERE email = ? OR staff_number = ?`;
    db.get(checkSql, [email, staff_number], (err, existingAdmin) => {
        if (err) {
            console.error("DB Error checking admin:", err.message);
            return res.render('register_admin', { error: 'Something went wrong. Please try again.' });
        }
        if (existingAdmin) {
            return res.render('register_admin', { error: 'Email or Staff Number already exists!' });
        }

        bcrypt.hash(password, saltRounds, (hashErr, hashedPassword) => {
            if (hashErr) {
                 console.error("Hashing error:", hashErr.message);
                return res.render('register_admin', { error: 'Something went wrong hashing password. Please try again.' });
            }

            const insertSql = `INSERT INTO faculty_admins (name, email, staff_number, password_hash) VALUES (?, ?, ?, ?)`;
            db.run(insertSql, [name, email, staff_number, hashedPassword], (runErr) => {
                if (runErr) {
                    console.error("DB Error inserting admin:", runErr.message);
                     if (runErr.message.includes('UNIQUE')) {
                         return res.render('register_admin', { error: 'An unexpected unique constraint failed.' });
                    }
                    return res.render('register_admin', { error: 'Something went wrong saving admin. Please try again.' });
                }

                res.redirect('/auth/login');
            });
        });
    });
});

router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.render('login', { error: 'Identifier and password are required.' });
    }
    
    const studentSql = `SELECT * FROM students WHERE email = ? OR student_number = ?`;
    db.get(studentSql, [identifier, identifier], (studentErr, studentUser) => {
        if (studentErr) {
            console.error("DB Error checking student:", studentErr.message);
            return res.render('login', { error: 'Something went wrong. Please try again.' });
        }

        if (studentUser) {
            
            bcrypt.compare(password, studentUser.password_hash, (compareErr, isMatch) => {
                if (compareErr) {
                    console.error("Password compare error:", compareErr.message);
                    return res.render('login', { error: 'Something went wrong during login. Please try again.' });
                }

                if (isMatch) {
                    
                    req.session.userId = studentUser.id;
                    req.session.role = 'student';
                    
                    return res.redirect('/jobs');
                } else {
                    
                    return res.render('login', { error: 'Invalid identifier or password.' });
                }
            });
            
        } else {
            const adminSql = `SELECT * FROM faculty_admins WHERE email = ? OR staff_number = ?`;
            db.get(adminSql, [identifier, identifier], (adminErr, adminUser) => {
                if (adminErr) {
                    console.error("DB Error checking admin:", adminErr.message);
                    return res.render('login', { error: 'Something went wrong. Please try again.' });
                }

                if (adminUser) {
                     bcrypt.compare(password, adminUser.password_hash, (compareErr, isMatch) => {
                        if (compareErr) {
                            console.error("Password compare error:", compareErr.message);
                            return res.render('login', { error: 'Something went wrong during login. Please try again.' });
                        }

                        if (isMatch) {
                            req.session.userId = adminUser.id;
                            req.session.role = 'admin';
                            return res.redirect('/admin/jobs');
                        } else {
                            return res.render('login', { error: 'Invalid identifier or password.' });
                        }
                     });
                } else {
                    return res.render('login', { error: 'Invalid identifier or password.' });
                }
            });
        }
    });
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
        }
        res.redirect('/auth/login');
    });
});


module.exports = router;