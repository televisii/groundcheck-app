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


const EXCEL_FILE = 'update-allow-wilayah.xlsx';

async function updateWilayahFromExcel() {
    const workbook = new ExcelJS.Workbook();
    const filePath = path.join(__dirname, EXCEL_FILE);

    console.log(`\n📂 Membaca file Excel: ${EXCEL_FILE}...`);

    try {
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);

        let successCount = 0;
        let errorCount = 0;

        console.log("🚀 Memulai proses update database...\n");

        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) rows.push(row);
        });

        for (const row of rows) {


            let kode = row.getCell(1).text;
            let rawStatus = row.getCell(2).value;

            let status = false;
            if (rawStatus === true || rawStatus === 1 || String(rawStatus).toLowerCase() === 'true') {
                status = true;
            }

            // Query Update
            try {
                const res = await pool.query(
                    `UPDATE wilayah SET allow_new = $1 WHERE kode = $2`,
                    [status, kode]
                );

                if (res.rowCount > 0) {
                    console.log(`✅ [${kode}] Updated -> ${status}`);
                    successCount++;
                } else {
                    console.log(`⚠️  [${kode}] Tidak ditemukan di database.`);
                    errorCount++;
                }
            } catch (err) {
                console.error(`❌ [${kode}] Error SQL: ${err.message}`);
                errorCount++;
            }
        }

        console.log(`\n========================================`);
        console.log(`🎉 Selesai!`);
        console.log(`✅ Berhasil Update: ${successCount} wilayah`);
        console.log(`⚠️  Gagal/Skip    : ${errorCount} wilayah`);
        console.log(`========================================\n`);

    } catch (err) {
        console.error("❌ Gagal membaca file Excel:", err.message);
    } finally {
        await pool.end();
    }
}

updateWilayahFromExcel();
