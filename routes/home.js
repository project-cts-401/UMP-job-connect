const express = require('express');
const path = require('path');
const router = express.Router(); // Use express.Router()
const db = require('../database/connection');

// Note: Multer and upload are defined but likely not needed for the GET / route.
// Keep them if other routes in this file might use uploads later.
// const multer = require('multer');
// const upload = multer({ dest: path.join(__dirname, '..', 'uploads', 'resumes') });


router.get('/', (req, res) => {
    // Access user info potentially set by middleware in res.locals
    const currentUser = res.locals.currentUser; // Expects middleware to set this
    const limit = 6; // Max number of jobs to display in the section

    let sql;
    let params = [];

    // Decide which jobs to fetch based on user role
    if (currentUser && currentUser.role === 'admin') {
        // --- Logged-in Admin: Fetch their own latest postings ---
        console.log(`Home route: Fetching jobs for admin ID: ${currentUser.id}`); // Debug log
        sql = `SELECT * FROM job_posts  -- No need to join if only showing own jobs
               WHERE posted_by_admin_id = ?
               ORDER BY created_at DESC
               LIMIT ?`;
        params = [currentUser.id, limit];

    } else {
        // --- Student or Guest: Fetch latest open jobs from anyone ---
        console.log("Home route: Fetching open jobs for student/guest."); // Debug log
        sql = `
            SELECT job_posts.*, faculty_admins.name AS admin_name
            FROM job_posts
            JOIN faculty_admins ON job_posts.posted_by_admin_id = faculty_admins.id
            WHERE job_posts.status = 'Open'
            ORDER BY job_posts.created_at DESC
            LIMIT  ?
        `;
        params = [limit];
    }

    // Execute the determined query
    db.all(sql, params, (err, jobs) => {
        if (err) {
            console.error("DB Error fetching jobs for home:", err.message);
            // Render home page but indicate an error occurred
            // jobs: [] ensures EJS doesn't crash trying to loop null/undefined
            // currentUser is already available via res.locals from middleware
            res.render('Home', {
                jobs: [],
                error: 'Could not load job listings at this time.'
             });
        } else {
            // Render the home page with the fetched jobs
            // currentUser is already available via res.locals from middleware
            res.render('Home', {
                jobs: jobs,
                error: null
            });
        }
    });
});

module.exports = router;