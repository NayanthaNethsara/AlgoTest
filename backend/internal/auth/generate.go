package auth

import (
	"crypto/rand"
	"math/big"
)

// Ambiguous characters (0/O, 1/l/I) are omitted so handed-out passwords are
// easy to read and type.
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

// GeneratePassword returns a random password of length n from a readable alphabet.
func GeneratePassword(n int) string {
	b := make([]byte, n)
	for i := range b {
		idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(passwordAlphabet))))
		b[i] = passwordAlphabet[idx.Int64()]
	}
	return string(b)
}
