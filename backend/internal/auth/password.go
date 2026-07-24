package auth

import "golang.org/x/crypto/bcrypt"

// dummyHash is a valid bcrypt hash used only to spend the same time as a real
// comparison when the user does not exist, so login timing can't reveal which
// usernames are valid. Computed once at startup.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("timing-equalizer"), bcrypt.DefaultCost)

// HashPassword returns a bcrypt hash suitable for storage.
func HashPassword(plain string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword reports whether plain matches the stored bcrypt hash.
func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// DummyCompare runs a bcrypt comparison against a fixed hash. Call it on the
// "user not found" path so login costs the same whether or not the user exists.
func DummyCompare(plain string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(plain))
}
