# Secure QIN Hotel Portal deployment

The portal UI and data API now run in Google Apps Script. The portal uses a
server-checked username/password login; do not publish the old static portal on
GitHub Pages as the live application.

## Prepare the Apps Script project

1. Open the spreadsheet and its bound Apps Script project.
2. Replace the project's `Code.gs` with this folder's `Code.gs`.
3. From the project root in PowerShell, run:

   ```powershell
   .\apps-script\BuildPortal.ps1
   ```

4. In the Apps Script project, add an HTML file named `Portal` and paste in
   the generated `apps-script\Portal.html`.
5. In Apps Script **Project Settings > Script Properties**, add:
   - `PORTAL_AUTH_SECRET`: a unique random value with at least 32 random bytes.
   - `PORTAL_ADMIN_EMAIL`: the Google account email of the spreadsheet admin.

   Generate a secret in PowerShell with:

   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
   ```

   Keep this secret private. Do not put it in `Code.gs`, `Portal.html`, or the
   GitHub repository. `PORTAL_USERS` is created automatically when users are
   added and contains keyed password hashes, not plaintext passwords.

## Create staff accounts

Open the spreadsheet as the configured administrator and reload it. Use the
**QIN Portal Admin > Add or reset portal user** menu. Usernames must be 3-50
letters, numbers, dots, underscores, or hyphens; passwords must be at least
12 characters. Adding an existing username resets its password.

Only the Google account listed in `PORTAL_ADMIN_EMAIL` can use this menu.
Share staff credentials through a separate secure channel.

## Deploy

Deploy the Apps Script project as a **Web app**, executing as the spreadsheet
owner. Set access to **Anyone** so staff can reach the login screen without
having spreadsheet access. The public web app serves only the login UI; every
read and write operation requires a short-lived server-validated session.

Update the existing deployment to a new version, then use its `/exec` URL as
the portal URL. Do not use the GitHub Pages URL for the live application.
The data is no longer exposed through JSONP, and unauthenticated direct POSTs
are rejected.

The four data tabs (`ShiftLog`, `RoomStatus`, `LostFound`, and `Maintenance`)
must exist in the bound spreadsheet. `Rooms` is created when the first room is
added. Sessions expire after six hours and are cleared when a user logs out.
