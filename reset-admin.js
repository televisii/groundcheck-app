const pool = require('./db');
const bcrypt = require('bcrypt');

async function resetAdmin() {
    const email = 'admin@desa.id'; // Email khusus admin
    const password = 'password123';
    const nama = 'Administrator Utama';
    const role = 'admin'; // <--- TAMBAHAN: Role Admin

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await pool.query('DELETE FROM users WHERE email = $1', [email]);

        // Insert dengan Role
        await pool.query(
            'INSERT INTO users (email, nama, password, role) VALUES ($1, $2, $3, $4)',
            [email, nama, hashedPassword, role]
        );

        console.log('--- SUKSES ---');
        console.log(`User: ${email} | Role: ${role}`);
    } catch (err) {
        console.error('Gagal:', err);
    } finally {
        process.exit();
    }
}

resetAdmin();