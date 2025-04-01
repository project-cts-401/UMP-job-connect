const express = require('express');
const router = express.Router();
const db = require('../database/connection');

router.get('/jobs/new', (req, res) => {
    res.render('admin/new_job_form', { error: null });
});

router.post('/jobs', (req, res) => {
    const { title, description, requirements, job_type, department, deadline } = req.body;
    const adminId = req.session.userId;

    if (!title || !description || !job_type) {
        return res.render('admin/new_job_form', { error: 'Title, Description, and Job Type are required.' });
    }

    const insertSql = `
        INSERT INTO job_posts
        (title, description, requirements, job_type, department, deadline, posted_by_admin_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')
    `;
    const params = [
        title, description, requirements, job_type, department || null,
        deadline || null, adminId
    ];

    db.run(insertSql, params, function(err) {
        if (err) {
            console.error("DB Error creating job post:", err.message);
            return res.render('admin/new_job_form', { error: 'Failed to create job post. Please try again.' });
        }
        res.redirect('/admin/jobs');
    });
});

router.get('/jobs', (req, res) => {
    const adminId = req.session.userId;
    const sql = `SELECT * FROM job_posts WHERE posted_by_admin_id = ? ORDER BY created_at DESC`;

    db.all(sql, [adminId], (err, jobs) => {
        if (err) {
            console.error("DB Error fetching admin jobs:", err.message);
            return res.status(500).send("Error fetching jobs.");
        }
        
        res.render('admin/my_jobs_list', { jobs: jobs });
    });
});


// --- Application Review ---

router.get('/jobs/:jobId/applications', (req, res) => {
    const jobId = req.params.jobId;
    const adminId = req.session.userId;

    // First, verify the admin owns this job
    const checkJobSql = `SELECT * FROM job_posts WHERE id = ? AND posted_by_admin_id = ?`;
    db.get(checkJobSql, [jobId, adminId], (jobErr, job) => {
         if (jobErr) {
            console.error("DB Error checking job ownership:", jobErr.message);
            return res.status(500).send("Error checking job details.");
        }
        if (!job) {
             // Admin doesn't own this job or job doesn't exist
            return res.status(404).send("Job not found or access denied.");
        }

        // Admin owns the job, now fetch applications
        const fetchAppsSql = `
            SELECT applications.*, students.name AS student_name, students.email AS student_email
            FROM applications
            JOIN students ON applications.student_id = students.id
            WHERE applications.job_post_id = ?
            ORDER BY applications.application_date DESC
        `;
        db.all(fetchAppsSql, [jobId], (appsErr, applications) => {
            if (appsErr) {
                console.error("DB Error fetching applications:", appsErr.message);
                return res.status(500).send("Error fetching applications.");
            }
             // Assumes view named 'admin/view_applications.ejs' exists
            res.render('admin/view_applications', { job: job, applications: applications, error: null });
        });
    });
});

// POST route to update the status of an application
router.post('/applications/:appId/status', (req, res) => {
    const appId = req.params.appId;
    const newStatus = req.body.status; // Get status from form input
    const adminId = req.session.userId;

    // Validate newStatus (ensure it's one of your allowed statuses)
    const allowedStatuses = ['Submitted', 'Under Review', 'Interviewing', 'Offered', 'Rejected', 'Accepted']; // Example statuses
    if (!allowedStatuses.includes(newStatus)) {
        // Handle invalid status update attempt
        // You might need the job ID to redirect back properly, requiring fetching it first
        console.error("Invalid status update attempt:", newStatus);
        return res.status(400).send("Invalid status provided."); // Simplified error handling
    }

    // Security Check: Verify admin owns the job associated with this application
    const checkOwnershipSql = `
        SELECT a.job_post_id
        FROM applications a
        JOIN job_posts j ON a.job_post_id = j.id
        WHERE a.id = ? AND j.posted_by_admin_id = ?
    `;
    db.get(checkOwnershipSql, [appId, adminId], (ownErr, row) => {
        if (ownErr) {
             console.error("DB Error checking app ownership:", ownErr.message);
             return res.status(500).send("Error verifying application access.");
        }
        if (!row) {
            // Admin doesn't own the job for this application or application doesn't exist
            return res.status(403).send("Forbidden: You do not have permission to update this application.");
        }

        // User is authorized, proceed with update
        const updateSql = `UPDATE applications SET status = ? WHERE id = ?`;
        db.run(updateSql, [newStatus, appId], function(updateErr) {
             if (updateErr) {
                 console.error("DB Error updating application status:", updateErr.message);
                 return res.status(500).send("Error updating status."); // Simplified
             }
             // Redirect back to the application list for that job
             // 'row.job_post_id' contains the ID from the ownership check
             res.redirect(`/admin/jobs/${row.job_post_id}/applications`);
        });
    });
});


module.exports = router;