const express = require('express');
const router = express.Router();
const db = require('../database/connection');

router.get('/my', (req, res) => {
    
    const studentId = req.session.userId;

     if (!studentId) {
        return res.redirect('/auth/login');
    }

    const sql = `
        SELECT applications.*, job_posts.title AS job_title
        FROM applications
        JOIN job_posts ON applications.job_post_id = job_posts.id
        WHERE applications.student_id = ?
        ORDER BY applications.application_date DESC
    `;
    db.all(sql, [studentId], (err, applications) => {
        if (err) {
             console.error("DB Error fetching student applications:", err.message);
             return res.status(500).send("Error fetching your applications.");
        }
        res.render('applications/my_applications', { applications: applications });
    });
});

module.exports = router;