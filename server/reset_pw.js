const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
const hash = bcrypt.hashSync('anonim', 10);
db.run('UPDATE users SET passwordHash = ? WHERE username = ?', [hash, 'anonim'], (err) => {
  if (err) console.error(err);
  else console.log('Password for anonim has been successfully reset to: anonim');
  db.close();
});
