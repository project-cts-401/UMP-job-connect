const express = require("express");
const path = require("path");
const db = require('./database/connection');
const app = express();
const session = require('express-session');
const createSqliteStore = require('connect-sqlite3')(session);
require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(session({
    store: new createSqliteStore({
        db: 'sessions.db',
        dir: path.join(__dirname, 'database'),
        table: 'sessions'
    }),
    secret: process.env.SESSION_SECRET || 'a-default-fallback-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

const adminRoutes = require('./routes/admin');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const { requireLogin, requireAdmin, requireStudent } = require('./middleware/authMiddleware');

app.use('/', require("./routes/home"));
app.use('/auth', require("./routes/auth"));

// Apply middleware directly to route groups
app.use('/admin', requireLogin, requireAdmin, adminRoutes); // Requires login AND admin role
app.use('/jobs', requireLogin, jobRoutes); // Requires login (students apply within specific POST route)
app.use('/applications', requireLogin, requireStudent, applicationRoutes); // Requires login AND student role

const PORT = process.env.PORT || 2403;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});