const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const multer = require('multer');
const upload = multer({ dest: 'uploads/resumes/' });

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
            return res.status(500).send("Error fetching jobs.");
        }
        
        res.render('jobs/list_jobs', { jobs: jobs });
    });
});

router.get('/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const sql = `
        SELECT job_posts.*, faculty_admins.name AS admin_name
        FROM job_posts
        JOIN faculty_admins ON job_posts.posted_by_admin_id = faculty_admins.id
        WHERE job_posts.id = ?
    `;
    db.get(sql, [jobId], (err, job) => {
        if (err) {
             console.error("DB Error fetching job details:", err.message);
             return res.status(500).send("Error fetching job details.");
        }
        if (!job) {
            return res.status(404).send("Job not found.");
        }
        res.render('jobs/detail_job', { job: job, error: null, message: null });
    });
});
router.post('/:jobId/apply', (req, res) => {
    const jobId = req.params.jobId;
    const studentId = req.session.userId;

    if (!studentId) {
        return res.redirect('/auth/login');
    }
    
    const checkSql = `SELECT id FROM applications WHERE job_post_id = ? AND student_id = ?`;
    db.get(checkSql, [jobId, studentId], (checkErr, existingApp) => {
        if (checkErr) {
            console.error("DB Error checking existing application:", checkErr.message);
            return res.status(500).send("Error processing application check.");
        }
        if (existingApp) {
            const fetchJobSql = `SELECT job_posts.*, faculty_admins.name AS admin_name FROM job_posts JOIN faculty_admins ON job_posts.posted_by_admin_id = faculty_admins.id WHERE job_posts.id = ?`;
            db.get(fetchJobSql, [jobId], (jobErr, job) => {
                if (jobErr || !job) return res.status(500).send("Error retrieving job details.");
                
                res.render('jobs/detail_job', { job: job, error: 'You have already applied for this job.', message: null });
            });
            return;
        }

        const insertSql = `
            INSERT INTO applications (job_post_id, student_id, status, application_date)
            VALUES (?, ?, 'Submitted', CURRENT_TIMESTAMP)
        `;
        
        db.run(insertSql, [jobId, studentId], function(insertErr) {
            if (insertErr) {
                console.error("DB Error submitting application:", insertErr.message);
                
                const fetchJobSql = `SELECT job_posts.*, faculty_admins.name AS admin_name FROM job_posts JOIN faculty_admins ON job_posts.posted_by_admin_id = faculty_admins.id WHERE job_posts.id = ?`;
                 db.get(fetchJobSql, [jobId], (jobErr, job) => {
                    if (jobErr || !job) return res.status(500).send("Error retrieving job details.");
                    res.render('jobs/detail_job', { job: job, error: 'Failed to submit application. Please try again.', message: null });
                });
                 return;
            }
            
            res.redirect('/applications/my');
        });
    });
});

module.exports = router;