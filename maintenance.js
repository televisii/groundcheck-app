const fs = require('fs');
const path = require('path');


const lockFile = path.join(__dirname, 'maintenance.lock');


const command = process.argv[2];

if (command === 'on') {
    try {
        fs.writeFileSync(lockFile, 'MODE MAINTENANCE AKTIF');
        console.log('\n=============================================');
        console.log('🔴 MAINTENANCE MODE: AKTIF');
        console.log('=============================================\n');
    } catch (err) {
        console.error('Gagal mengaktifkan maintenance:', err);
    }
}
else if (command === 'off') {
    try {
        if (fs.existsSync(lockFile)) {

            fs.unlinkSync(lockFile);
            console.log('\n=============================================');
            console.log('🟢 MAINTENANCE MODE: NON-AKTIF');
            console.log('   Website kembali normal.');
            console.log('=============================================\n');
        } else {
            console.log('\n⚠️  Website sudah dalam mode normal (File lock tidak ditemukan).\n');
        }
    } catch (err) {
        console.error('Gagal mematikan maintenance:', err);
    }
}
else {
    console.log('\n❌ Perintah salah!');
    console.log('   Gunakan: node maintenance.js on  (Untuk mengaktifkan)');
    console.log('   Gunakan: node maintenance.js off (Untuk mematikan)\n');
}