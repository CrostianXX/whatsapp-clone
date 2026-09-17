# Backup Protocol for WhatsApp Clone Project

Whenever the user asks to "backup" the project, you MUST follow this exact protocol to avoid data loss:

1. **Destination:** The backup MUST be saved to `C:\Users\USER\Downloads\projek wa`.
2. **Incremental Naming:** You MUST check the destination directory to see what the latest backup number is (e.g., `bck1`, `bck2`, `bck8.zip`).
3. **Next Number:** Determine the next available number (e.g., if `bck8.zip` exists, the next one is `bck9.zip` or `bck9` folder).
4. **Method:** 
   - DO NOT USE `robocopy /MIR` on the root of `C:\Users\USER\Downloads\projek wa` as it will delete previous backups. 
   - Instead, either use PowerShell `Compress-Archive` to create a new `.zip` file (e.g., `bck9.zip`), or copy the files into a *new specific subfolder* (e.g., `C:\Users\USER\Downloads\projek wa\bck9`).
5. **No Data Loss:** NEVER overwrite or mirror over existing backups. Keep all previous `bck*` files and folders intact.
