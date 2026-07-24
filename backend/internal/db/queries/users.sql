-- name: CreateUser :one
INSERT INTO users (username, display_name, password_hash, role)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: ListUsers :many
SELECT * FROM users ORDER BY created_at;

-- name: UpdateUserPassword :execrows
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: UpdateUserRole :execrows
UPDATE users SET role = $2 WHERE id = $1;

-- name: DeleteUser :execrows
DELETE FROM users WHERE id = $1;

-- name: TouchUserLastLogin :exec
UPDATE users SET last_login_at = now() WHERE id = $1;
