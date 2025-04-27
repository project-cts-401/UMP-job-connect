// routes/jobs.js
const express = require('express');
const router = express.Router();
const db = require('../database/connection');

// GET route to list all *open* jobs (NOW WITH FILTERING)
router.get('/', (req, res) => {
    // --- 1. Get Filters & Pagination Params ---
    const searchTerm = req.query.search || '';
    const jobType = req.query.category || '';
    const departmentFilter = req.query.department || '';

    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit <= 0) {
        limit = 10; // Default limit
    }

    let currentPage = parseInt(req.query.page, 10);
    if (isNaN(currentPage) || currentPage <= 0) {
        currentPage = 1; // Default to page 1
    }

    const offset = (currentPage - 1) * limit;

    // --- 2. Base SQL parts & Build Conditions ---
    const baseSqlSelect = `
        SELECT j.*, f.name AS admin_name 
        FROM job_posts j 
        JOIN faculty_admins f ON j.posted_by_admin_id = f.id
    `; // Use aliases 'j' and 'f' for clarity
    const baseSqlCount = `
        SELECT COUNT(*) as count 
        FROM job_posts j 
        JOIN faculty_admins f ON j.posted_by_admin_id = f.id
    `;

    const conditions = [];
    const params = []; // Parameters for filtering

    // Always filter by 'Open' status initially
    conditions.push("j.status = ?");
    params.push('Open');

    // Add search term filter
    if (searchTerm) {
        conditions.push("j.title LIKE ?");
        params.push(`%${searchTerm}%`);
    }

    // Add job type filter
    if (jobType) {
        conditions.push("j.job_type = ?");
        params.push(jobType);
    }

    // Add department filter
    if (departmentFilter) {
        conditions.push("j.department = ?");
        params.push(departmentFilter);
    }

    // --- 3. Construct WHERE clause ---
    let whereClause = '';
    if (conditions.length > 0) {
        whereClause = " WHERE " + conditions.join(" AND ");
    }

    // --- 4. Construct Count Query ---
    const countSql = baseSqlCount + whereClause;

    // --- 5. Execute Count Query ---
    db.get(countSql, params, (errCount, countResult) => {
        if (errCount) {
            console.error("DB Error fetching job count:", errCount.message);
            // Render the page with an error and defaults
            return res.render('jobs/list_jobs', { // Ensure template name is correct
                jobs: [],
                error: 'Could not retrieve job count at this time.',
                currentPage: 1,
                totalPages: 0,
                limit: limit,
                totalJobs: 0,
                search: searchTerm,
                category: jobType,
                department: departmentFilter
                    // Add generateQueryString helper if needed in template
            });
        }

        const totalJobs = countResult ? countResult.count : 0;

        // --- 6. Calculate Total Pages ---
        const totalPages = Math.ceil(totalJobs / limit);
        // Adjust currentPage if it's out of bounds after filtering/counting
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages; // Go to last page if current page doesn't exist
            // Recalculate offset if currentPage changed
            // Note: For simplicity here, we might just show an empty page.
            // A redirect (res.redirect) to the last valid page is another option.
        }
        // Ensure offset is recalculated if needed, but for now, we proceed. The query will just return 0 rows if offset is too high.

        // --- 7. Construct Jobs Query (with LIMIT/OFFSET) ---
        const jobsSql = baseSqlSelect + whereClause + " ORDER BY j.created_at DESC LIMIT ? OFFSET ?";
        const jobsParams = [...params, limit, offset]; // Add limit and offset to params for this query

        // --- 8. Execute Jobs Query ---
        db.all(jobsSql, jobsParams, (errJobs, jobs) => {
            if (errJobs) {
                console.error("DB Error fetching jobs:", errJobs.message);
                // Render the page with an error
                return res.render('jobs/list_jobs', { // Ensure template name is correct
                    jobs: [],
                    error: 'Could not retrieve jobs at this time.',
                    currentPage: currentPage, // Use potentially adjusted currentPage
                    totalPages: totalPages,
                    limit: limit,
                    totalJobs: totalJobs,
                    search: searchTerm,
                    category: jobType,
                    department: departmentFilter
                });
            }

            // --- 9. Render Template with All Data ---
            res.render('jobs/list_jobs', { // Ensure template name is correct
                jobs: jobs,
                error: null,
                // Pagination data
                currentPage: currentPage,
                totalPages: totalPages,
                limit: limit,
                totalJobs: totalJobs,
                // Pass back search terms to repopulate form
                search: searchTerm,
                category: jobType,
                department: departmentFilter,
                // You might want a helper function passed to the template
                // to easily construct query strings for pagination links:
                buildQueryString: (queryParams) => {
                    // Build query string preserving existing filters
                    const currentParams = { search: searchTerm, category: jobType, department: departmentFilter, limit: limit, ...queryParams };
                    // Remove empty params
                    Object.keys(currentParams).forEach(key => {
                        if (currentParams[key] === '' || currentParams[key] === null || currentParams[key] === undefined) {
                            delete currentParams[key];
                        }
                    });
                    return new URLSearchParams(currentParams).toString();
                }
            });
        }); // End db.all for jobs
    }); // End db.get for count
}); // End router.get('/')

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