let roomStatusRooms = [];
let roomStatusSortKey = 'room';
let roomStatusSortDirection = 'asc';

function initializeRoomStatusModule() {
    document.getElementById('refreshRoomStatus').addEventListener('click', loadRoomStatusTable);
    document.getElementById('roomStatusSearch').addEventListener('input', renderRoomStatusRows);
    document.querySelector('.room-status-table thead').addEventListener('click', event => {
        const button = event.target.closest('.room-status-sort');
        if (!button) return;

        if (button.dataset.sortKey === roomStatusSortKey) {
            roomStatusSortDirection = roomStatusSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            roomStatusSortKey = button.dataset.sortKey;
            roomStatusSortDirection = 'asc';
        }
        updateRoomStatusSortHeaders();
        renderRoomStatusRows();
    });
    document.getElementById('roomStatusRows').addEventListener('click', event => {
        const button = event.target.closest('.room-status-save');
        if (!button) return;

        const room = button.dataset.room;
        const select = Array.from(document.querySelectorAll('.room-status-select'))
            .find(item => item.dataset.room === room);
        const notes = Array.from(document.querySelectorAll('.room-status-notes'))
            .find(item => item.dataset.room === room);
        const staff = Array.from(document.querySelectorAll('.room-status-staff'))
            .find(item => item.dataset.room === room);
        if (!select || !notes || !staff) return;

        button.disabled = true;
        button.textContent = 'Saving...';
        sendDataToGoogleSheet({
            action: 'roomStatus',
            kamar: room,
            status: select.value,
            catatan: notes.value.trim(),
            petugas: staff.value.trim()
        }, null, 'Update', button, loadRoomStatusTable);
    });
    loadRoomStatusTable();
}

function loadRoomStatusTable() {
    const message = document.getElementById('roomStatusTableMessage');
    const rows = document.getElementById('roomStatusRows');
    if (!message || !rows) return;

    message.textContent = 'Memuat status kamar...';
    rows.innerHTML = '<tr><td colspan="6">Memuat status kamar...</td></tr>';

    fetchPortalData()
        .then(data => {
            const latestByRoom = new Map();
            data.rooms.forEach(room => {
                const roomNumber = String(room.room || '').trim();
                if (!roomNumber) return;
                latestByRoom.set(roomNumber.toLowerCase(), {
                    room: roomNumber,
                    status: String(room.status || 'Dirty (Kotor)'),
                    notes: String(room.notes || ''),
                    staff: String(room.staff || ''),
                    timestamp: String(room.timestamp || '')
                });
            });

            data.records
                .filter(isRoomStatusRecord)
                .forEach(record => {
                    const roomRecord = normalizeRoomStatusRecord(record);
                    if (!roomRecord) return;

                    const roomKey = roomRecord.room.toLowerCase();
                    const existing = latestByRoom.get(roomKey);
                    const recordTime = Date.parse(roomRecord.timestamp);
                    const existingTime = existing ? Date.parse(existing.timestamp) : NaN;
                    if (!existing || (!Number.isNaN(recordTime) &&
                        (Number.isNaN(existingTime) || recordTime > existingTime))) {
                        latestByRoom.set(roomKey, roomRecord);
                    }
                });

            roomStatusRooms = Array.from(latestByRoom.values())
                .sort((first, second) => first.room.localeCompare(second.room, undefined, { numeric: true }));

            updateRoomStatusSortHeaders();
            renderRoomStatusRows();
        })
        .catch(error => {
            console.error('Room status load failed:', error);
            message.textContent = `Gagal memuat status kamar: ${error.message}`;
            rows.innerHTML = '<tr><td colspan="6">Status kamar tidak tersedia.</td></tr>';
        });
}

function isRoomStatusRecord(record) {
    const mode = String(record.mode || record.action || '').replace(/[^a-z]/gi, '').toLowerCase();
    return mode === 'roomstatus';
}

function normalizeRoomStatusRecord(record) {
    const details = Array.isArray(record.details) ? record.details : [];
    const getDetail = (...labels) => details.find(field =>
        labels.includes(String(field.label || '').trim().toLowerCase())
    )?.value;
    const room = getDetail('room', 'room number', 'nomor kamar', 'kamar') ??
        record.room ?? record.kamar ?? details[0]?.value;
    if (room == null || !String(room).trim()) return null;

    return {
        room: String(room).trim(),
        status: String(getDetail('status', 'room status', 'status kamar') ??
            record.status ?? details[1]?.value ?? 'Unknown'),
        notes: String(getDetail('notes', 'note', 'catatan') ?? record.notes ?? record.catatan ?? ''),
        staff: String(getDetail('staff', 'petugas') ?? record.staff ?? record.petugas ?? ''),
        timestamp: String(record.timestamp || '')
    };
}

function renderRoomStatusRows() {
    const query = document.getElementById('roomStatusSearch').value.trim().toLowerCase();
    const rows = document.getElementById('roomStatusRows');
    const message = document.getElementById('roomStatusTableMessage');
    const filteredRooms = roomStatusRooms
        .filter(room => room.room.toLowerCase().includes(query))
        .sort((first, second) => {
            const firstValue = first[roomStatusSortKey] || '';
            const secondValue = second[roomStatusSortKey] || '';
            const firstTime = roomStatusSortKey === 'timestamp' ? Date.parse(firstValue) : NaN;
            const secondTime = roomStatusSortKey === 'timestamp' ? Date.parse(secondValue) : NaN;
            const order = !Number.isNaN(firstTime) && !Number.isNaN(secondTime)
                ? firstTime - secondTime
                : String(firstValue).localeCompare(String(secondValue), undefined, {
                    numeric: roomStatusSortKey === 'room',
                    sensitivity: 'base'
                });
            return roomStatusSortDirection === 'asc' ? order : -order;
        });

    if (roomStatusRooms.length === 0) {
        rows.innerHTML = '<tr><td colspan="6">Belum ada nomor kamar. Tambahkan kamar melalui Settings.</td></tr>';
    } else if (filteredRooms.length === 0) {
        rows.innerHTML = '<tr><td colspan="6">Nomor kamar tidak ditemukan.</td></tr>';
    } else {
        rows.innerHTML = filteredRooms.map(room => `
            <tr>
                <td>${escapeRoomStatusText(room.room)}</td>
                <td>
                    <select class="form-control room-status-select" data-room="${escapeRoomAttribute(room.room)}" aria-label="Status kamar ${escapeRoomStatusText(room.room)}">
                        ${getRoomStatusOptions(room.status)}
                    </select>
                </td>
                <td><input class="form-control room-status-notes" data-room="${escapeRoomAttribute(room.room)}" aria-label="Catatan kamar ${escapeRoomStatusText(room.room)}" value="${escapeRoomAttribute(room.notes)}"></td>
                <td><input class="form-control room-status-staff" data-room="${escapeRoomAttribute(room.room)}" aria-label="Petugas kamar ${escapeRoomStatusText(room.room)}" value="${escapeRoomAttribute(room.staff)}"></td>
                <td>${room.timestamp ? renderRoomStatusTimestamp(room.timestamp) : 'Belum diperbarui'}</td>
                <td><button type="button" class="dashboard-page-button room-status-save" data-room="${escapeRoomAttribute(room.room)}">Update</button></td>
            </tr>
        `).join('');
    }

    message.textContent = `${filteredRooms.length} dari ${roomStatusRooms.length} kamar`;
}

function renderRoomStatusTimestamp(value) {
    const timestamp = String(value == null ? '' : value).trim();
    const dateValue = new Date(timestamp);
    if (Number.isNaN(dateValue.getTime())) {
        return escapeRoomStatusText(timestamp);
    }

    const date = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    }).format(dateValue);
    const time = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(dateValue);

    return `<time class="dashboard-timestamp" datetime="${escapeRoomAttribute(timestamp)}"><span>${escapeRoomStatusText(date)}</span><span>${escapeRoomStatusText(time)}</span></time>`;
}

function updateRoomStatusSortHeaders() {
    document.querySelectorAll('.room-status-sort').forEach(button => {
        const isActive = button.dataset.sortKey === roomStatusSortKey;
        const header = button.closest('th');
        header.setAttribute('aria-sort', isActive
            ? roomStatusSortDirection === 'asc' ? 'ascending' : 'descending'
            : 'none');
        button.querySelector('span').textContent = isActive
            ? roomStatusSortDirection === 'asc' ? '↑' : '↓'
            : '';
    });
}

function getRoomStatusOptions(currentStatus) {
    const statuses = [
        'Dirty (Kotor)',
        'Clean (Bersih)',
        'Inspected (Diperiksa)',
        'OOO (Out of Order)'
    ];
    if (currentStatus && !statuses.includes(currentStatus)) statuses.unshift(currentStatus);

    return statuses.map(status => `
        <option value="${escapeRoomAttribute(status)}" ${status === currentStatus ? 'selected' : ''}>
            ${escapeRoomStatusText(status)}
        </option>
    `).join('');
}

function escapeRoomStatusText(value) {
    const element = document.createElement('span');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
}

function escapeRoomAttribute(value) {
    return escapeRoomStatusText(value).replace(/"/g, '&quot;');
}

function getRoomStatusBadgeClass(statusValue) {
    const status = String(statusValue).toLowerCase();
    if (status.startsWith('clean') || status.startsWith('inspected')) return 'status-badge-success';
    if (status.startsWith('dirty')) return 'status-badge-warning';
    if (status.startsWith('ooo')) return 'status-badge-danger';
    return 'status-badge-recorded';
}
