const pool = require('./db'); // pastikan path ke db.js benar
const bcrypt = require('bcrypt');

async function resetAdmin() {
    const email = 'admin@desa.id';
    const password = 'password123';
    const nama = 'Administrator Utama';
    
    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Hapus jika sudah ada
        await pool.query('DELETE FROM users WHERE email = $1', [email]);
        
        // Input ulang
        await pool.query(
            'INSERT INTO users (email, nama, password) VALUES ($1, $2, $3)',
            [email, nama, hashedPassword]
        );
        
        console.log('--- SUKSES ---');
        console.log('User Admin berhasil diperbarui!');
        console.log('Email: ' + email);
        console.log('Pass : ' + password);
        console.log('Hash di DB: ' + hashedPassword);
    } catch (err) {
        console.error('Gagal:', err);
    } finally {
        process.exit();
    }
}

resetAdmin();