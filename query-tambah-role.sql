ALTER TABLE users ADD COLUMN role character varying(20) DEFAULT 'petugas';

UPDATE users SET role = 'admin' WHERE email LIKE '%admin%';