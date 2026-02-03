const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const EXCEL_FILE = 'datausaha_update_system.xlsx';

async function runSystemUpdate() {
    const workbook = new ExcelJS.Workbook();
    const filePath = path.join(__dirname, EXCEL_FILE);

    console.log(`\n🤖 SYSTEM AUTO-VERIFICATION (Status + Lokasi)`);
    console.log(`📂 Membaca file: ${EXCEL_FILE}...\n`);

    try {
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);

        let successCount = 0;
        let notFoundCount = 0;
        let errorCount = 0;

        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) rows.push(row);
        });

        console.log(`🚀 Memproses ${rows.length} data usaha...\n`);

        for (const row of rows) {
            // --- BACA KOLOM EXCEL ---
            // Col 1: IDSBR
            // Col 2: Status
            // Col 3: Latitude (Baru)
            // Col 4: Longitude (Baru)

            let idsbr = row.getCell(1).text ? row.getCell(1).text.trim() : null;
            let status = row.getCell(2).text ? row.getCell(2).text.trim() : null;
            let lat = row.getCell(3).value; 
            let lng = row.getCell(4).value; 

            // Validasi: Data wajib ada semua
            if (!idsbr || !status || !lat || !lng) {
                console.log(`⚠️  [SKIP] Data tidak lengkap pada baris ${row.number}`);
                continue;
            }

            try {
                // --- QUERY UPDATE ---
                const query = `
                    UPDATE lokasi_usaha 
                    SET 
                        status_usaha = $1, 
                        latitude = $2,
                        longitude = $3,
                        is_verified = TRUE, 
                        petugas_nama = 'SYSTEM', 
                        petugas_email = 'system@auto',
                        waktu_verifikasi = (NOW() AT TIME ZONE 'Asia/Jakarta')
                    WHERE idsbr = $4
                `;

                const res = await pool.query(query, [status, lat, lng, idsbr]);

                if (res.rowCount > 0) {
                    console.log(`✅ [${idsbr}] Updated -> ${status} | 📍 ${lat}, ${lng}`);
                    successCount++;
                } else {
                    console.log(`⛔ [${idsbr}] Tidak ditemukan di database.`);
                    notFoundCount++;
                }

            } catch (err) {
                console.error(`❌ [${idsbr}] Error SQL: ${err.message}`);
                errorCount++;
            }
        }

        console.log(`\n========================================`);
        console.log(`🎉 PROSES SELESAI!`);
        console.log(`✅ Berhasil Update : ${successCount}`);
        console.log(`⛔ IDSBR Tidak Ada : ${notFoundCount}`);
        console.log(`❌ Error Sistem    : ${errorCount}`);
        console.log(`========================================\n`);

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`❌ Error: File '${EXCEL_FILE}' tidak ditemukan!`);
        } else {
            console.error("❌ Gagal membaca file Excel:", err.message);
        }
    } finally {
        await pool.end();
    }
}


runSystemUpdate();