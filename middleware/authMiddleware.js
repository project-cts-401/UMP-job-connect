
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/auth/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (req.session.role !== 'admin') {
        return res.status(403).send('Forbidden: Admin access required.');
    }
    next();
}

function requireStudent(req, res, next) {
     if (req.session.role !== 'student') {
        return res.status(403).send('Forbidden: Student access required.');
    }
    next();
}

module.exports = {
    requireLogin,
    requireAdmin,
    requireStudent
};