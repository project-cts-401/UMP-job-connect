const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./database/job-connect.db', (err)=> {
    if(err) {
        console.log(err, 'Opps! there was an error while trying to connect to the database.');
    } else{
        console.log('Connected to the database.');
    }
});

module.exports = db;