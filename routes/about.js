const express = require('express');

const router = express.Router();

// Route to render the About Us page
router.get('/', (req, res) => {
    res.render('AboutUs'); // Assumes there is an 'about.ejs' file in the views folder
});

// Export the router to be used in app.js
module.exports = router;