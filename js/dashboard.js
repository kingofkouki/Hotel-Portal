const roomStatusGroups = [
    { key: 'dirty', label: 'Dirty', countId: 'roomCountDirty', className: 'room-card-dirty' },
    { key: 'clean', label: 'Clean', countId: 'roomCountClean', className: 'room-card-clean' },
    { key: 'inspected', label: 'Inspected', countId: 'roomCountInspected', className: 'room-card-inspected' },
    { key: 'ooo', label: 'Out of Order', countId: 'roomCountOoo', className: 'room-card-ooo' }
];

let dashboardRooms = [];

function renderDataDashboard() {
    document.getElementById('dashboardSearch').addEventListener('input', renderDashboardRooms);
    document.getElementById('dashboardRefresh').addEventListener('click', refreshDashboard);
    refreshDashboard();
}

function refreshDashboard() {
    const status = document.getElementById('dashboardStatus');
    const refreshButton = document.getElementById('dashboardRefresh');
    status.textContent = 'Memuat status kamar...';
    refreshButton.disabled = true;

    fetchPortalData()
        .then(data => {
            dashboardRooms = getLatestDashboardRooms(data);
            updateRoomStatusSummary(dashboardRooms);
            renderDashboardRooms();
        })
        .catch(error => {
            console.error('Room dashboard load failed:', error);
            status.textContent = `Gagal memuat data kamar: ${error.message}`;
            document.getElementById('dashboardRoomGrid').innerHTML =
                '<p class="dashboard-room-empty">Data status kamar tidak tersedia.</p>';
        })
        .finally(() => {
            refreshButton.disabled = false;
        });
}

function getLatestDashboardRooms(data) {
    const latestByRoom = new Map();

    (data.rooms || []).forEach(room => {
        const roomNumber = String(room.room || '').trim();
        if (!roomNumber) return;
        latestByRoom.set(roomNumber.toLowerCase(), {
            room: roomNumber,
            status: String(room.status || 'Dirty (Kotor)'),
            timestamp: String(room.timestamp || '')
        });
    });

    (data.records || [])
        .filter(record => record.mode === 'roomStatus')
        .forEach(record => {
            const details = record.details || [];
            const room = details.find(field => field.label.toLowerCase() === 'room') || details[0];
            const status = details.find(field => field.label.toLowerCase() === 'status') || details[1];
            if (!room || !String(room.value).trim()) return;

            const key = String(room.value).trim().toLowerCase();
            const existing = latestByRoom.get(key);
            const recordTime = Date.parse(record.timestamp);
            const existingTime = existing ? Date.parse(existing.timestamp) : NaN;
            if (!existing || (!Number.isNaN(recordTime) &&
                (Number.isNaN(existingTime) || recordTime > existingTime))) {
                latestByRoom.set(key, {
                    room: String(room.value).trim(),
                    status: status ? String(status.value) : '',
                    timestamp: String(record.timestamp || '')
                });
            }
        });

    return Array.from(latestByRoom.values())
        .sort((first, second) => first.room.localeCompare(second.room, undefined, { numeric: true }));
}

function updateRoomStatusSummary(rooms) {
    const counts = Object.fromEntries(roomStatusGroups.map(group => [group.key, 0]));
    rooms.forEach(room => {
        const group = getRoomStatusGroup(room.status);
        if (group) counts[group.key] += 1;
    });

    roomStatusGroups.forEach(group => {
        document.getElementById(group.countId).textContent = String(counts[group.key]);
    });
}

function renderDashboardRooms() {
    const query = document.getElementById('dashboardSearch').value.trim().toLowerCase();
    const grid = document.getElementById('dashboardRoomGrid');
    const visibleRooms = dashboardRooms.filter(room => room.room.toLowerCase().includes(query));

    if (dashboardRooms.length === 0) {
        grid.innerHTML = '<p class="dashboard-room-empty">Belum ada kamar. Tambahkan nomor kamar melalui Settings.</p>';
    } else if (visibleRooms.length === 0) {
        grid.innerHTML = '<p class="dashboard-room-empty">Nomor kamar tidak ditemukan.</p>';
    } else {
        grid.innerHTML = visibleRooms.map(room => {
            const group = getRoomStatusGroup(room.status);
            const label = group ? group.label : (room.status || 'Unknown');
            const className = group ? group.className : 'room-card-unknown';
            return `
                <article class="dashboard-room-card ${className}" title="Kamar ${escapeDashboardText(room.room)} — ${escapeDashboardText(label)}">
                    <span class="dashboard-room-number">${escapeDashboardText(room.room)}</span>
                    <span class="dashboard-room-status">${escapeDashboardText(label)}</span>
                </article>
            `;
        }).join('');
    }

    document.getElementById('dashboardStatus').textContent =
        `${visibleRooms.length} dari ${dashboardRooms.length} kamar`;
}

function getRoomStatusGroup(statusValue) {
    const status = String(statusValue || '').trim().toLowerCase();
    if (status.startsWith('dirty')) return roomStatusGroups[0];
    if (status.startsWith('clean')) return roomStatusGroups[1];
    if (status.startsWith('inspected')) return roomStatusGroups[2];
    if (status.startsWith('ooo') || status.includes('out of order')) return roomStatusGroups[3];
    return null;
}

function escapeDashboardText(value) {
    const element = document.createElement('span');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
}
