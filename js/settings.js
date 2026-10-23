function initializeNavigationSettings() {
    const styleSelect = document.getElementById('navigationStyle');
    const sizeSelect = document.getElementById('navigationSize');
    const preview = document.querySelector('.settings-preview');

    styleSelect.value = document.body.dataset.navStyle || 'adaptive';
    sizeSelect.value = document.body.dataset.navSize || 'medium';

    const saveSettings = () => {
        applyNavigationSettings(styleSelect.value, sizeSelect.value);
        localStorage.setItem('hotel-portal-nav-style', styleSelect.value);
        localStorage.setItem('hotel-portal-nav-size', sizeSelect.value);
        preview.dataset.navStyle = styleSelect.value;
        preview.dataset.navSize = sizeSelect.value;
    };

    styleSelect.addEventListener('change', saveSettings);
    sizeSelect.addEventListener('change', saveSettings);
    saveSettings();

    initializeRoomSettings();
}

function initializeRoomSettings() {
    const form = document.getElementById('addRoomForm');
    const input = document.getElementById('newRoomNumber');
    const button = document.getElementById('addRoomButton');

    form.addEventListener('submit', event => {
        event.preventDefault();
        const room = input.value.trim();
        if (!room) return;

        button.disabled = true;
        button.textContent = 'Adding...';
        sendDataToGoogleSheet(
            { action: 'addRoom', room: room },
            null,
            'Add room',
            button,
            loadSettingsRoomList
        );
        document.getElementById('settingsRoomMessage').textContent =
            'Add request sent. Refresh the list to confirm the room was saved.';
    });

    loadSettingsRoomList();
}

function loadSettingsRoomList() {
    const message = document.getElementById('settingsRoomMessage');
    const list = document.getElementById('settingsRoomList');
    if (!message || !list) return;

    message.textContent = 'Loading room numbers...';
    fetchPortalData()
        .then(data => {
            const rooms = data.rooms || [];
            if (rooms.length === 0) {
                list.innerHTML = '';
                message.textContent = 'No rooms registered yet.';
                return;
            }

            list.innerHTML = rooms.map(room => {
                const item = document.createElement('li');
                item.textContent = room.room;
                return `<li>${item.innerHTML}</li>`;
            }).join('');
            message.textContent = `${rooms.length} rooms registered`;
        })
        .catch(error => {
            console.error('Room list load failed:', error);
            message.textContent = `Could not load room numbers: ${error.message}`;
            list.innerHTML = '';
        });
}
