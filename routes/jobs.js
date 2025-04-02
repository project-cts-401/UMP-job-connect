// routes/jobs.js
const express = require('express');
const router = express.Router();
const db = require('../database/connection');

// GET route to list all *open* jobs (NOW WITH FILTERING)
router.get('/', (req, res) => {
    // Get filter values from query parameters (submitted by the form)
    const searchTerm = req.query.search || ''; // Default to empty string if not provided
    const jobType = req.query.category || '';
    const departmentFilter = req.query.department || '';

    // Base SQL query
    let baseSql = `
        SELECT job_posts.*, faculty_admins.name AS admin_name
        FROM job_posts
        JOIN faculty_admins ON job_posts.posted_by_admin_id = faculty_admins.id
    `;

    // Conditions array and parameters array for filtering
    const conditions = [];
    const params = [];

    // Always filter by 'Open' status initially
    conditions.push("job_posts.status = ?");
    params.push('Open');

    // Add search term filter (using LIKE for partial matching)
    if (searchTerm) {
        conditions.push("job_posts.title LIKE ?");
        params.push(`%${searchTerm}%`); // Add wildcards for LIKE search
    }

    // Add job type filter
    if (jobType) {
        conditions.push("job_posts.job_type = ?");
        params.push(jobType);
    }

    // Add department filter
    if (departmentFilter) {
        conditions.push("job_posts.department = ?");
        params.push(departmentFilter);
    }

    // Construct the final SQL query
    let finalSql = baseSql;
    if (conditions.length > 0) {
        finalSql += " WHERE " + conditions.join(" AND "); // Combine conditions with AND
    }
    finalSql += " ORDER BY job_posts.created_at DESC"; // Add ordering

    // Execute the dynamic query with parameters
    db.all(finalSql, params, (err, jobs) => {
         if (err) {
            console.error("DB Error fetching filtered jobs:", err.message);
            // It's better to render the page with an error than send 500 here
            // return res.status(500).send("Error fetching jobs.");
             res.render('jobs/list_jobs', {
                jobs: [], // Send empty array on error
                error: 'Could not retrieve jobs at this time.',
                // Pass back search terms to repopulate form
                search: searchTerm,
                category: jobType,
                department: departmentFilter
            });
        } else {
            // Render the job list view, passing the filtered jobs AND the search terms
            res.render('jobs/list_jobs', {
                jobs: jobs,
                error: null,
                 // Pass back search terms to repopulate form
                search: searchTerm,
                category: jobType,
                department: departmentFilter
            });
        }
    });
});

// --- Keep your other routes like GET /jobs/:jobId and POST /jobs/:jobId/apply ---
// GET route to view details of a single job
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

// POST route for a student to apply for a job (ensure requireStudent middleware is applied in app.js)
router.post('/:jobId/apply', (req, res) => {
    const jobId = req.params.jobId;
    const studentId = req.session.userId;

    if (!studentId || req.session.role !== 'student') { // Double check role
        return res.redirect('/auth/login');
    }

    const checkSql = `SELECT id FROM applications WHERE job_post_id = ? AND student_id = ?`;
    db.get(checkSql, [jobId, studentId], (checkErr, existingApp) => {
        // ... (rest of the apply logic as before, making sure to fetch job data again on error) ...
         if (checkErr) {
            console.error("DB Error checking existing application:", checkErr.message);
             // Fetch job details to render page with error
            const fetchJobSql = `SELECT j.*, f.name AS admin_name FROM job_posts j JOIN faculty_admins f ON j.posted_by_admin_id = f.id WHERE j.id = ?`;
            db.get(fetchJobSql, [jobId], (jobErr, job) => {
                if (jobErr || !job) return res.status(500).send("Error retrieving job details.");
                res.render('jobs/detail_job', { job: job, error: 'Error checking application status.', message: null });
            });
            return;
        }
        if (existingApp) {
             // Fetch job details to render page with error
            const fetchJobSql = `SELECT j.*, f.name AS admin_name FROM job_posts j JOIN faculty_admins f ON j.posted_by_admin_id = f.id WHERE j.id = ?`;
            db.get(fetchJobSql, [jobId], (jobErr, job) => {
                if (jobErr || !job) return res.status(500).send("Error retrieving job details.");
                res.render('jobs/detail_job', { job: job, error: 'You have already applied for this job.', message: null });
            });
            return;
        }
         // Insert new application
        const insertSql = `INSERT INTO applications (job_post_id, student_id, status, application_date) VALUES (?, ?, 'Submitted', CURRENT_TIMESTAMP)`;
        db.run(insertSql, [jobId, studentId], function(insertErr) {
             if (insertErr) {
                console.error("DB Error submitting application:", insertErr.message);
                 // Fetch job details to render page with error
                const fetchJobSql = `SELECT j.*, f.name AS admin_name FROM job_posts j JOIN faculty_admins f ON j.posted_by_admin_id = f.id WHERE j.id = ?`;
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