// routes/jobs.js
const express = require('express');
const router = express.Router();
const db = require('../database/connection'); // Assuming your db connection is here
const multer = require('multer'); // <-- Added for file uploads
const path = require('path'); // <-- Added for handling file paths
const fs = require('fs'); // <-- Added for file system operations (checking/deleting files)
const { requireLogin, requireAdmin, requireStudent } = require('../middleware/authMiddleware');

// --- Multer Configuration (Place near the top) ---
const uploadDir = path.join(__dirname, '..', 'uploads', 'application_docs'); // Store uploads

// Ensure upload directory exists
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadDir); // Set destination folder
    },
    filename: function(req, file, cb) {
        // Create a unique filename
        const studentId = req.session.userId || 'unknown'; // Handle case where session might not exist yet
        const jobId = req.params.jobId || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `${studentId}_${jobId}_${file.fieldname}_${uniqueSuffix}${path.extname(file.originalname)}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        // Use request object to pass error, multer itself might not directly support this way
        req.fileValidationError = 'Invalid file type. Only PDF files are allowed.';
        cb(null, false); // Reject file, handle error in route
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // Example: 5MB file size limit
}).fields([ // Use .fields() for named file inputs
    { name: 'id_document', maxCount: 1 },
    { name: 'tax_proof', maxCount: 1 },
    { name: 'bank_proof', maxCount: 1 }
]);
// --- End Multer Configuration ---


// GET route to list all *open* jobs (NOW WITH FILTERING)
// (Your existing code - seems okay, keeping as is)
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
    `;
    const baseSqlCount = `
        SELECT COUNT(*) as count
        FROM job_posts j
        JOIN faculty_admins f ON j.posted_by_admin_id = f.id
    `;

    const conditions = [];
    const params = []; // Parameters for filtering

    conditions.push("j.status = ?");
    params.push('Open');

    if (searchTerm) {
        conditions.push("j.title LIKE ?");
        params.push(`%${searchTerm}%`);
    }
    if (jobType) {
        conditions.push("j.job_type = ?");
        params.push(jobType);
    }
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
            return res.render('jobs/list_jobs', {
                jobs: [],
                error: 'Could not retrieve job count at this time.',
                currentPage: 1,
                totalPages: 0,
                limit: limit,
                totalJobs: 0,
                search: searchTerm,
                category: jobType,
                department: departmentFilter
            });
        }

        const totalJobs = countResult ? countResult.count : 0;
        const totalPages = Math.ceil(totalJobs / limit);

        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
            // Re-calculate offset is technically needed here for accuracy if page changed
            // offset = (currentPage - 1) * limit;
            // For simplicity, we proceed; DB query will handle offset exceeding rows.
        }

        // --- 7. Construct Jobs Query (with LIMIT/OFFSET) ---
        const jobsSql = baseSqlSelect + whereClause + " ORDER BY j.created_at DESC LIMIT ? OFFSET ?";
        // Recalculate offset before creating params IF currentPage was adjusted AND it matters
        const currentOffset = (currentPage - 1) * limit;
        const jobsParams = [...params, limit, currentOffset]; // Use potentially adjusted offset

        // --- 8. Execute Jobs Query ---
        db.all(jobsSql, jobsParams, (errJobs, jobs) => {
            if (errJobs) {
                console.error("DB Error fetching jobs:", errJobs.message);
                return res.render('jobs/list_jobs', {
                    jobs: [],
                    error: 'Could not retrieve jobs at this time.',
                    currentPage: currentPage,
                    totalPages: totalPages,
                    limit: limit,
                    totalJobs: totalJobs,
                    search: searchTerm,
                    category: jobType,
                    department: departmentFilter
                });
            }

            // --- 9. Render Template with All Data ---
            res.render('jobs/list_jobs', {
                jobs: jobs,
                error: null,
                currentPage: currentPage,
                totalPages: totalPages,
                limit: limit,
                totalJobs: totalJobs,
                search: searchTerm,
                category: jobType,
                department: departmentFilter,
                buildQueryString: (queryParams) => {
                    const currentParams = { search: searchTerm, category: jobType, department: departmentFilter, limit: limit, ...queryParams };
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


// GET route to view details of a single job
// (Your existing code - seems okay, keeping as is)
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
            // Optionally use flash messages here too
            // req.flash('error', 'Job not found.');
            // return res.redirect('/jobs');
            return res.status(404).render('error', { message: "Job not found." }); // Assuming you have an error view
        }
        // Pass flash messages if they exist
        res.render('jobs/detail_job', {
            job: job,
            error: req.flash ? req.flash('error') : null, // Use flash if available
            message: req.flash ? req.flash('success') : null
        });
    });
});


// *** NEW *** GET route to DISPLAY the detailed application form
router.get('/:jobId/apply', requireLogin, (req, res) => {
    const jobId = req.params.jobId;
    const studentId = req.session.userId;

    // Use flash messages for redirect errors if available (install connect-flash and configure in app.js)
    const flashError = req.flash ? (type, message) => req.flash(type, message) : (type, message) => console.log(`FLASH ${type}: ${message}`); // Fallback

    // 1. Check Login & Role
    if (!studentId || req.session.role !== 'student') {
        flashError('error', 'You must be logged in as a student to apply.');
        // Store intended destination to redirect after login
        req.session.redirectTo = `/jobs/${jobId}/apply`;
        return res.redirect(`/auth/login`);
    }

    // 2. Fetch Job Details
    const fetchJobSql = `SELECT id, title, status FROM job_posts WHERE id = ?`; // Only fetch needed fields
    db.get(fetchJobSql, [jobId], (jobErr, job) => {
        if (jobErr) {
            console.error("DB Error fetching job for apply form:", jobErr.message);
            flashError('error', 'Error retrieving job details.');
            return res.redirect('/jobs');
        }
        if (!job) {
            flashError('error', 'Job not found.');
            return res.redirect('/jobs');
        }
        if (job.status !== 'Open') {
            flashError('error', 'This job is no longer accepting applications.');
            return res.redirect(`/jobs/${jobId}`); // Redirect back to job detail
        }

        // 3. Check if Already Applied
        const checkSql = `SELECT id FROM applications WHERE job_post_id = ? AND student_id = ?`;
        db.get(checkSql, [jobId, studentId], (checkErr, existingApp) => {
            if (checkErr) {
                console.error("DB Error checking existing application for form:", checkErr.message);
                flashError('error', 'Error checking application status.');
                return res.redirect(`/jobs/${jobId}`);
            }
            if (existingApp) {
                flashError('error', 'You have already applied for this job.');
                return res.redirect(`/jobs/${jobId}`);
            }

            // 4. Render the Application Form View
            // Pass job details and potentially any formData from a previous failed POST attempt (using flash?)
            // Note: Passing large formData via flash isn't ideal. Re-rendering from POST is better for that.
            res.render('jobs/apply_form', { // Assumes you have this EJS file
                job: job,
                error: req.flash ? req.flash('error') : null,
                message: req.flash ? req.flash('success') : null,
                formData: req.flash ? req.flash('formData')[0] : {} // Get flashed form data if exists
            });
        });
    });
});


// *** MODIFIED *** POST route for a student to apply (handles detailed form and files)
router.post('/:jobId/apply', requireLogin, (req, res) => {
    const jobId = req.params.jobId;
    const studentId = req.session.userId;

    // Use flash messages if available
    const flashError = req.flash ? (type, message) => req.flash(type, message) : (type, message) => console.log(`FLASH ${type}: ${message}`);
    const flashFormData = req.flash ? (data) => req.flash('formData', data) : (data) => {};

    // 1. Check Login & Role (redundant if middleware handles it, but good defense)
    if (!studentId || req.session.role !== 'student') {
        flashError('error', 'Authentication error.');
        return res.redirect('/auth/login');
    }

    // 2. --- Use Multer Middleware ---
    upload(req, res, function(uploadErr) {

        // --- Helper function to render form with error ---
        const renderFormWithError = (errorMessage, currentFormData = {}) => {
            // Fetch essential job details needed for rendering the apply form
            const fetchJobSql = `SELECT id, title FROM job_posts WHERE id = ?`;
            db.get(fetchJobSql, [jobId], (jobErr, job) => {
                if (jobErr || !job) {
                    flashError('error', 'An error occurred. Please try again.');
                    return res.redirect('/jobs'); // Redirect if job details fail
                }
                res.render('jobs/apply_form', { // Render form again
                    job: job,
                    error: errorMessage, // Display the error
                    message: null,
                    formData: currentFormData // Pass back submitted data
                });
            });
        };

        // --- Helper function to clean up uploaded files ---
        const cleanupFiles = (files) => {
            const fileInputs = ['id_document', 'tax_proof', 'bank_proof'];
            fileInputs.forEach(fieldName => {
                if (files && files[fieldName] && files[fieldName][0]) {
                    fs.unlink(files[fieldName][0].path, (err) => { // Use asynchronous unlink
                        if (err) console.error(`Error deleting uploaded file ${files[fieldName][0].path}:`, err);
                    });
                }
            });
        };


        if (uploadErr instanceof multer.MulterError) {
            // A Multer error occurred (e.g., file size limit)
            console.error("Multer Upload Error:", uploadErr.message);
            cleanupFiles(req.files); // Clean up any partial uploads
            return renderFormWithError(`File upload error: ${uploadErr.message}. Please ensure files are PDF and within size limits.`, req.body);
        } else if (uploadErr || req.fileValidationError) {
            // A non-Multer error or our custom file type error occurred
            const errorMessage = req.fileValidationError || (uploadErr ? uploadErr.message : 'An unknown upload error occurred.');
            console.error("File Upload Error:", errorMessage);
            cleanupFiles(req.files);
            return renderFormWithError(errorMessage, req.body);
        }

        // --- Files seem okay structurally, proceed with DB checks/insertion ---

        // 3. Check if files were actually uploaded
        const idDocFile = req.files && req.files['id_document'] ? req.files['id_document'][0] : null;
        const taxProofFile = req.files && req.files['tax_proof'] ? req.files['tax_proof'][0] : null; // Optional?
        const bankProofFile = req.files && req.files['bank_proof'] ? req.files['bank_proof'][0] : null;
        const transcriptFile = req.files && req.files['bank_proof'] ? req.files['bank_proof'][0] : null;

        // 4. Basic validation: Check if required files are present
        // Adjust this logic based on whether tax_proof is truly required
        if (!idDocFile || !bankProofFile /* || !taxProofFile */ ) {
            cleanupFiles(req.files); // Clean up successful uploads before erroring
            console.error("Missing required file uploads");
            return renderFormWithError('Missing required document uploads. Please ensure all required PDFs are selected.', req.body);
        }

        // 5. Extract text data from req.body
        const {
            title,
            initials,
            identity_number, // Removed surname, first_names, student_number, email assuming linked via studentId
            appointment_from,
            appointment_to,
            postal_address,
            postal_code,
            residential_address,
            residential_code,
            cellular_phone,
            bank_name,
            branch_code,
            account_number,
            account_holder_name,
            income_tax_number,
            submission_date
        } = req.body;

        // Basic validation for key text fields (add more as needed)
        if (!identity_number || !cellular_phone || !bank_name || !account_number || !account_holder_name || !submission_date) {
            cleanupFiles(req.files);
            return renderFormWithError('Missing required form fields. Please complete all required entries.', req.body);
        }


        // 6. Extract relative paths for DB storage
        const projectRoot = path.join(__dirname, '..'); // Assumes routes folder is one level down from project root
        const idDocPath = idDocFile ? path.relative(projectRoot, idDocFile.path) : null;
        const taxProofPath = taxProofFile ? path.relative(projectRoot, taxProofFile.path) : null;
        const bankProofPath = bankProofFile ? path.relative(projectRoot, bankProofFile.path) : null;

        // --- 7. Proceed with Database Operations ---
        const checkSql = `SELECT id FROM applications WHERE job_post_id = ? AND student_id = ?`;
        db.get(checkSql, [jobId, studentId], (checkErr, existingApp) => {

            if (checkErr) {
                console.error("DB Error checking existing application:", checkErr.message);
                cleanupFiles(req.files); // Clean up files
                return renderFormWithError('Error checking application status. Please try again.', req.body);
            }
            if (existingApp) {
                cleanupFiles(req.files); // Clean up files
                flashError('error', 'You have already applied for this job.'); // Use flash for redirect
                return res.redirect(`/jobs/${jobId}`); // Redirect back to detail page
            }

            // --- 8. Insert New Application with ALL Details ---
            // Ensure column names match your ALTER TABLE commands exactly
            const insertSql = `
                INSERT INTO applications (
                    job_post_id, student_id, status, application_date,
                    title, initials, identity_number, appointment_from, appointment_to,
                    postal_address, postal_code, residential_address, residential_code,
                    cellular_phone, bank_name, branch_code, account_number, account_holder_name,
                    income_tax_number, submission_date,
                    id_document_path, tax_proof_path, bank_proof_path
                ) VALUES (
                    ?, ?, ?, CURRENT_TIMESTAMP,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `;

            const params = [
                jobId, studentId, 'Submitted',
                title, initials, identity_number, appointment_from, appointment_to,
                postal_address, postal_code, residential_address, residential_code,
                cellular_phone, bank_name, branch_code, account_number, account_holder_name,
                income_tax_number, submission_date,
                idDocPath, taxProofPath, bankProofPath
            ];


            db.run(insertSql, params, function(insertErr) {
                if (insertErr) {
                    console.error("DB Error submitting application:", insertErr.message);
                    cleanupFiles(req.files); // Clean up files on failed insert
                    return renderFormWithError('Database error submitting application. Please try again.', req.body);
                }

                // 9. Success! Redirect with success message
                if (req.flash) req.flash('success', 'Application submitted successfully!');
                res.redirect('/applications/my'); // Redirect to student's application list
            }); // End db.run
        }); // End db.get (check existing)
    }); // End of upload middleware callback
});


module.exports = router; // Export the router