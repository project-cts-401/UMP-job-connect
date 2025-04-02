const express = require('express');
const router = express();
const db = require('../database/connection');
const multer = require('multer');
const upload = multer({ dest: '/uploads/resumes/' });

router.get('/', (req, res) => {
    const sql = `
        SELECT job_posts.*, faculty_admins.name AS admin_name
        FROM job_posts
        JOIN faculty_admins ON job_posts.posted_by_admin_id = faculty_admins.id
        WHERE job_posts.status = 'Open'
        ORDER BY job_posts.created_at DESC
    `;
    db.all(sql, [], (err, jobs) => {
         if (err) {
            console.error("DB Error fetching open jobs:", err.message);
            return res.status(500).send("Error fetching jobs to home page.");
        }
        
        res.render('Home', { jobs: jobs });
    });
});

module.exports = router;