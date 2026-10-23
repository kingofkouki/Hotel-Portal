var PORTAL_SESSION_TTL_SECONDS = 21600;
var PORTAL_LOGIN_LIMIT = 5;
var PORTAL_LOGIN_WINDOW_SECONDS = 900;

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Portal")
    .setTitle("QIN Hotel Portal")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function doPost() {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "error",
      message: "Direct requests are disabled. Sign in through the portal."
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function authenticatePortalUser(username, password) {
  var normalizedUsername = normalizeUsername_(username);
  if (!normalizedUsername || typeof password !== "string" || !password) {
    throw new Error("Username atau password tidak valid.");
  }

  var cache = CacheService.getScriptCache();
  var attemptKey = "portal-login-" + bytesToHex_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizedUsername)
  );
  var attempts = Number(cache.get(attemptKey) || "0");
  if (attempts >= PORTAL_LOGIN_LIMIT) {
    throw new Error("Terlalu banyak percobaan login. Coba lagi dalam 15 menit.");
  }

  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("PORTAL_AUTH_SECRET");
  var usersJson = properties.getProperty("PORTAL_USERS");
  if (!secret || !usersJson) {
    throw new Error("Keamanan portal belum dikonfigurasi oleh administrator.");
  }

  var users;
  try {
    users = JSON.parse(usersJson);
  } catch (error) {
    console.error("PORTAL_USERS is not valid JSON:", error);
    throw new Error("Konfigurasi akun portal bermasalah. Hubungi administrator.");
  }

  var storedHash = users[normalizedUsername];
  var suppliedHash = hmacPassword_(password, secret);
  if (!storedHash || !constantTimeEquals_(storedHash, suppliedHash)) {
    cache.put(attemptKey, String(attempts + 1), PORTAL_LOGIN_WINDOW_SECONDS);
    throw new Error("Username atau password salah.");
  }

  cache.remove(attemptKey);
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put(
    sessionCacheKey_(token),
    normalizedUsername + ":" + storedHash,
    PORTAL_SESSION_TTL_SECONDS
  );
  return {
    status: "success",
    token: token,
    username: normalizedUsername,
    expiresIn: PORTAL_SESSION_TTL_SECONDS
  };
}

function logoutPortalUser(sessionToken) {
  var key = sessionCacheKey_(sessionToken);
  CacheService.getScriptCache().remove(key);
  return { status: "success" };
}

function getPortalData(sessionToken) {
  requirePortalSession_(sessionToken);

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("No active spreadsheet found");
  }

  var routes = [
    { mode: "shiftLog", sheet: "ShiftLog", labels: ["Shift", "Staff", "Notes", "Issues"] },
    { mode: "roomStatus", sheet: "RoomStatus", labels: ["Room", "Status", "Notes", "Staff"] },
    { mode: "lostFound", sheet: "LostFound", labels: ["Item", "Room / area", "Date found", "Finder"] },
    { mode: "maintenance", sheet: "Maintenance", labels: ["Room / area", "Issue", "Priority", "Reporter"] }
  ];
  var records = [];

  routes.forEach(function(route) {
    var sheet = spreadsheet.getSheetByName(route.sheet);
    if (!sheet) {
      throw new Error("Sheet tab not found: " + route.sheet);
    }

    sheet.getDataRange().getValues().forEach(function(row, index) {
      if (row.length === 0 || row.every(function(value) { return value === ""; })) {
        return;
      }
      if (index === 0 && String(row[0]).toLowerCase().indexOf("timestamp") !== -1) {
        return;
      }

      var details = route.labels.map(function(label, fieldIndex) {
        return {
          label: label,
          value: row[fieldIndex + 1] instanceof Date
            ? Utilities.formatDate(row[fieldIndex + 1], Session.getScriptTimeZone(), "yyyy-MM-dd")
            : String(row[fieldIndex + 1] == null ? "" : row[fieldIndex + 1])
        };
      });
      var status = route.mode === "roomStatus"
        ? details[1].value
        : route.mode === "maintenance"
          ? details[2].value
          : "Recorded";

      records.push({
        mode: route.mode,
        timestamp: row[0] instanceof Date
          ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
          : String(row[0] == null ? "" : row[0]),
        details: details,
        status: status
      });
    });
  });

  records.sort(function(a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });

  var roomsByKey = {};
  var roomsSheet = spreadsheet.getSheetByName("Rooms");
  if (roomsSheet && roomsSheet.getLastRow() > 1) {
    roomsSheet.getRange(2, 1, roomsSheet.getLastRow() - 1, 1).getValues()
      .forEach(function(row) {
        var room = String(row[0] == null ? "" : row[0]).trim();
        if (room) {
          roomsByKey[room.toLowerCase()] = {
            room: room,
            status: "Dirty (Kotor)",
            notes: "",
            staff: "",
            timestamp: ""
          };
        }
      });
  }

  records.filter(function(record) {
    return record.mode === "roomStatus";
  }).forEach(function(record) {
    var room = String(record.details[0].value || "").trim();
    if (!room) return;

    var key = room.toLowerCase();
    var current = roomsByKey[key];
    if (!current || !current.timestamp) {
      roomsByKey[key] = {
        room: room,
        status: record.details[1].value,
        notes: record.details[2].value,
        staff: record.details[3].value,
        timestamp: record.timestamp
      };
    }
  });

  var rooms = Object.keys(roomsByKey).map(function(key) {
    return roomsByKey[key];
  }).sort(function(a, b) {
    return a.room.localeCompare(b.room, undefined, { numeric: true });
  });

  return {
    status: "success",
    records: records,
    rooms: rooms
  };
}

function savePortalData(sessionToken, data) {
  requirePortalSession_(sessionToken);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid request data");
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("No active spreadsheet found");
  }

  if (data.action === "addRoom") {
    var roomNumber = normalizeRecordField_(data.room, 30, true);
    var roomsSheet = spreadsheet.getSheetByName("Rooms");
    if (!roomsSheet) roomsSheet = spreadsheet.insertSheet("Rooms");
    if (roomsSheet.getLastRow() === 0) {
      roomsSheet.appendRow(["Room Number", "Added At"]);
    }

    var existingRooms = roomsSheet.getLastRow() > 1
      ? roomsSheet.getRange(2, 1, roomsSheet.getLastRow() - 1, 1).getValues()
      : [];
    var duplicate = existingRooms.some(function(row) {
      return String(row[0]).trim().toLowerCase() === roomNumber.toLowerCase();
    });
    if (!duplicate) {
      roomsSheet.appendRow([roomNumber, new Date()]);
      SpreadsheetApp.flush();
    }
    return {
      status: "success",
      message: duplicate ? "Room already registered" : "Room added"
    };
  }

  var routes = {
    maintenance: {
      sheet: "Maintenance",
      fields: ["kamar", "kerusakan", "prioritas", "pelapor"],
      required: ["kamar", "kerusakan", "prioritas", "pelapor"]
    },
    shiftLog: {
      sheet: "ShiftLog",
      fields: ["shift", "petugas", "catatan", "kendala"],
      required: ["shift", "petugas", "catatan"]
    },
    lostFound: {
      sheet: "LostFound",
      fields: ["item", "room", "date", "finder"],
      required: ["item", "room", "date", "finder"]
    },
    roomStatus: {
      sheet: "RoomStatus",
      fields: ["kamar", "status", "catatan", "petugas"],
      required: ["kamar", "status", "petugas"]
    }
  };
  var route = routes[data.action];
  if (!route) {
    throw new Error("Unknown action");
  }

  var row = [new Date()];
  route.fields.forEach(function(field) {
    var value = normalizeRecordField_(data[field], field === "catatan" || field === "kerusakan" ? 5000 : 500, false);
    if (route.required.indexOf(field) !== -1 && !value) {
      throw new Error("Field is required: " + field);
    }
    row.push(value);
  });

  var sheet = spreadsheet.getSheetByName(route.sheet);
  if (!sheet) {
    throw new Error("Sheet tab not found: " + route.sheet);
  }
  sheet.appendRow(row);
  SpreadsheetApp.flush();
  return { status: "success", message: "Data berhasil disimpan" };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("QIN Portal Admin")
    .addItem("Add or reset portal user", "adminAddPortalUser")
    .addToUi();
}

function adminAddPortalUser() {
  var properties = PropertiesService.getScriptProperties();
  var configuredAdmin = String(properties.getProperty("PORTAL_ADMIN_EMAIL") || "").trim().toLowerCase();
  var activeEmail = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  if (!configuredAdmin || !activeEmail || configuredAdmin !== activeEmail) {
    throw new Error("Only the configured spreadsheet administrator can manage portal users.");
  }
  if (!properties.getProperty("PORTAL_AUTH_SECRET")) {
    throw new Error("Set the PORTAL_AUTH_SECRET Script Property before adding users.");
  }

  var ui = SpreadsheetApp.getUi();
  var usernameResponse = ui.prompt(
    "Portal user",
    "Enter a username (3-50 characters: letters, numbers, dot, underscore, hyphen):",
    ui.ButtonSet.OK_CANCEL
  );
  if (usernameResponse.getSelectedButton() !== ui.Button.OK) return;

  var username = normalizeUsername_(usernameResponse.getResponseText());
  if (!username) {
    ui.alert("Invalid username. Use 3-50 letters, numbers, dots, underscores, or hyphens.");
    return;
  }

  var passwordResponse = ui.prompt(
    "Portal password",
    "Enter a password with at least 12 characters. The password is stored only as a keyed hash.",
    ui.ButtonSet.OK_CANCEL
  );
  if (passwordResponse.getSelectedButton() !== ui.Button.OK) return;

  var password = passwordResponse.getResponseText();
  if (password.length < 12) {
    ui.alert("Password must contain at least 12 characters.");
    return;
  }

  createPortalUser_(username, password);
  ui.alert("Portal user saved. Share the credentials with the staff member securely.");
}

function createPortalUser_(username, password) {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("PORTAL_AUTH_SECRET");
  if (!secret) throw new Error("PORTAL_AUTH_SECRET is not configured.");
  var normalizedUsername = normalizeUsername_(username);
  if (!normalizedUsername) throw new Error("Invalid username.");
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Password must contain at least 12 characters.");
  }

  var users = {};
  var existing = properties.getProperty("PORTAL_USERS");
  if (existing) {
    try {
      users = JSON.parse(existing);
    } catch (error) {
      console.error("PORTAL_USERS is not valid JSON:", error);
      throw new Error("Existing user configuration is invalid.");
    }
  }
  users[normalizedUsername] = hmacPassword_(password, secret);
  properties.setProperty("PORTAL_USERS", JSON.stringify(users));
}

function requirePortalSession_(sessionToken) {
  if (typeof sessionToken !== "string" || sessionToken.length < 32 || sessionToken.length > 128) {
    throw new Error("Session expired. Sign in again.");
  }
  var cache = CacheService.getScriptCache();
  var cacheKey = sessionCacheKey_(sessionToken);
  var session = cache.get(cacheKey);
  if (!session) throw new Error("Session expired. Sign in again.");

  var separator = session.indexOf(":");
  if (separator < 1) {
    cache.remove(cacheKey);
    throw new Error("Session expired. Sign in again.");
  }
  var username = session.slice(0, separator);
  var sessionPasswordHash = session.slice(separator + 1);
  var usersJson = PropertiesService.getScriptProperties().getProperty("PORTAL_USERS");
  var users = usersJson ? JSON.parse(usersJson) : {};
  if (!users[username] || !constantTimeEquals_(users[username], sessionPasswordHash)) {
    cache.remove(cacheKey);
    throw new Error("Session expired. Sign in again.");
  }
  return username;
}

function sessionCacheKey_(sessionToken) {
  var token = typeof sessionToken === "string" ? sessionToken : "";
  return "portal-session-" + bytesToHex_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  );
}

function hmacPassword_(password, secret) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(password, secret));
}

function bytesToHex_(bytes) {
  return bytes.map(function(byte) {
    return ("0" + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join("");
}

function constantTimeEquals_(first, second) {
  if (typeof first !== "string" || typeof second !== "string" || first.length !== second.length) {
    return false;
  }
  var difference = 0;
  for (var index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

function normalizeUsername_(username) {
  if (typeof username !== "string") return "";
  var normalized = username.trim().toLowerCase();
  return /^[a-z0-9._-]{3,50}$/.test(normalized) ? normalized : "";
}

function normalizeRecordField_(value, maxLength, required) {
  if (value == null) value = "";
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new Error("Invalid field value");
  }
  var text = String(value).trim();
  if (text.length > maxLength) throw new Error("Field is too long");
  if (required && !text) throw new Error("Room number is required");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}
