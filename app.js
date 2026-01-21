const express = require('express');
const pool = require('./db');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    store: new pgSession({ pool: pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'gc-pro-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

const checkAuth = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

app.get('/login', (req, res) => res.render('login'));

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.user = { id: user.id, nama: user.nama, email: user.email };
                return res.json({ success: true });
            }
        }
        res.status(401).json({ message: 'Email atau Password salah!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', checkAuth, (req, res) => res.render('groundcheck', { user: req.session.user }));

app.get('/api/stats-petugas', checkAuth, async (req, res) => {
    const result = await pool.query(
        'SELECT COUNT(*) FROM lokasi_usaha WHERE petugas_email = $1 AND is_verified = TRUE', 
        [req.session.user.email]
    );
    res.json({ total: result.rows[0].count });
});

app.get(['/api/wilayah', '/api/wilayah/:parent'], async (req, res) => {
    const parent = req.params.parent || '';
    const query = parent === '' ? 
        `SELECT kode, nama FROM wilayah WHERE LENGTH(kode) <= 7 ORDER BY nama ASC` : 
        `SELECT kode, nama FROM wilayah WHERE kode LIKE $1 AND kode != $2 ORDER BY nama ASC`;
    const params = parent === '' ? [] : [parent + '%', parent];
    const { rows } = await pool.query(query, params);
    res.json(rows);
});

app.get('/api/usaha-pending/:kodeDesa', async (req, res) => {
    const { kodeDesa } = req.params;
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    try {
        const data = await pool.query(
            `SELECT idsbr, nama_usaha, alamat_usaha, is_verified, status_usaha, petugas_email, latitude, longitude 
             FROM lokasi_usaha WHERE kode_desa = $1 AND nama_usaha ILIKE $2 
             ORDER BY is_verified ASC, nama_usaha ASC LIMIT $3 OFFSET $4`,
            [kodeDesa, `%${search}%`, limit, offset]
        );
        const count = await pool.query(`SELECT COUNT(*) FROM lokasi_usaha WHERE kode_desa = $1 AND nama_usaha ILIKE $2`, [kodeDesa, `%${search}%`]);
        
        res.json({ 
            data: data.rows, 
            totalPages: Math.ceil(parseInt(count.rows[0].count) / limit),
            currentPage: page 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/verifikasi', checkAuth, async (req, res) => {
    const { idsbr, lat, lng, petugas, petugas_email, status_usaha, is_new, nama_usaha, alamat_usaha, kode_desa } = req.body;
    try {
        if (is_new) {
            await pool.query(
                `INSERT INTO lokasi_usaha (idsbr, nama_usaha, alamat_usaha, kode_desa, latitude, longitude, is_verified, petugas_nama, petugas_email, status_usaha, waktu_verifikasi) 
                 VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, NOW())`,
                ['NEW-' + Date.now(), nama_usaha, alamat_usaha, kode_desa, lat, lng, petugas, petugas_email, status_usaha]
            );
        } else {
            const check = await pool.query('SELECT is_verified, petugas_email FROM lokasi_usaha WHERE idsbr = $1', [idsbr]);
            if (check.rows[0].is_verified && check.rows[0].petugas_email !== petugas_email) {
                return res.status(403).json({ message: 'Data dikunci petugas lain!' });
            }
            await pool.query(
                `UPDATE lokasi_usaha SET latitude=$1, longitude=$2, is_verified=TRUE, petugas_nama=$3, petugas_email=$4, status_usaha=$5, waktu_verifikasi=NOW() WHERE idsbr=$6`,
                [lat, lng, petugas, petugas_email, status_usaha, idsbr]
            );
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(3000, () => console.log('Server running on port 3000'));