/**
 * QIN Portal - Modules Logic
 * Berisi fungsi penanganan form dari masing-masing modul hotel
 */

// 1. Modul: Shift Handover Log
function submitShiftLog(e) {
    e.preventDefault();
    const btn = document.getElementById('submitShiftBtn');
    btn.innerText = 'Menyimpan...';
    btn.disabled = true;

    const formData = {
        action: 'shiftLog',
        shift: document.getElementById('shiftName').value,
        petugas: document.getElementById('shiftStaff').value,
        catatan: document.getElementById('shiftNotes').value,
        kendala: document.getElementById('shiftIssues').value
    };

    sendDataToGoogleSheet(formData, 'shiftForm', 'Simpan Operan Shift', btn);
}

// 2. Modul: Maintenance Request
function submitMaintenance(e) {
    e.preventDefault();
    const btn = document.getElementById('submitMaintBtn');
    btn.innerText = 'Mengirim...';
    btn.disabled = true;

    const formData = {
        action: 'maintenance',
        kamar: document.getElementById('maintRoom').value,
        kerusakan: document.getElementById('maintDesc').value,
        prioritas: document.getElementById('maintPriority').value,
        pelapor: document.getElementById('maintReporter').value
    };

    sendDataToGoogleSheet(formData, 'maintenanceForm', 'Kirim Laporan', btn);
}

// 3. Modul: Lost & Found Registry
function submitLostFound(e) {
    e.preventDefault();
    const btn = document.getElementById('submitLfBtn');
    btn.innerText = 'Menyimpan...';
    btn.disabled = true;

    const formData = {
        action: 'lostFound',
        item: document.getElementById('lfItemName').value,
        room: document.getElementById('lfRoom').value,
        date: document.getElementById('lfDate').value,
        finder: document.getElementById('lfFinder').value
    };

    sendDataToGoogleSheet(formData, 'lostFoundForm', 'Simpan Data Lost & Found', btn);
}