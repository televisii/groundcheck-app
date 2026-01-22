const ExcelJS = require('exceljs');
const pool = require('./db'); // Pastikan db.js ada dan benar
const bcrypt = require('bcrypt');

async function importUsers() {
    const filePath = './data_petugas.xlsx'; // Nama file Excel harus sama
    const workbook = new ExcelJS.Workbook();

    try {
        console.log('🔄 Sedang membaca file Excel...');
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1); // Ambil sheet pertama

        console.log('🚀 Mulai proses import user...');

        let successCount = 0;
        let failCount = 0;
        let processedRows = 0;

        // Loop baris demi baris
        for (let i = 1; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);

            // 1. SKIP HEADER (Baris 1)
            if (i === 1) {
                console.log('⏭️  Melewati baris Header...');
                continue;
            }

            // 2. Ambil Data (A=1, B=2, C=3)
            // .text digunakan untuk menjaga keamanan jika cell berupa link/formula
            const nama = row.getCell(1).text || row.getCell(1).value?.toString();
            const email = row.getCell(2).text || row.getCell(2).value?.toString();
            const rawPassword = row.getCell(3).text || row.getCell(3).value?.toString();

            // Cek jika baris kosong
            if (!nama || !email || !rawPassword) {
                continue;
            }

            processedRows++;

            try {
                // 3. Cek Duplikasi Email di Database
                const check = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim()]);
                if (check.rows.length > 0) {
                    console.log(`⚠️ SKIP: ${email} sudah ada.`);
                    failCount++;
                    continue;
                }

                // 4. Enkripsi Password (Hashing)
                const hashedPassword = await bcrypt.hash(rawPassword.toString().trim(), 10);

                // 5. Masukkan ke Database (Role otomatis 'petugas')
                await pool.query(
                    'INSERT INTO users (nama, email, password, role) VALUES ($1, $2, $3, $4)',
                    [nama.trim(), email.trim(), hashedPassword, 'petugas']
                );

                console.log(`✅ OKE: ${nama}`);
                successCount++;

            } catch (err) {
                console.error(`❌ ERROR ${email}:`, err.message);
                failCount++;
            }
        }

        console.log('\n===============================');
        console.log(`🎉 IMPORT SELESAI!`);
        console.log(`📄 Total Data Dibaca : ${processedRows}`);
        console.log(`✅ Berhasil Masuk    : ${successCount}`);
        console.log(`⚠️ Gagal/Skip        : ${failCount}`);
        console.log('===============================');

    } catch (err) {
        console.error('FATAL ERROR:', err.message);
        console.log('TIPS: Pastikan nama file excel adalah "data_petugas.xlsx"');
    } finally {
        pool.end(); // Tutup koneksi database
    }
}

importUsers();