package api

import (
	"strings"
	"testing"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
)

func TestEnrollVersionAndHashValidation(t *testing.T) {
	t.Run("validates client version correctly", func(t *testing.T) {
		minVersion := "0.2.0"
		if agent.IsVersionAllowed("0.1.0", minVersion) {
			t.Errorf("expected 0.1.0 < 0.2.0 to be rejected")
		}
		if !agent.IsVersionAllowed("0.2.0", minVersion) {
			t.Errorf("expected 0.2.0 >= 0.2.0 to be allowed")
		}
		if !agent.IsVersionAllowed("0.2.1", minVersion) {
			t.Errorf("expected 0.2.1 >= 0.2.0 to be allowed")
		}
		if !agent.IsVersionAllowed("1.0.0", minVersion) {
			t.Errorf("expected 1.0.0 >= 0.2.0 to be allowed")
		}
	})

	t.Run("validates binary hash matching correctly", func(t *testing.T) {
		allowedHashes := []string{
			"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
			"11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
		}

		isValid := func(hash string) bool {
			reqHash := strings.ToLower(strings.TrimSpace(hash))
			if reqHash == "" {
				return false
			}
			for _, ah := range allowedHashes {
				if strings.EqualFold(ah, reqHash) {
					return true
				}
			}
			return false
		}

		if !isValid("A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2") {
			t.Errorf("expected case-insensitive hash match to succeed")
		}
		if !isValid("11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff") {
			t.Errorf("expected exact hash match to succeed")
		}
		if isValid("unknownhash123") {
			t.Errorf("expected unknown hash to be rejected")
		}
		if isValid("") {
			t.Errorf("expected empty hash to be rejected")
		}
	})
}

