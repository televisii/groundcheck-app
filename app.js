const express = require('express');
const pool = require('./db');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
require('dotenv').config();

const app = express();

// --- SETUP VIEW & MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SESSION CONFIGURATION ---
app.use(session({
    store: new pgSession({ pool: pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'gc-pro-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 Hari
}));

// --- CUSTOM MIDDLEWARE ---

// 1. Cek Login
const checkAuth = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// 2. Cek Admin (Hanya Role Admin yang boleh lewat)
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).send("⛔ Akses Ditolak: Halaman ini khusus Administrator.");
};

// --- AUTHENTICATION ROUTES ---

app.get('/login', (req, res) => res.render('login'));

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const match = await bcrypt.compare(password, user.password);

            if (match) {
                // Simpan user & role ke session
                req.session.user = {
                    id: user.id,
                    nama: user.nama,
                    email: user.email,
                    role: user.role || 'petugas'
                };
                return res.json({ success: true, role: user.role });
            }
        }
        res.status(401).json({ message: 'Email atau Password salah!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- MAIN ROUTE (REDIRECTOR) ---

app.get('/', checkAuth, (req, res) => {
    // Jika Admin -> ke Dashboard
    if (req.session.user.role === 'admin') {
        res.redirect('/admin/dashboard');
    } else {
        // Jika Petugas -> ke Peta Verifikasi
        res.render('groundcheck', { user: req.session.user });
    }
});

// --- FITUR KHUSUS ADMIN ---

// 1. Dashboard Monitoring (Update: Support AJAX/Real-time)
app.get('/admin/dashboard', checkAuth, checkAdmin, async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        // A. Statistik Global (Tetap)
        const totalUsaha = await pool.query('SELECT COUNT(*) FROM lokasi_usaha');
        const sudahVerif = await pool.query('SELECT COUNT(*) FROM lokasi_usaha WHERE is_verified = TRUE');
        const belumVerif = await pool.query('SELECT COUNT(*) FROM lokasi_usaha WHERE is_verified = FALSE');

        // B. Leaderboard Data
        const queryLeaderboard = `
            SELECT petugas_nama, petugas_email, COUNT(*) as total_kerja 
            FROM lokasi_usaha 
            WHERE is_verified = TRUE AND petugas_nama ILIKE $1
            GROUP BY petugas_nama, petugas_email 
            ORDER BY total_kerja DESC
        `;

        const allResult = await pool.query(queryLeaderboard, [`%${search}%`]);
        const totalData = allResult.rows.length;
        const totalPages = Math.ceil(totalData / limit);
        const paginatedData = allResult.rows.slice(offset, offset + limit);

        // --- [BAGIAN BARU] CEK REQUEST AJAX ---
        // Jika request datang dari ketikan pencarian (background), kirim JSON saja
        if (req.query.ajax) {
            return res.json({
                leaderboard: paginatedData,
                pagination: { page, totalPages, search }
            });
        }
        // --------------------------------------

        res.render('admin-dashboard', {
            user: req.session.user,
            stats: {
                total: parseInt(totalUsaha.rows[0].count),
                verified: parseInt(sudahVerif.rows[0].count),
                pending: parseInt(belumVerif.rows[0].count)
            },
            leaderboard: paginatedData,
            pagination: { page, totalPages, search }
        });

    } catch (err) {
        res.status(500).send("Error Dashboard: " + err.message);
    }
});

// 2. Export Data ke Excel (.xlsx)
app.get('/admin/export', checkAuth, checkAdmin, async (req, res) => {
    try {
        // PERBAIKAN: Gunakan TO_CHAR agar waktu terkunci sebagai Teks (tidak diubah ExcelJS)
        const result = await pool.query(`
            SELECT idsbr, nama_usaha, alamat_usaha, status_usaha, 
                   latitude, longitude, petugas_nama, petugas_email, 
                   TO_CHAR(waktu_verifikasi, 'DD/MM/YYYY HH24:MI:SS') as waktu_fix 
            FROM lokasi_usaha 
            WHERE is_verified = TRUE
            ORDER BY waktu_verifikasi DESC
        `);

        // Setup Workbook Excel Baru
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Data Verifikasi');

        // Setup Header Kolom
        worksheet.columns = [
            { header: 'IDSBR', key: 'idsbr', width: 20 },
            { header: 'Nama Usaha', key: 'nama_usaha', width: 35 },
            { header: 'Alamat', key: 'alamat_usaha', width: 50 },
            { header: 'Status', key: 'status_usaha', width: 15 },
            { header: 'Latitude', key: 'latitude', width: 15 },
            { header: 'Longitude', key: 'longitude', width: 15 },
            { header: 'Nama Petugas', key: 'petugas_nama', width: 25 },
            { header: 'Email Petugas', key: 'petugas_email', width: 30 },
            { header: 'Waktu Verifikasi', key: 'waktu_fix', width: 25 },
        ];

        // Style Header (Bold)
        worksheet.getRow(1).font = { bold: true };

        // Masukkan Data dari Database ke Excel
        result.rows.forEach(row => {
            worksheet.addRow(row);
        });

        // Set Header HTTP agar browser mendownload file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Export_GC_Pro_${Date.now()}.xlsx`);

        // Tulis file ke response
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        res.status(500).send("Error Export Excel: " + err.message);
    }
});

// --- API ROUTES (UNTUK PETUGAS & PETA) ---

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
                 VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, (NOW() AT TIME ZONE 'Asia/Jakarta'))`,
                ['NEW-' + Date.now(), nama_usaha, alamat_usaha, kode_desa, lat, lng, petugas, petugas_email, status_usaha]
            );
        } else {
            const check = await pool.query('SELECT is_verified, petugas_email FROM lokasi_usaha WHERE idsbr = $1', [idsbr]);

            // Cek apakah data dikunci (kecuali admin)
            if (check.rows[0].is_verified && check.rows[0].petugas_email !== petugas_email) {
                if (req.session.user.role !== 'admin') {
                    return res.status(403).json({ message: 'Data dikunci petugas lain!' });
                }
            }

            await pool.query(
                `UPDATE lokasi_usaha SET latitude=$1, longitude=$2, is_verified=TRUE, petugas_nama=$3, petugas_email=$4, status_usaha=$5, waktu_verifikasi=(NOW() AT TIME ZONE 'Asia/Jakarta') WHERE idsbr=$6`,
                [lat, lng, petugas, petugas_email, status_usaha, idsbr]
            );
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- JALANKAN SERVER ---
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));